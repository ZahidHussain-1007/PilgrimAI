"""Hygiene gates: useless booking links never reach evidence, dead LLM keys
are revoked for the process instead of failing on every call."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.agents import accommodation
from app.services import llm as llm_mod


# ---------------------------------------------------------------------------
# booking link filter
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "url,keep",
    [
        ("https://www.google.com/travel/hotels", False),
        ("https://www.google.com/travel/hotels/", False),
        ("https://www.google.com", False),
        ("https://www.booking.com", False),
        ("https://www.makemytrip.com/", False),
        ("https://www.goibibo.com/", False),
        ("https://www.goibibo.com/hotels", False),
        # official homepages are dropped here but surface via `website`
        ("https://sannidhiemerald.com/", False),
        # a bare homepage WITH a query is a real target (map search)
        ("https://maps.google.com/?q=Sri+Mahalakshmi+Family+Rooms", True),
        ("https://www.booking.com/hotel/in/o-ekashila-lodge.html", True),
        ("https://www.oyorooms.com/323202/", True),
        ("https://www.google.co.in/travel/hotels/entity/ChoIxY334", True),
        ("https://www.makemytrip.com/hotels/area-budget-hotels-in-yadagirigutta.html", True),
        ("https://www.google.com/travel/hotels?q=Yadadri", True),
        ("not-a-url", False),
    ],
)
def test_specific_booking_url(url: str, keep: bool):
    assert accommodation._is_specific_booking_url(url) is keep


def test_norm_hotel_drops_generic_links_keeps_specific():
    record = accommodation._norm_hotel(
        {
            "hotel_name": "Sri Mahalakshmi Family Rooms",
            "booking_links": {
                "Google Hotels": "https://www.google.com/travel/hotels",
                "Booking": "https://www.booking.com/hotel/in/x.html",
            },
        },
        {},
    )
    assert "Google Hotels" not in record["booking_links"]
    assert record["booking_links"] == {
        "Booking": "https://www.booking.com/hotel/in/x.html",
    }


# ---------------------------------------------------------------------------
# dead-key revocation
# ---------------------------------------------------------------------------

class _AuthErr(Exception):
    status_code = 401


def test_dead_key_is_revoked_and_skipped(monkeypatch):
    constructed: list[str] = []

    class FakeGroq:
        def __init__(self, api_key: str):
            constructed.append(api_key)
            self.api_key = api_key

            class _Completions:
                def create(self, **_kwargs):
                    if api_key == "dead":
                        raise _AuthErr("Invalid API Key")
                    content = '{"reply": "ok"}'
                    return SimpleNamespace(
                        choices=[
                            SimpleNamespace(
                                message=SimpleNamespace(content=content),
                            )
                        ],
                    )

            self.chat = SimpleNamespace(completions=_Completions())

    monkeypatch.setattr(llm_mod, "Groq", FakeGroq)
    monkeypatch.setattr(llm_mod.settings, "groq_api_key_1", "dead")
    monkeypatch.setattr(llm_mod.settings, "groq_api_key_2", "good")
    llm_mod._revoked_keys.clear()

    schema = {
        "type": "object",
        "properties": {"reply": {"type": "string"}},
        "required": ["reply"],
    }

    # first call: dead key tried once, then rotated to good
    out = llm_mod.complete_json(
        system="s", payload={}, schema_name="t", schema=schema,
    )
    assert out == {"reply": "ok"}
    assert "dead" in llm_mod._revoked_keys
    assert constructed == ["dead", "good"]

    # second call: dead key must NOT be constructed again
    llm_mod.complete_json(
        system="s", payload={}, schema_name="t", schema=schema,
    )
    assert constructed == ["dead", "good", "good"]
    llm_mod._revoked_keys.clear()


# ---------------------------------------------------------------------------
# module-level logging in chat (a function-local `import logging` makes every
# >30s request crash with UnboundLocalError after the answer is composed)
# ---------------------------------------------------------------------------

def test_chat_has_no_function_local_logging():
    from app.api import chat as chat_mod

    assert "logging" in vars(chat_mod), "chat.py must import logging at module level"
    assert "logging" not in chat_mod.chat.__code__.co_varnames, (
        "import logging inside chat() shadows the module name and crashes "
        "the slow-request log line with UnboundLocalError"
    )
