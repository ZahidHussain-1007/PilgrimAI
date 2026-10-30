"""Reply typography repairs: unit spacing + range glue (validator-safe)."""
from __future__ import annotations

from app.pipeline.compose import _repair_range_glue, _repair_unit_spacing


def test_unit_spacing_inserts_single_space():
    assert _repair_unit_spacing("32.71minutes") == "32.71 minutes"
    assert _repair_unit_spacing("22km") == "22 km"
    assert _repair_unit_spacing("takes 2hours") == "takes 2 hours"
    assert _repair_unit_spacing("3nights in 2rooms") == "3 nights in 2 rooms"


def test_unit_spacing_noop_when_already_correct():
    text = "about 33 minutes and 22.18 km for 2 people"
    assert _repair_unit_spacing(text) == text


def test_unit_spacing_never_touches_digits_or_urls():
    assert _repair_unit_spacing("₹116.15 per litre at 14.0 km/l") == (
        "₹116.15 per litre at 14.0 km/l"
    )
    # URLs must stay byte-exact even when they contain digit+unit glue
    url = "https://example.com/trip?q=22km"
    assert _repair_unit_spacing(url) == url
    text = f"See {url} for 22km details"
    assert _repair_unit_spacing(text) == f"See {url} for 22 km details"


def test_range_glue_still_works_and_spacing_chains():
    repaired = _repair_unit_spacing(_repair_range_glue("₹700₹4500 for 2nights"))
    assert repaired == "₹700–₹4500 for 2 nights"


def test_compose_answer_receives_history_and_history_rule(monkeypatch):
    """v8: composer gets the conversation history (so it never re-asks an
    established city/place) and the rule enforcing it."""
    from app.pipeline import compose as compose_module

    captured: dict = {}

    def fake_complete_json(*, system, payload, schema_name, schema):
        captured["system"] = system
        captured["payload"] = payload
        return {"reply": "ok", "follow_ups": ["a", "b", "c"]}

    monkeypatch.setattr(compose_module, "complete_json", fake_complete_json)

    compose_module.answer(
        question="Best tourist places near Birla Mandir",
        language="en",
        results=[],
        history=[
            {
                "user": "i want to go to birla mandir",
                "reply": "Birla Mandir Hyderabad ...",
            }
        ],
    )

    assert captured["payload"]["history"][0]["user"] == (
        "i want to go to birla mandir"
    )
    assert "19. USE THE CONVERSATION HISTORY" in captured["system"]
    assert "internal error identifiers" in captured["system"]


def test_phone_numbers_after_newlines_are_grounded():
    """Regression: json.dumps-escaped newlines used to hide line-start
    numbers (040-2323-5081) from the allowed set, falsely flagging
    legitimate replies as hallucinations -> DEGRADED dumps."""
    from app.pipeline.validator import find_missing_numbers

    results = [
        {
            "question": "contact",
            "evidence": [
                {
                    "source": "temple_rag",
                    "kind": "chunk",
                    "text": "Phone Numbers:\n040-2323-5081\n040-2324-1067\n"
                    "Email: birlasc@gmail.com\n"
                    "Address: Hill Fort Road ... 500063, India",
                }
            ],
        }
    ]
    draft = "Phone: 040-2323-5081 and 040-2324-1067, pincode 500063."
    assert find_missing_numbers(draft, results) == []
    # a genuinely missing number is still caught
    assert find_missing_numbers("Call 040-2323-5099.", results) == ["5099"]
