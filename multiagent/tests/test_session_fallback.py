"""Session store must keep working when Redis is unreachable (Windows dev).

Covers: round-trip save/get, delete, exists/touch, TTL expiry, and reload
from the JSON fallback file (simulated restart).
"""
from __future__ import annotations

import time

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.services import session as session_mod


class _BrokenRedis:
    """Every operation raises, like a refused Redis connection."""

    def __getattr__(self, _name):
        def _boom(*_args, **_kwargs):
            raise RedisConnectionError("redis down (test)")

        return _boom


@pytest.fixture()
def fallback(tmp_path, monkeypatch):
    monkeypatch.setattr(session_mod, "redis_client", _BrokenRedis())
    monkeypatch.setattr(session_mod, "FALLBACK_FILE", tmp_path / "sessions.json")
    monkeypatch.setattr(session_mod, "_fallback_store", {})
    monkeypatch.setattr(session_mod, "_fallback_loaded", False)
    monkeypatch.setattr(session_mod, "_fallback_warned", False)
    return session_mod


def test_save_and_get_roundtrip_with_redis_down(fallback):
    assert fallback.save_session("s1", {"history": [{"user": "hi"}]}) is True
    state = fallback.get_session("s1")
    assert state == {"history": [{"user": "hi"}]}


def test_delete_removes_fallback_session(fallback):
    fallback.save_session("s1", {"history": []})
    assert fallback.delete_session("s1") is True
    assert fallback.get_session("s1") is None


def test_exists_and_touch(fallback):
    assert fallback.session_exists("s1") is False
    fallback.save_session("s1", {"history": []})
    assert fallback.session_exists("s1") is True
    assert fallback.touch_session("s1") is True
    assert fallback.touch_session("missing") is False


def test_expired_entry_is_dropped(fallback):
    key = fallback._session_key("old")
    fallback._fallback_store[key] = (time.time() - 1, '{"history": []}')
    fallback._persist_fallback()
    assert fallback.get_session("old") is None
    assert key not in fallback._fallback_store


def test_reload_from_file_after_restart(fallback):
    fallback.save_session("s1", {"history": [{"user": "yo"}]})
    # simulate process restart: memory empty, file remains
    fallback._fallback_store.clear()
    fallback._fallback_loaded = False
    assert fallback.get_session("s1") == {"history": [{"user": "yo"}]}


def test_fallback_file_is_json_with_expiry(fallback):
    fallback.save_session("s1", {"history": []})
    raw = fallback.FALLBACK_FILE.read_text(encoding="utf-8")
    assert '"session:s1"' in raw
