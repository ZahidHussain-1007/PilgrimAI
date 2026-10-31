"""Single LLM client wrapper: key rotation, strict JSON schema, temperature 0."""
from __future__ import annotations

import json
import logging
import threading
from typing import Any

from groq import Groq

from app.core.config import settings

logger = logging.getLogger(__name__)


class LLMUnavailable(RuntimeError):
    """Raised when every configured LLM key failed or none are configured."""


# Keys that answered 401 are dead for this process: never retry them.
_revoked_keys: set[str] = set()

# Round-robin cursor (v16): every incoming call starts at the NEXT key so
# load spreads key1 -> key2 -> key3 -> key1 ...; within one call, a failed
# key fails over to the next one.
_rotation_offset = 0
_rotation_lock = threading.Lock()


def _is_auth_failure(exc: Exception) -> bool:
    if getattr(exc, "status_code", None) == 401:
        return True
    return type(exc).__name__ == "AuthenticationError"


def strict_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Force Groq strict-mode requirements recursively:
    additionalProperties=false + required = all properties, at every level."""
    if not isinstance(schema, dict):
        return schema

    schema = dict(schema)

    if schema.get("type") == "object":
        properties = schema.get("properties", {})
        schema["additionalProperties"] = False
        schema["required"] = list(properties.keys())
        schema["properties"] = {
            key: strict_schema(value)
            for key, value in properties.items()
        }

    if "items" in schema:
        schema["items"] = strict_schema(schema["items"])

    if "$defs" in schema and isinstance(schema["$defs"], dict):
        schema["$defs"] = {
            key: strict_schema(value)
            for key, value in schema["$defs"].items()
        }

    for key in ("anyOf", "oneOf", "allOf"):
        if key in schema and isinstance(schema[key], list):
            schema[key] = [strict_schema(item) for item in schema[key]]

    return schema


def _configured_keys() -> list[str]:
    return [
        key.strip()
        for key in (
            settings.groq_api_key_1,
            settings.groq_api_key_2,
            settings.groq_api_key_3,
        )
        if key and key.strip()
    ]


def _clients() -> list[Groq]:
    """Round-robin order starting at the shared cursor; revoked (401) keys
    are dropped. Advances the cursor so the NEXT call starts elsewhere."""
    global _rotation_offset
    keys = [k for k in _configured_keys() if k not in _revoked_keys]
    if not keys:
        return []
    with _rotation_lock:
        start = _rotation_offset % len(keys)
        _rotation_offset = (start + 1) % len(keys)
    ordered = keys[start:] + keys[:start]
    return [Groq(api_key=key) for key in ordered]


def complete_json(
    *,
    system: str,
    payload: dict[str, Any],
    schema_name: str,
    schema: dict[str, Any],
    model: str | None = None,
) -> dict[str, Any]:
    """One strict-JSON completion. Rotates keys on failure.
    Raises LLMUnavailable when no key works."""
    clients = _clients()

    if not clients:
        if _revoked_keys:
            raise LLMUnavailable(
                "all Groq keys were revoked after 401 auth failures - "
                "replace GROQ_API_KEY_1/2/3 in multiagent/.env"
            )
        raise LLMUnavailable("no Groq API keys configured")

    body = strict_schema(schema)
    last_error: Exception | None = None

    for index, client in enumerate(clients, start=1):
        try:
            response = client.chat.completions.create(
                model=model or settings.groq_model,
                messages=[
                    {"role": "system", "content": system},
                    {
                        "role": "user",
                        "content": json.dumps(payload, ensure_ascii=False),
                    },
                ],
                temperature=0,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name": schema_name,
                        "strict": True,
                        "schema": body,
                    },
                },
            )

            content = response.choices[0].message.content

            if not content:
                raise RuntimeError("LLM returned an empty response")

            parsed = json.loads(content)

            if not isinstance(parsed, dict):
                raise RuntimeError("LLM returned a non-object JSON payload")

            return parsed

        except Exception as exc:  # noqa: BLE001 - rotate keys on any failure
            last_error = exc
            logger.warning(
                "LLM attempt %d failed: %s: %s",
                index,
                type(exc).__name__,
                exc,
            )
            if _is_auth_failure(exc):
                # Dead key: stop paying its failed round-trip on every call.
                try:
                    _revoked_keys.add(str(client.api_key))
                except Exception:  # noqa: BLE001 - best effort
                    pass
            if index < len(clients):
                continue

    raise LLMUnavailable(
        f"all configured Groq keys failed: {last_error}"
    ) from last_error
