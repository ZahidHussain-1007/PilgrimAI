"""Session store: Redis primary, automatic local fallback.

Windows/dev machines often have no Redis. The app must still work:
when Redis is unreachable, sessions are kept in memory AND mirrored to a
small JSON file (multiagent/.session_fallback.json) so conversation
history survives uvicorn restarts. When Redis is up, it is authoritative.
"""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path

import redis
from redis.exceptions import RedisError

from app.core.config import settings


logger = logging.getLogger(__name__)


SESSION_PREFIX = "session:"
SESSION_TTL_SECONDS = 60 * 60 * 24

# Local fallback store (survives restarts, per-machine).
FALLBACK_FILE = Path(__file__).resolve().parents[2] / ".session_fallback.json"


redis_client = redis.Redis(
    host=settings.redis_host,
    port=settings.redis_port,
    decode_responses=True,
    socket_connect_timeout=2,
    socket_timeout=2,
)

# key -> (epoch_seconds_expiry, payload_json)
_fallback_store: dict[str, tuple[float, str]] = {}
_fallback_loaded = False
_fallback_warned = False


def _session_key(session_id: str) -> str:
    return f"{SESSION_PREFIX}{session_id}"


def _warn_fallback_once(action: str, exc: Exception) -> None:
    global _fallback_warned
    if _fallback_warned:
        return
    _fallback_warned = True
    logger.warning(
        "Redis %s failed (%s: %s). Using local session store at %s - "
        "sessions work on this machine only; start Redis for shared caches.",
        action,
        type(exc).__name__,
        exc,
        FALLBACK_FILE,
    )


def _load_fallback() -> None:
    global _fallback_loaded
    if _fallback_loaded:
        return
    _fallback_loaded = True
    try:
        if not FALLBACK_FILE.exists():
            return
        data = json.loads(FALLBACK_FILE.read_text(encoding="utf-8"))
        now = time.time()
        if not isinstance(data, dict):
            return
        for key, item in data.items():
            try:
                expires, payload = item
                if float(expires) > now and isinstance(payload, str):
                    _fallback_store[str(key)] = (float(expires), payload)
            except (TypeError, ValueError):
                continue
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("Could not load session fallback file: %s", exc)


def _persist_fallback() -> None:
    try:
        FALLBACK_FILE.write_text(
            json.dumps(
                {k: [exp, payload] for k, (exp, payload) in _fallback_store.items()},
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.debug("Could not persist session fallback file: %s", exc)


def _fallback_get(key: str) -> str | None:
    _load_fallback()
    entry = _fallback_store.get(key)
    if entry is None:
        return None
    expires, payload = entry
    if expires <= time.time():
        _fallback_store.pop(key, None)
        _persist_fallback()
        return None
    return payload


def save_session(
    session_id: str,
    state: dict,
) -> bool:
    key = _session_key(session_id)
    payload = json.dumps(state, ensure_ascii=False)
    try:
        redis_client.set(key, payload, ex=SESSION_TTL_SECONDS)
        return True
    except (RedisError, OSError) as exc:
        _warn_fallback_once("save", exc)
        _load_fallback()
        _fallback_store[key] = (time.time() + SESSION_TTL_SECONDS, payload)
        _persist_fallback()
        return True


def get_session(
    session_id: str,
) -> dict | None:
    key = _session_key(session_id)
    data = None
    try:
        data = redis_client.get(key)
    except (RedisError, OSError) as exc:
        _warn_fallback_once("read", exc)

    if data:
        try:
            return json.loads(data)
        except json.JSONDecodeError as exc:
            logger.error("Invalid session data for %s: %s", session_id, exc)
            return None

    # Redis reachable but empty, or Redis down → check local fallback.
    payload = _fallback_get(key)
    if payload is None:
        return None
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return None


def delete_session(
    session_id: str,
) -> bool:
    key = _session_key(session_id)
    try:
        redis_client.delete(key)
    except (RedisError, OSError) as exc:
        _warn_fallback_once("delete", exc)
    _load_fallback()
    if key in _fallback_store:
        _fallback_store.pop(key, None)
        _persist_fallback()
    return True


def session_exists(
    session_id: str,
) -> bool:
    key = _session_key(session_id)
    try:
        if redis_client.exists(key):
            return True
    except (RedisError, OSError) as exc:
        _warn_fallback_once("exists", exc)
    return _fallback_get(key) is not None


def touch_session(
    session_id: str,
) -> bool:
    key = _session_key(session_id)
    try:
        if redis_client.expire(key, SESSION_TTL_SECONDS):
            return True
    except (RedisError, OSError) as exc:
        _warn_fallback_once("touch", exc)
    payload = _fallback_get(key)
    if payload is not None:
        _fallback_store[key] = (time.time() + SESSION_TTL_SECONDS, payload)
        _persist_fallback()
        return True
    return False
