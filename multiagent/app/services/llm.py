"""Single LLM client wrapper: key rotation, strict JSON schema, temperature 0."""
from __future__ import annotations

import json
import logging
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable

import httpx
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

# v18.1: rate limits are PER PROVIDER (Groq = per ORGANIZATION — every
# GROQ_API_KEY_* in one account shares a single tokens/day tank, so
# sibling keys are GUARANTEED to fail together). After a 429 we cool the
# whole provider down instead of hammering its siblings on every request.
_provider_cooldown: dict[str, float] = {}
_COOLDOWN_SECONDS = 600.0


def _provider_key(entry: KeyEntry) -> str:
    if entry.kind == "groq":
        return "groq"
    return entry.base_url or entry.label


def _is_rate_limit(exc: Exception) -> bool:
    if getattr(exc, "status_code", None) == 429:
        return True
    response = getattr(exc, "response", None)
    if response is not None and getattr(response, "status_code", None) == 429:
        return True
    if type(exc).__name__ == "RateLimitError":
        return True
    text = str(exc).lower()
    return "rate limit" in text or "rate_limit" in text


def _is_auth_failure(exc: Exception) -> bool:
    if getattr(exc, "status_code", None) == 401:
        return True
    response = getattr(exc, "response", None)
    if response is not None and getattr(response, "status_code", None) == 401:
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


@dataclass(frozen=True)
class KeyEntry:
    """One key in the shared round-robin pool (v16.1: ANY provider)."""

    label: str            # e.g. "groq_1", "openrouter", "google" — never the secret
    kind: str             # "groq" | "openai_compat"
    api_key: str
    model: str
    base_url: str | None = None


def _configured_keys() -> list[KeyEntry]:
    """Every key found in multiagent/.env joins ONE pool:
    GROQ_API_KEY_1..6 (any count), openaikey (OpenRouter),
    google_ai_stdio (Gemini). Round-robin spans all of them."""
    entries: list[KeyEntry] = []
    for index in range(1, 7):
        key = getattr(settings, f"groq_api_key_{index}", None)
        if key and key.strip():
            entries.append(
                KeyEntry(
                    label=f"groq_{index}",
                    kind="groq",
                    api_key=key.strip(),
                    model=settings.groq_model,
                )
            )
    if settings.openaikey and settings.openaikey.strip():
        entries.append(
            KeyEntry(
                label="openrouter",
                kind="openai_compat",
                api_key=settings.openaikey.strip(),
                model=settings.openrouter_model,
                base_url="https://openrouter.ai/api/v1",
            )
        )
    if settings.google_ai_stdio and settings.google_ai_stdio.strip():
        entries.append(
            KeyEntry(
                label="google",
                kind="openai_compat",
                api_key=settings.google_ai_stdio.strip(),
                model=settings.google_model,
                base_url="https://generativelanguage.googleapis.com/v1beta/openai",
            )
        )
    return entries


def _pool() -> list[KeyEntry]:
    """Round-robin order starting at the shared cursor; revoked (401) keys
    are dropped. Advances the cursor so the NEXT call starts elsewhere."""
    global _rotation_offset
    keys = [e for e in _configured_keys() if e.api_key not in _revoked_keys]
    if not keys:
        return []
    now = time.monotonic()
    for provider in [pk for pk, until in _provider_cooldown.items() if until <= now]:
        _provider_cooldown.pop(provider, None)
    fresh = [
        e for e in keys if _provider_key(e) not in _provider_cooldown
    ]
    # never go empty while everything is cooling — better to try than 503
    keys = fresh or keys
    with _rotation_lock:
        start = _rotation_offset % len(keys)
        _rotation_offset = (start + 1) % len(keys)
    return keys[start:] + keys[:start]


def _openai_compat_call(entry: KeyEntry, body: dict[str, Any]) -> str:
    """POST /chat/completions for OpenRouter / Gemini (OpenAI-compatible).
    If the provider rejects json_schema (400/422), retry once with
    json_object + the schema inlined into the system prompt."""
    url = f"{entry.base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {entry.api_key}",
        "Content-Type": "application/json",
    }

    def _post(payload: dict[str, Any]) -> httpx.Response:
        return httpx.post(url, headers=headers, json=payload, timeout=90.0)

    response = _post(body)
    if response.status_code in (400, 422) and "response_format" in body:
        messages = [
            m for m in body.get("messages", []) if m.get("role") == "system"
        ]
        schema_hint = json.dumps(
            body.get("response_format", {}), ensure_ascii=False
        )
        if messages:
            messages = [
                {**messages[0],
                 "content": str(messages[0].get("content", ""))
                 + "\n\nReturn ONLY a JSON object satisfying: " + schema_hint}
            ] + [m for m in body.get("messages", []) if m.get("role") != "system"]
        fallback = {
            **body,
            "messages": messages,
            "response_format": {"type": "json_object"},
        }
        response = _post(fallback)
    if response.status_code >= 400:
        error = httpx.HTTPStatusError(
            f"{entry.label} HTTP {response.status_code}",
            request=response.request,
            response=response,
        )
        raise error
    data = response.json()
    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError(f"{entry.label} returned a malformed payload") from exc
    if not content:
        raise RuntimeError(f"{entry.label} returned an empty response")
    return str(content)


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
    pool = _pool()

    if not pool:
        if _revoked_keys:
            raise LLMUnavailable(
                "all LLM keys were revoked after 401 auth failures - "
                "replace the keys in multiagent/.env"
            )
        raise LLMUnavailable("no LLM API keys configured")

    body = strict_schema(schema)
    last_error: Exception | None = None
    wanted_model = model  # per-call override only applies to Groq entries

    for index, entry in enumerate(pool, start=1):
        provider = _provider_key(entry)
        if provider in _provider_cooldown:
            other_provider_left = any(
                _provider_key(other) != provider
                and _provider_key(other) not in _provider_cooldown
                for other in pool[index:]
            )
            if other_provider_left:
                logger.info(
                    "LLM attempt %d (%s) skipped: %s cooling down after "
                    "rate limit (limits are org/provider-wide)",
                    index, entry.label, provider,
                )
                continue
        try:
            if entry.kind == "groq":
                client = Groq(api_key=entry.api_key)
                response = client.chat.completions.create(
                    model=wanted_model or entry.model,
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
            else:
                content = _openai_compat_call(
                    entry,
                    {
                        "model": entry.model,
                        "messages": [
                            {"role": "system", "content": system},
                            {
                                "role": "user",
                                "content": json.dumps(payload, ensure_ascii=False),
                            },
                        ],
                        "temperature": 0,
                        "response_format": {
                            "type": "json_schema",
                            "json_schema": {
                                "name": schema_name,
                                "strict": True,
                                "schema": body,
                            },
                        },
                    },
                )

            parsed = json.loads(content)

            if not isinstance(parsed, dict):
                raise RuntimeError("LLM returned a non-object JSON payload")

            return parsed

        except Exception as exc:  # noqa: BLE001 - rotate keys on any failure
            last_error = exc
            logger.warning(
                "LLM attempt %d (%s) failed: %s: %s",
                index,
                entry.label,
                type(exc).__name__,
                exc,
            )
            if _is_auth_failure(exc):
                # Dead key: stop paying its failed round-trip on every call.
                _revoked_keys.add(entry.api_key)
            if _is_rate_limit(exc) and provider not in _provider_cooldown:
                _provider_cooldown[provider] = (
                    time.monotonic() + _COOLDOWN_SECONDS
                )
                logger.warning(
                    "provider %s rate-limited — cooling it down for %ds "
                    "instead of hammering sibling keys (same-org quota)",
                    provider, int(_COOLDOWN_SECONDS),
                )
            if index < len(pool):
                continue

    raise LLMUnavailable(
        f"all configured LLM keys failed: {last_error}"
    ) from last_error
