"""v16 — Groq key round-robin + failover (GROQ_API_KEY_1/2/3).

Contract:
  * each incoming call STARTS at the next key (k1 -> k2 -> k3 -> k1 …),
  * a failed key fails over to the next key WITHIN the call,
  * 401 keys are revoked for the process, transient failures are not,
  * all keys down -> LLMUnavailable (never a silent hang).
"""
from __future__ import annotations

import time

import pytest

from app.services import llm as llm_mod
from app.services.llm import LLMUnavailable, complete_json

SCHEMA = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]}
_USED: list[str] = []
_BEHAVIOUR: dict[str, object] = {}


class _Msg:
    content = '{"ok": true}'


class _Choice:
    message = _Msg()


class _Resp:
    choices = [_Choice()]


class FakeGroq:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.chat = self
        self.completions = self

    def create(self, **kwargs):  # noqa: ANN003
        _USED.append(str(self.api_key))
        behaviour = _BEHAVIOUR.get(str(self.api_key), "ok")
        if isinstance(behaviour, Exception):
            raise behaviour
        if behaviour == "empty":
            class Empty(_Resp):
                class _M:
                    content = ""
                class _C:
                    message = _M()
            return type("R", (), {"choices": [Empty._C()]})()
        return _Resp()


class Fake429(Exception):
    status_code = 429


class Fake401(Exception):
    status_code = 401


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    _USED.clear()
    _BEHAVIOUR.clear()
    llm_mod._revoked_keys.clear()
    llm_mod._rotation_offset = 0
    monkeypatch.setattr(llm_mod, "Groq", FakeGroq)
    # v18.1: hermetic — a tester's real .env (extra groq keys, openaikey,
    # google_ai_stdio) must not change what the pool looks like here.
    monkeypatch.setattr(llm_mod.settings, "groq_api_key_1", "k1")
    monkeypatch.setattr(llm_mod.settings, "groq_api_key_2", "k2")
    monkeypatch.setattr(llm_mod.settings, "groq_api_key_3", "k3")
    monkeypatch.setattr(llm_mod.settings, "groq_api_key_4", None)
    monkeypatch.setattr(llm_mod.settings, "groq_api_key_5", None)
    monkeypatch.setattr(llm_mod.settings, "groq_api_key_6", None)
    monkeypatch.setattr(llm_mod.settings, "openaikey", None)
    monkeypatch.setattr(llm_mod.settings, "google_ai_stdio", None)
    llm_mod._provider_cooldown.clear()
    yield
    llm_mod._provider_cooldown.clear()


def _call():
    return complete_json(
        system="sys",
        payload={"q": "x"},
        schema_name="t",
        schema=SCHEMA,
    )


def test_third_key_is_configured_and_used_in_rotation():
    assert len(llm_mod._configured_keys()) == 3
    _call(); _call(); _call(); _call()
    # one successful attempt per call; the START key rotates
    # k1 -> k2 -> k3 -> k1  (load spreads across all three keys)
    assert _USED == ["k1", "k2", "k3", "k1"], _USED


def test_failed_key_fails_over_to_next_within_the_call():
    _BEHAVIOUR["k1"] = Fake429("rate limited")
    result = _call()
    assert result == {"ok": True}
    assert _USED[:2] == ["k1", "k2"], _USED
    # transient 429 must NOT revoke the key
    assert "k1" not in llm_mod._revoked_keys


def test_401_revokes_key_for_subsequent_calls():
    _BEHAVIOUR["k1"] = Fake401("bad key")
    _call()          # k1 fails -> k2 succeeds -> k1 revoked
    assert "k1" in llm_mod._revoked_keys
    _USED.clear()
    # cursor now points at k2; k1 must never appear again
    _call(); _call(); _call()
    assert "k1" not in _USED, _USED
    assert set(_USED) <= {"k2", "k3"}


def test_all_keys_down_raises_instead_of_hanging():
    for key in ("k1", "k2", "k3"):
        _BEHAVIOUR[key] = Fake429("all down")
    with pytest.raises(LLMUnavailable):
        _call()


def test_empty_response_fails_over():
    _BEHAVIOUR["k1"] = "empty"
    assert _call() == {"ok": True}
    assert _USED[:2] == ["k1", "k2"]


def test_six_key_mixed_pool_rotates(monkeypatch):
    """3 Groq + OpenRouter + Google + a 4th Groq key = one pool (v16.1)."""
    monkeypatch.setattr(llm_mod.settings, "groq_api_key_4", "k4")
    monkeypatch.setattr(llm_mod.settings, "openaikey", "or1")
    monkeypatch.setattr(llm_mod.settings, "google_ai_stdio", "g1")
    labels = [e.label for e in llm_mod._configured_keys()]
    assert labels == ["groq_1", "groq_2", "groq_3", "groq_4", "openrouter", "google"]

    # route compat entries through a fake transport
    compat_used: list[str] = []

    def fake_compat(entry, body):
        compat_used.append(entry.label)
        return '{"ok": true}'

    monkeypatch.setattr(llm_mod, "_openai_compat_call", fake_compat)

    # rotate across SIX keys: start advances one per call
    _call(); _call(); _call(); _call(); _call(); _call(); _call()
    # starts: groq1, groq2, groq3, groq4, openrouter, google, groq1
    assert _USED == ["k1", "k2", "k3", "k4", "k1"], _USED
    assert compat_used == ["openrouter", "google"], compat_used


def test_compat_key_failure_fails_over_to_groq(monkeypatch):
    monkeypatch.setattr(llm_mod.settings, "openaikey", "or1")
    llm_mod._rotation_offset = 4          # next start = openrouter

    def fake_compat(entry, body):
        raise RuntimeError("provider down")

    monkeypatch.setattr(llm_mod, "_openai_compat_call", fake_compat)
    result = _call()
    assert result == {"ok": True}
    assert _USED == ["k1"], _USED         # failed openrouter -> groq_1


# --------------------------------------------- v18.1 provider cooldown
def _compat_pipeline(monkeypatch, used: list[str]):
    def fake_compat(entry, body):
        used.append(entry.label)
        return '{"ok": true}'

    monkeypatch.setattr(llm_mod, "_openai_compat_call", fake_compat)


def test_rate_limit_jumps_to_next_provider_not_sibling_keys(monkeypatch):
    """Groq 429 = org-wide quota — groq_2/groq_3 share the SAME tank, so
    the pool must jump straight to OpenRouter instead of re-failing."""
    monkeypatch.setattr(llm_mod.settings, "openaikey", "or1")
    compat_used: list[str] = []
    _compat_pipeline(monkeypatch, compat_used)

    _BEHAVIOUR["k1"] = Fake429("rate limit reached")
    result = _call()
    assert result == {"ok": True}
    # groq_1 failed, sibling groq_2 was SKIPPED, OpenRouter served it
    assert _USED == ["k1"], _USED
    assert compat_used == ["openrouter"], compat_used


def test_cooldown_filters_groq_from_pool_until_window_expires(monkeypatch):
    monkeypatch.setattr(llm_mod.settings, "openaikey", "or1")
    compat_used: list[str] = []
    _compat_pipeline(monkeypatch, compat_used)

    _BEHAVIOUR["k1"] = Fake429("rate limit reached")
    _call()  # sets groq cooldown
    assert "groq" in llm_mod._provider_cooldown

    # during cooldown: NO groq attempt at all, compat serves every call
    _USED.clear(); compat_used.clear()
    _call(); _call()
    assert [u for u in _USED if u.startswith("k")] == [], _USED
    assert compat_used == ["openrouter", "openrouter"]

    # window expires (10 min): groq rejoins the rotation
    for pk in list(llm_mod._provider_cooldown):
        llm_mod._provider_cooldown[pk] = time.monotonic() - 1
    _BEHAVIOUR["k1"] = "ok"
    _USED.clear(); compat_used.clear()
    _call()
    assert any(u.startswith("k") for u in _USED), _USED


def test_groq_only_pool_still_tries_siblings(monkeypatch):
    """No other provider configured → sibling keys MAY come from a second
    org, so they must still be tried (existing failover contract)."""
    _BEHAVIOUR["k1"] = Fake429("rate limit reached")
    result = _call()
    assert result == {"ok": True}
    assert _USED[:2] == ["k1", "k2"], _USED


def test_non_rate_errors_do_not_trigger_cooldown():
    _BEHAVIOUR["k1"] = RuntimeError("connection reset")
    assert _call() == {"ok": True}
    assert _USED[:2] == ["k1", "k2"]
    assert "groq" not in llm_mod._provider_cooldown
