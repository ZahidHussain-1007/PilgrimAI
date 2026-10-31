"""v16 — Groq key round-robin + failover (GROQ_API_KEY_1/2/3).

Contract:
  * each incoming call STARTS at the next key (k1 -> k2 -> k3 -> k1 …),
  * a failed key fails over to the next key WITHIN the call,
  * 401 keys are revoked for the process, transient failures are not,
  * all keys down -> LLMUnavailable (never a silent hang).
"""
from __future__ import annotations

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
    monkeypatch.setattr(llm_mod.settings, "groq_api_key_1", "k1")
    monkeypatch.setattr(llm_mod.settings, "groq_api_key_2", "k2")
    monkeypatch.setattr(llm_mod.settings, "groq_api_key_3", "k3")
    yield


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
