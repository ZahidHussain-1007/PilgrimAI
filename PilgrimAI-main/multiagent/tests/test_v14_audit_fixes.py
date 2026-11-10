"""v14 — external-audit regression pack (79-finding review of e48f93b).

Covers the verified blockers: D03 emergency schema adapters, D01 anchor
consistency, D06 hard pure-veg, D07 price/AC constraints, D04 localized
safety replies, D05 safety-before-session, C17 question numbers,
C16 structured render, C08/C09 money parsing, R02 dress_code,
R01 evidence currency.
"""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

from app.agents import accommodation, budget, travel
from app.pipeline import safety, validator

PROJECT_ROOT = Path(__file__).resolve().parents[1]


# --------------------------------------------------------------------- D03
def test_emergency_schema_police_fire_ambulance_are_visible():
    """police uses police_station_name, fire fire_station_name, ambulance
    service_name — the old name-only gate dropped them all (audit D03)."""
    record = json.loads(
        (PROJECT_ROOT / "data" / "emergency" / "T1.json").read_text(
            encoding="utf-8"
        )
    )
    travel._emergency_index = {"T0001": record}

    # synthetic phone-bearing ambulance record must be visible (D03)
    record["emergency"]["ambulance_services"] = [
        {
            "service_name": "108 Ambulance Hub",
            "phone": "108",
            "coverage_area": "Karimnagar",
        }
    ]
    evidence, skipped = travel._emergency_evidence(
        "T0001", "emergency hospital police fire ambulance", None
    )
    travel._emergency_index = None
    categories = {e.get("category") for e in evidence}
    assert "police" in categories, "police records dropped — D03"
    assert "fire_rescue" in categories, "fire records dropped — D03"
    # synthetic phone-bearing ambulance record must survive the adapters
    assert "ambulance_services" in categories, "ambulance dropped — D03"

    for entry in evidence:
        if entry.get("category") == "police":
            assert entry["name"], "police station name missing"
            assert entry.get("latitude") is not None, "police coords lost"
        if entry.get("category") == "ambulance_services":
            # real T1 placeholders are empty — only phone-bearing records
            # may appear (verified identity), never name-only fabrications.
            assert entry.get("phone"), "ambulance entry without phone"
        if entry.get("category") == "fire_rescue":
            assert entry["name"], "fire station name missing"
    assert skipped == []


# --------------------------------------------------------------------- D01
def test_emergency_implausible_records_excluded_with_note():
    """Anchor conflict: records whose coordinates imply >30 km from the
    resolved place are EXCLUDED, never shown with a wrong distance (D01)."""
    record = {
        "temple_id": "T0001",
        "emergency": {
            "hospitals": [
                {
                    "name": "Nearby Clinic",
                    "latitude": 17.385,
                    "longitude": 78.4867,
                    "distance_from_temple_km": 2.0,
                    "phone": "108",
                },
                {
                    "name": "Far Away Hospital",
                    "latitude": 19.076,   # Mumbai-ish
                    "longitude": 72.877,
                    "distance_from_temple_km": 1.0,
                    "phone": "100",
                },
            ]
        },
    }
    travel._emergency_index = {"T0001": record}
    place = SimpleNamespace(lat=17.385, lon=78.4867)

    evidence, skipped = travel._emergency_evidence(
        "T0001", "emergency hospital near me", "hospital", place
    )
    travel._emergency_index = None

    names = [e["name"] for e in evidence]
    assert "Nearby Clinic" in names
    assert "Far Away Hospital" not in names
    assert skipped and "Far Away Hospital" in skipped[0]
    kept = next(e for e in evidence if e["name"] == "Nearby Clinic")
    assert kept["distance_source"] == "computed"
    assert kept["distance_km"] < 1.0


# --------------------------------------------------------------------- D06
def _rest(name, *, pure=None, veg=None, two=None, one=None, dist=1.0):
    return {
        "temple_id": "T0001",
        "_place_tokens": set(),
        "_name_tokens": set(),
        "_haystack": set(),
        "name": name,
        "pure_veg": pure,
        "vegetarian": veg,
        "average_cost_for_two": two,
        "average_cost_for_one": one,
        "distance_km": dist,
        "open": True,
        "price_category": "",
        "rating": 4.2,
        "phone": "",
        "maps_link": "",
        "cuisine": [],
        "city": "Hyderabad",
        "address": "",
    }


def test_pure_veg_is_hard_never_silently_relaxed():
    records = [
        _rest("Mixed Dhaba", pure=None, veg=True),
        _rest("Sattva Pure Veg", pure=True, veg=True),
    ]
    selected = accommodation._select_static(
        records,
        question="any pure veg restaurant near the temple",
        entities=[],
        temple_ids=["T0001"],
        kind="restaurant",
    )
    assert [r["name"] for r in selected] == ["Sattva Pure Veg"]

    # no pure-veg record in the dataset -> EMPTY, not the mixed one
    selected = accommodation._select_static(
        [_rest("Mixed Dhaba", pure=None, veg=True)],
        question="pure veg only please",
        entities=[],
        temple_ids=["T0001"],
        kind="restaurant",
    )
    assert selected == [], "unknown pure_veg must not match (audit D06)"


def test_price_and_ac_constraints_are_hard():
    hotels = [
        {"name": "Budget Inn", "temple_id": "T0001", "price_range": "₹750–₹1,100", "amenities": ["Free WiFi"], "_place_tokens": set(), "_name_tokens": set(), "_haystack": set()},
        {"name": "Sky Suites", "temple_id": "T0001", "price_range": "₹2,500–₹3,200", "amenities": ["Air Conditioning"], "_place_tokens": set(), "_name_tokens": set(), "_haystack": set()},
        {"name": "Lodge Unknown", "temple_id": "T0001", "price_range": None, "amenities": [], "_place_tokens": set(), "_name_tokens": set(), "_haystack": set()},
    ]
    selected = accommodation._select_static(
        hotels,
        question="hotel under ₹1500 per night",
        entities=[],
        temple_ids=["T0001"],
        kind="hotel",
    )
    assert [h["name"] for h in selected] == ["Budget Inn"]

    selected = accommodation._select_static(
        hotels,
        question="AC hotel near the temple",
        entities=[],
        temple_ids=["T0001"],
        kind="hotel",
    )
    assert [h["name"] for h in selected] == ["Sky Suites"]


# --------------------------------------------------------------------- D04
def test_hindi_and_telugu_emergency_detection_and_replies():
    hindi = "मुझे सीने में दर्द हो रहा है, क्या करूं?"
    assert safety.detect(hindi) is True
    reply_hi = safety.response(hindi)
    assert reply_hi["language"] == "hi"
    assert "112" in reply_hi["reply"] and "108" in reply_hi["reply"]

    telugu = "నాకు ఛాతీ నొప్పి వస్తోంది"
    assert safety.detect(telugu) is True
    reply_te = safety.response(telugu)
    assert reply_te["language"] == "te"
    assert "112" in reply_te["reply"]

    reply_en = safety.response("I have chest pain")
    assert reply_en["language"] == "en"


# --------------------------------------------------------------------- D05
def test_emergency_replies_without_touching_session(monkeypatch):
    from app.api import chat

    def _boom(_sid):
        raise AssertionError("get_session must not run on emergency (D05)")

    monkeypatch.setattr(chat, "get_session", _boom)
    result = chat.chat(
        SimpleNamespace(
            message="मुझे सीने में दर्द हो रहा है",
            session_id=None,
            temple_id=None,
        )
    )
    assert result["status"] == "EMERGENCY"
    assert "112" in result["reply"]


# --------------------------------------------------------------------- C17
def test_question_numbers_do_not_ground_claims():
    results = [
        {
            "question": "my old number is 9876543210, what is the phone?",
            "evidence": [{"kind": "fact", "key": "phone", "value": "112"}],
        }
    ]
    missing = validator.find_missing_numbers("9876543210", results)
    assert "9876543210" in missing, "question digits must not ground (C17)"
    assert validator.find_missing_numbers("112", results) == []


# --------------------------------------------------------------------- C16
def test_structured_render_keeps_hotel_and_poi_fields():
    results = [
        {
            "question": "hotels",
            "evidence": [
                {
                    "kind": "hotel",
                    "name": "Haritha Resort",
                    "rating": 4.3,
                    "price_range": "₹900",
                    "phone": "0870-2412345",
                },
                {
                    "kind": "poi",
                    "name": "Kondagattu viewpoint",
                    "distance_km": 1.2,
                },
            ],
        }
    ]
    out = validator.render_structured(results)
    assert "Haritha Resort" in out
    assert "rating: 4.3" in out
    assert "phone: 0870-2412345" in out
    assert "Kondagattu viewpoint" in out
    assert "distance: 1.2" in out


# --------------------------------------------------------------------- C08/C09
def test_money_parsing_decimal_and_phone_guards():
    # v15 (audit C08): decimals are PRESERVED, not truncated
    assert budget._parse_price_range("₹100–200.50") == (100, 200.5)
    assert budget._parse_price_range("Opened in 2024") is None
    assert budget._parse_price_range("Phone extension 1234") is None
    assert budget._parse_price_range("Contact hotel on 9876543210") is None
    assert budget._parse_price_range("₹700–₹1,000 per night (Approx.)") == (700, 1000)


# --------------------------------------------------------------------- R02
def test_dress_code_is_ingested_as_narrative():
    from app.services import temple_document_loader as loader

    assert "dress_code" in loader.NARRATIVE_FIELDS
    temples = loader.load_all_temple_documents()
    dress_docs = [
        d
        for d in temples
        if (d.metadata or {}).get("field_name") == "dress_code"
    ]
    assert dress_docs, "no dress_code chunks produced (R02)"
    assert all(d.page_content.strip() for d in dress_docs)


# --------------------------------------------------------------------- R01
def test_rag_evidence_carries_currency():
    from app.agents import temple as temple_agent

    doc = SimpleNamespace(
        page_content="Dress code: modest clothing.",
        metadata={
            "temple_id": "T0001",
            "name": "Birla Mandir",
            "content_type": "narrative",
            "field_name": "dress_code",
            "section": "dress_code",
            "chunk_index": 0,
            "source_tier": "temple-dataset",
            "last_verified": "2026-10-12",
            "sources": [{"name": "temple site", "url": "https://example.org/t"}],
        },
    )
    evidence = temple_agent._document_to_evidence(doc)
    assert evidence["last_verified"] == "2026-10-12"
    assert evidence["source_url"] == "https://example.org/t"
