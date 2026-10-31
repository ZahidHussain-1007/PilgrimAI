"""v15 — re-audit regression pack (73-task review of 7b4de43).

Every partial-fix claim from the branch re-audit is pinned here with the
PRODUCTION object shapes that masked the v14 gaps:
  D01  ResolvedPlace.coordinates.latitude (not top-level lat/lon)
  D06  hard constraints AFTER static+live merge
  D07  `within 2 km` ≠ ₹2,000; family/non-AC ≠ AC; occupancy honesty
  D03  fire 24x7_status / travel_time aliases
  D04  more Hindi variants + facility-discovery vs urgent help
  R01  annotated/prefixed source strings + fallback-path provenance
  C08  decimals preserved; C09 years/extensions rejected
  C16  real hotel keys (phones/map_link), note content, partial budget
  C17  record-attributed prices
"""
from __future__ import annotations

import json
from pathlib import Path

from app.agents import accommodation, budget, temple, travel
from app.pipeline import safety, validator
from app.travel.schemas import Coordinate, ResolvedPlace

PROJECT_ROOT = Path(__file__).resolve().parents[1]


# --------------------------------------------------------------------- D01
def test_emergency_guard_reads_real_resolvedplace_shape():
    """Production anchor: ResolvedPlace(coordinates=Coordinate(...)). The
    v14 test's SimpleNamespace(lat,lon) masked a guard that never fired."""
    place = ResolvedPlace(
        query="T0018",
        display_name="Jamalapuram",
        coordinates=Coordinate(latitude=17.385, longitude=78.4867),
        source="dataset",
    )
    rec = {
        "temple_id": "T0018",
        "emergency": {
            "hospitals": [
                {"name": "Nearby Clinic", "latitude": 17.39,
                 "longitude": 78.49, "distance_from_temple_km": 0.5},
                {"name": "Distant Misplaced PHC", "latitude": 19.076,
                 "longitude": 72.877, "distance_from_temple_km": 0.8},
            ]
        },
    }
    travel._emergency_index = {"T0018": rec}
    evidence, skipped = travel._emergency_evidence(
        "T0018", "emergency hospital near me", "hospital", place
    )
    travel._emergency_index = None

    names = [e["name"] for e in evidence]
    assert "Nearby Clinic" in names
    assert "Distant Misplaced PHC" not in names, (
        "guard did not run — production shape coordinates.* must be read (D01)"
    )
    assert skipped and "Distant Misplaced PHC" in skipped[0]
    kept = next(e for e in evidence if e["name"] == "Nearby Clinic")
    assert kept["distance_source"] == "computed"


# --------------------------------------------------------------------- D03
def test_fire_record_24x7_and_travel_time_survive():
    fire = json.loads(
        (PROJECT_ROOT / "data" / "emergency" / "T1.json").read_text("utf-8")
    )["emergency"]["fire_rescue"][0]
    assert "24x7_status" in fire and "travel_time" in fire

    rec = json.loads(
        (PROJECT_ROOT / "data" / "emergency" / "T1.json").read_text("utf-8")
    )
    travel._emergency_index = {"T0001": rec}
    evidence, _ = travel._emergency_evidence("T0001", "fire station emergency", None)
    travel._emergency_index = None
    fire_items = [e for e in evidence if e["category"] == "fire_rescue"]
    assert fire_items, "fire records missing"
    for entry in fire_items:
        assert entry["open_24x7"] is not None or fire.get("24x7_status") is None
    assert any(e.get("travel_time") for e in fire_items), (
        "travel_time alias lost (D03)"
    )


# --------------------------------------------------------------------- D06
def test_constraints_apply_after_static_live_merge():
    """Live OSM items (no diet/price verification) must NOT survive a
    strict request — the v14 gate only covered static records."""
    merged = [
        {"kind": "restaurant", "name": "Verified Pure Veg", "pure_veg": True,
         "vegetarian": True, "average_cost_for_two": 300, "distance_km": 0.5},
        {"kind": "restaurant", "name": "Mixed Static", "pure_veg": None,
         "vegetarian": True, "average_cost_for_two": 200, "distance_km": 0.4},
        {"kind": "poi", "name": "Live Unknown-Diet Eatery", "distance_km": 9.0},
        {"kind": "note", "key": "osm_status", "error": "x"},
    ]
    kept, drops = accommodation._enforce_post_merge_constraints(
        merged,
        "pure veg food within 2 km under ₹200 per person",
        "restaurant",
    )
    names = [i.get("name") for i in kept if i.get("kind") != "note"]
    assert names == ["Verified Pure Veg"]
    assert drops, "drops must be counted for the honesty note"
    # unconstrained request keeps everything
    kept2, drops2 = accommodation._enforce_post_merge_constraints(
        merged, "any restaurant", "restaurant"
    )
    assert len(kept2) == len(merged) and not drops2


# --------------------------------------------------------------------- D07
def test_price_radius_ac_parsing_regressions():
    # "within 2 km" must never become a ₹2,000 cap; later ₹200 wins
    assert accommodation._max_price_rupees(
        "pure veg food within 2 km under ₹200 per person"
    ) == 200.0
    assert accommodation._max_price_rupees("within 2 km") is None
    assert accommodation._max_price_rupees("hotel under ₹1500") == 1500.0
    # AC whole-word + negation
    assert accommodation._wants_ac("family accommodation") is False
    assert accommodation._wants_ac("non-AC hotel") is False
    assert accommodation._wants_ac("AC hotel near temple") is True
    # radius still extracted
    assert accommodation._within_km("within 2 km under ₹200") == 2.0
    # occupancy intent recognised (drives the honesty note)
    assert accommodation._wants_occupancy("family of 4") is True


# --------------------------------------------------------------------- D04
def test_hindi_variants_and_facility_discovery_routing():
    assert safety.detect("मुझे सांस नहीं आ रही है") is True
    assert safety.detect("मुझे सीने में तेज दर्द है") is True
    assert safety.detect("एम्बुलेंस चाहिए") is True
    assert safety.detect("chest pain") is True
    # facility discovery goes to the agents, not the safety gate…
    assert safety.detect("ambulance station near Yadadri") is False
    assert safety.detect("police station near Karimnagar") is False
    # …but genuine urgent help with a geo word stays protected
    assert safety.detect("need ambulance near me") is True
    reply = safety.response("मुझे सांस नहीं आ रही है")
    assert reply["language"] == "hi"
    assert "112" in reply["reply"] and "108" in reply["reply"]


# --------------------------------------------------------------------- R01
def test_source_url_normalization_and_fallback_provenance():
    assert temple._first_source_url(
        "Wikipedia: https://en.wikipedia.org/wiki/Vemulawada_Raja (accessed 2026-09)"
    ) == "https://en.wikipedia.org/wiki/Vemulawada_Raja"
    assert temple._first_source_url(
        [{"name": "temple site", "url": "https://example.org/t"}]
    ) == "https://example.org/t"
    assert temple._first_source_url(None) is None

    evidence = temple._dataset_evidence(["T0001"], "dress code")
    assert evidence, "dataset fallback produced nothing"
    assert any(
        item.get("source_url") or item.get("last_verified")
        for item in evidence
    ), "fallback path must carry provenance (R01)"


# --------------------------------------------------------------- C08 / C09
def test_money_precision_and_context_guards():
    assert budget._parse_price_range("₹100–200.50") == (100.0, 200.5)
    assert budget._parse_price_range("₹100–₹200.50") == (100.0, 200.5)
    assert budget._parse_price_range("Opened in 2024") is None
    assert budget._parse_price_range("Phone extension 1234") is None
    assert budget._parse_price_range("Contact hotel on 9876543210") is None
    assert budget._parse_price_range("₹700–₹1,000 per night (Approx.)") == (
        700.0,
        1000.0,
    )


# --------------------------------------------------------------------- C16
def test_render_uses_real_hotel_keys_notes_and_partial_budget():
    results = [
        {
            "question": "hotels",
            "evidence": [
                {
                    "kind": "hotel",
                    "name": "Haritha Resort",
                    "phones": ["0870-2412345", "9440012345"],
                    "map_link": "https://maps.example/haritha",
                    "rating": 4.3,
                    "price_range": "₹900–₹1,400",
                },
                {
                    "kind": "note",
                    "key": "anchor_conflict_excluded",
                    "content": "Some emergency records were excluded…",
                },
                {
                    "kind": "budget_total",
                    "low": 800,
                    "high": 1200,
                    "components_included": ["food"],
                    "partial": True,
                    "components_missing": ["stay", "transport"],
                },
            ],
        }
    ]
    out = validator.render_structured(results)
    assert "0870-2412345" in out, "real hotel `phones` key ignored (C16)"
    assert "['" not in out, "list values must render as joined text"
    assert "https://maps.example/haritha" in out, "`map_link` ignored (C16)"
    assert "Some emergency records were excluded" in out, "note content lost"
    assert "PARTIAL" in out and "stay" in out, "partial budget unlabeled"
    assert "₹800 - ₹1200" in out, "money must render without .0"


# --------------------------------------------------------------------- C17
def test_misattributed_prices_are_flagged():
    results = [
        {
            "evidence": [
                {"kind": "hotel", "name": "Hotel Annapurna", "price_range": "₹500"},
                {"kind": "hotel", "name": "Hotel Balaji", "price_range": "₹900"},
            ]
        }
    ]
    flagged = validator.find_misattributed_numbers(
        "Hotel Annapurna costs ₹900 per night.", results
    )
    assert "900" in flagged, "swapped price approved (C17)"
    assert (
        validator.find_misattributed_numbers(
            "Hotel Balaji costs ₹900 per night.", results
        )
        == []
    )
    # ambiguous (both names in one sentence) stays with the old rule
    assert (
        validator.find_misattributed_numbers(
            "Annapurna is ₹900 while Balaji is ₹500.", results
        )
        == []
    )
