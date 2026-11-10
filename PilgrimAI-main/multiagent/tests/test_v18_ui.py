"""v18 UI/UX pack: humanized DEGRADED fallback, labeled-rounding number
tolerance, literal-newline sanitizing, entity-derived follow-ups."""
from __future__ import annotations

from app.pipeline import compose, validator
from app.api.chat import _evidence_entity, _fallback_follow_ups


def _discovery_results() -> list[dict]:
    return [
        {
            "question": "Which temple can be visited from Secunderabad "
                        "within ₹1,000?",
            "status": "COMPLETED",
            "evidence": [
                {"kind": "place", "role": "origin",
                 "name": "Secunderabad, Hyderabad, Telangana, 500003, India"},
                {"kind": "temple_candidate", "name": "Birla Mandir Hyderabad",
                 "road_km": 6.12, "road_minutes": 8.65, "straight_km": 4.55,
                 "district": "Hyderabad District",
                 "distance_source": "road_osrm"},
                {"kind": "temple_candidate", "name": "Sri Sanghi Temple",
                 "road_km": 29.54, "road_minutes": 40.52,
                 "straight_km": 22.82, "district": "Ranga Reddy District",
                 "distance_source": "road_osrm"},
                {"kind": "note", "key": "discovery_method",
                 "error": "Ranked from our 23-temple registry. Distances are "
                          "road distances (OSRM)."},
            ],
        }
    ]


# ------------------------------------------------ P0-1 humanized fallback
def test_discovery_fallback_is_human_readable():
    out = validator.render_structured(_discovery_results())
    # no raw machine keys / log-style prefix
    assert "Q:" not in out
    assert "road_time_min" not in out
    assert "straight_line" not in out
    assert "temple_candidate:" not in out
    # friendly structure
    assert "Starting from: Secunderabad" in out
    assert "1. 🛕 Birla Mandir Hyderabad" in out
    assert "🛣️ ≈6.1 km by road" in out
    assert "⏱ ≈9 min" in out
    assert "Hyderabad District" in out
    assert out.index("1. ") < out.index("2. "), "candidates not numbered"
    # honesty note preserved (v15)
    assert "Ranked from our 23-temple registry" in out


def test_straight_line_fallback_stays_honest():
    results = [{
        "question": "temples near me",
        "status": "COMPLETED",
        "evidence": [
            {"kind": "temple_candidate", "name": "Hidden Temple",
             "road_km": None, "road_minutes": None, "straight_km": 12.34},
        ],
    }]
    out = validator.render_structured(results)
    assert "road routing unavailable" in out
    assert "≈12 km" in out


def test_hotel_values_still_render_after_humanization():
    results = [{
        "question": "hotels",
        "status": "COMPLETED",
        "evidence": [
            {"kind": "hotel", "name": "Haritha", "phones": ["0870-2412345"],
             "map_link": "https://maps.example/haritha"},
        ],
    }]
    out = validator.render_structured(results)
    assert "0870-2412345" in out
    assert "https://maps.example/haritha" in out


# ------------------------------------------------ P0-3 rounding tolerance
def _num_results() -> list[dict]:
    return [{
        "status": "COMPLETED",
        "evidence": [
            {"kind": "fact", "key": "road_time_min", "value": 7.56,
             "unit": "min", "provider": "osrm"},
            {"kind": "fact", "key": "distance", "value": 5.39,
             "unit": "km", "provider": "osrm"},
        ],
    }]


def test_labeled_rounding_accepted_within_10_percent():
    r = _num_results()
    assert validator.find_missing_numbers("It takes ≈8 min", r) == []
    assert validator.find_missing_numbers("about 5.4 km", r) == []
    assert validator.find_missing_numbers("roughly 5.4 km", r) == []


def test_unlabeled_or_wide_numbers_still_flagged():
    r = _num_results()
    assert validator.find_missing_numbers("It takes 8 min", r) == ["8"]
    # 9 vs 7.56 = 19% off -> too wide even with ≈
    assert validator.find_missing_numbers("≈9 min", r) == ["9"]
    # 173850 is not in evidence at all
    assert validator.find_missing_numbers("173850 rooms", r) == ["173850"]


# ------------------------------------------------ P0-2 newline sanitize
def test_sanitize_newlines_literal_backslash():
    assert compose._sanitize_newlines("A\\nB") == "A\nB"
    assert compose._sanitize_newlines("A\\\\nB") == "A\nB"
    assert compose._sanitize_newlines("real\nbreak") == "real\nbreak"


def test_answer_sanitizes_before_return(monkeypatch):
    monkeypatch.setattr(
        compose, "complete_json",
        lambda **kwargs: {
            "reply": "**Bold** line\\nsecond line",
            "follow_ups": ["next?"],
        },
    )
    out = compose.answer(
        question="q", language="en",
        results=[{"status": "COMPLETED", "evidence": []}],
    )
    assert "\n" in out["reply"]
    assert "\\n" not in out["reply"]
    assert out["follow_ups"] == ["next?"]


# ------------------------------------------------ P0-4 follow-up fallback
def test_fallback_follow_ups_name_the_top_temple():
    fus = _fallback_follow_ups(_discovery_results())
    assert len(fus) == 3
    assert all("Birla Mandir Hyderabad" in f for f in fus)
    # logical sequence: detail -> logistics -> fit
    assert "darshan timings" in fus[0]
    assert "reach" in fus[1]


def test_fallback_skips_origin_uses_destination_place():
    results = [{
        "evidence": [
            {"kind": "place", "role": "origin", "name": "Hyderabad"},
            {"kind": "poi", "name": "Golconda Fort"},
        ]
    }]
    assert _evidence_entity(results) == ("place", "Golconda Fort")
    fus = _fallback_follow_ups(results)
    assert fus and all("Golconda Fort" in f for f in fus)
    assert not any("Hyderabad" in f for f in fus)


def test_fallback_empty_without_entities():
    assert _fallback_follow_ups([{"evidence": []}]) == []
