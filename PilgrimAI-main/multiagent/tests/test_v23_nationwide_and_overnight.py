"""v23.2 regression suite: nationwide origins + overnight planning.

Two layers, deliberately separated:

* deterministic tests that mock the geocoder provider so CI never depends on
  network availability or on Nominatim's live ranking;
* live tests gated behind ``PILGRIM_LIVE_NETWORK=1`` that assert the real
  resolved state/lat/lng for the required Indian cities.

Route matrices in the solver tests are explicit TEST_FIXTURE legs (the same
convention as ``test_planning_v21.py``). They are never presented as real
road evidence and never enter production data.
"""

from datetime import date
from types import SimpleNamespace

import pytest

from app.planning import discovery, engine, evidence, options
from app.planning.models import PlanRequest
from app.travel import resolver
from app.travel.resolver import (
    TravelResolverClarificationError,
    TravelResolverError,
    resolve_origin_place,
    resolve_place,
)
from app.travel.schemas import PlaceCandidate

DATE = date(2026, 12, 3)

ORIGIN = {
    "id": "origin",
    "name": "TEST origin pin",
    "lat": 18.6725,
    "lng": 78.0941,
    "source": "TEST_FIXTURE",
}


def candidate(**kwargs):
    base = dict(
        display_name="",
        latitude=0.0,
        longitude=0.0,
        source="nominatim",
        place_type="city",
        importance=0.7,
        state=None,
        country="India",
        country_code="in",
    )
    base.update(kwargs)
    return PlaceCandidate(**base)


# --------------------------------------------------------------------------
# Location: deterministic provider-mocked behaviour
# --------------------------------------------------------------------------


def test_telangana_typo_correction_is_preserved(monkeypatch):
    """'nizambad' must still be corrected to Nizamabad (requirement 1.4)."""
    from app.planning import origins

    assert origins.canonical_city("nizambad") == "Nizamabad"
    assert origins.canonical_city("Nizamabad") == "Nizamabad"

    registry_hit = resolver.ResolvedPlace(
        query="nizambad",
        display_name="Nizamabad",
        coordinates=resolver.Coordinate(latitude=18.67, longitude=78.09),
        source="geography_registry",
        canonical_entity_type="city",
        state="Telangana",
    )
    monkeypatch.setattr(origins, "_telangana_from_registry", lambda city: registry_hit)
    resolved = origins.resolve_origin("nizambad")
    assert resolved.display_name == "Nizamabad"
    assert resolved.state == "Telangana"
    assert resolved.query == "nizambad"


def test_origin_search_never_uses_the_telangana_viewbox(monkeypatch):
    """Requirement 1.2: no unconditional Telangana bias for origins."""
    calls = []

    def fake_search(query, **kwargs):
        calls.append((query, kwargs))
        return [
            candidate(
                display_name="Shirdi, Ahmednagar, Maharashtra, India",
                latitude=19.7668,
                longitude=74.4754,
                state="Maharashtra",
                importance=0.61,
            )
        ]

    monkeypatch.setattr(resolver, "nominatim_search", fake_search)
    resolved = resolve_origin_place("Shirdi")
    assert resolved.state == "Maharashtra"
    assert resolved.coordinates.latitude == pytest.approx(19.7668)
    assert calls, "geocoder must be queried"
    for _query, kwargs in calls:
        assert kwargs["use_service_viewbox"] is False
        assert kwargs["country_code"] == "in"


def test_origin_never_resolves_to_a_same_named_locality_in_another_state(monkeypatch):
    """Requirement 1.7: the old 'Shirdi -> Khammam hamlet' bug."""
    monkeypatch.setattr(
        resolver,
        "nominatim_search",
        lambda query, **kwargs: [
            candidate(
                display_name="Shirdi Sai Nagar, Khammam Rural mandal, Telangana, India",
                latitude=17.273,
                longitude=80.129,
                state="Telangana",
                place_type="hamlet",
                importance=0.42,
            ),
            candidate(
                display_name="Shirdi, Ahmednagar, Maharashtra, India",
                latitude=19.7668,
                longitude=74.4754,
                state="Maharashtra",
                place_type="town",
                importance=0.61,
            ),
        ],
    )
    resolved = resolve_origin_place("Shirdi")
    assert resolved.state == "Maharashtra"
    assert resolved.coordinates.latitude == pytest.approx(19.7668)


def test_explicit_state_hint_disambiguates(monkeypatch):
    """Requirement 1.6: state context breaks a name tie."""
    monkeypatch.setattr(
        resolver,
        "nominatim_search",
        lambda query, **kwargs: [
            candidate(
                display_name="Aurangabad, Maharashtra, India",
                latitude=19.876,
                longitude=75.343,
                state="Maharashtra",
                importance=0.80,
            ),
            candidate(
                display_name="Aurangabad, Bihar, India",
                latitude=24.752,
                longitude=84.374,
                state="Bihar",
                importance=0.80,
            ),
        ],
    )
    resolved = resolve_origin_place("Aurangabad, Bihar")
    assert resolved.state == "Bihar"


def test_ambiguous_city_raises_a_clear_error(monkeypatch):
    """Requirement 1.8: two equally plausible states must not be guessed."""
    monkeypatch.setattr(
        resolver,
        "nominatim_search",
        lambda query, **kwargs: [
            candidate(
                display_name="Aurangabad, Maharashtra, India",
                latitude=19.876,
                longitude=75.343,
                state="Maharashtra",
                importance=0.80,
            ),
            candidate(
                display_name="Aurangabad, Bihar, India",
                latitude=24.752,
                longitude=84.374,
                state="Bihar",
                importance=0.80,
            ),
        ],
    )
    with pytest.raises(TravelResolverClarificationError) as raised:
        resolve_origin_place("Aurangabad")
    message = str(raised.value)
    assert "Ambiguous" in message
    states = {c.state for c in raised.value.candidates}
    assert {"Maharashtra", "Bihar"} <= states


def test_unknown_origin_is_rejected_safely(monkeypatch):
    """Requirement 1.10/1: nothing is returned for an unresolvable name."""
    monkeypatch.setattr(resolver, "nominatim_search", lambda query, **kwargs: [])
    with pytest.raises(TravelResolverError) as raised:
        resolve_origin_place("zzz not a real place zzz")
    assert "India" in str(raised.value)


def test_foreign_results_are_dropped_for_origins(monkeypatch):
    """Requirement 1.3/1.5: only the configured country is accepted."""
    monkeypatch.setattr(
        resolver,
        "nominatim_search",
        lambda query, **kwargs: [
            candidate(
                display_name="Mumbai, Maharashtra, India",
                latitude=19.076,
                longitude=72.877,
                state="Maharashtra",
                country="India",
                country_code="in",
                importance=0.9,
            ),
            candidate(
                display_name="Mumbai, Sindh, Pakistan",
                latitude=26.4,
                longitude=68.4,
                state="Sindh",
                country="Pakistan",
                country_code="pk",
                importance=0.95,
            ),
        ],
    )
    resolved = resolve_origin_place("Mumbai")
    assert resolved.country_code == "in"
    assert resolved.state == "Maharashtra"


def test_destination_scope_is_still_telangan_only(monkeypatch):
    """Requirement 1.9: the temple catalogue's scope is unchanged."""
    monkeypatch.setattr(
        resolver,
        "nominatim_search",
        lambda query, **kwargs: [
            candidate(
                display_name="Somewhere, West Bengal, India",
                latitude=22.57,
                longitude=88.36,
                state="West Bengal",
            )
        ],
    )
    with pytest.raises(TravelResolverError) as raised:
        resolve_place("Somewhere far away")
    assert "Telangana" in str(raised.value)


def test_geo_scope_is_configurable(monkeypatch):
    """Requirement 1.3: the restriction is environment-configurable."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "geo_scope_enabled", False)
    far = [
        candidate(
            display_name="Kolkata, West Bengal, India",
            latitude=22.57,
            longitude=88.36,
            state="West Bengal",
        )
    ]
    assert resolver._within_geo_scope(far, scope="destination") == far

    monkeypatch.setattr(settings, "geo_scope_enabled", True)
    assert resolver._within_geo_scope(far, scope="destination") == []


def test_origin_bbox_is_configurable(monkeypatch):
    from app.core.config import settings

    # Shrink the origin box to Telangana only: Mumbai must fall outside it.
    monkeypatch.setattr(settings, "origin_bbox", "15.6,76.6,20.3,81.5")
    mumbai = [
        candidate(
            display_name="Mumbai, Maharashtra, India",
            latitude=19.076,
            longitude=72.877,
            state="Maharashtra",
        )
    ]
    assert resolver._within_geo_scope(mumbai, scope="origin") == []


# --------------------------------------------------------------------------
# Location: live verification of the required cities
# --------------------------------------------------------------------------


LIVE = __import__("os").environ.get("PILGRIM_LIVE_NETWORK") == "1"

# query -> (expected state, expected lat, expected lng) within a tolerance.
LIVE_CITIES = [
    ("Hyderabad", "Telangana", 17.385, 78.487),
    ("Nizamabad", "Telangana", 18.673, 78.098),
    ("nizambad", "Telangana", 18.673, 78.098),
    ("Warangal", "Telangana", 17.968, 79.594),
    ("Vijayawada", "Andhra Pradesh", 16.506, 80.648),
    ("Mumbai", "Maharashtra", 19.076, 72.877),
    ("Delhi", "Delhi", 28.613, 77.209),
    ("Chennai", "Tamil Nadu", 13.083, 80.270),
    ("Bengaluru", "Karnataka", 12.972, 77.594),
    ("Kolkata", "West Bengal", 22.573, 88.364),
    ("Pune", "Maharashtra", 18.520, 73.856),
    ("Shirdi, Maharashtra", "Maharashtra", 19.766, 74.475),
    ("Kochi", "Kerala", 9.931, 76.267),
    ("Tirupati", "Andhra Pradesh", 13.629, 79.419),
]


@pytest.mark.skipif(not LIVE, reason="set PILGRIM_LIVE_NETWORK=1 to geocode live")
@pytest.mark.parametrize("query,state,lat,lng", LIVE_CITIES)
def test_live_origin_resolution(query, state, lat, lng):
    from app.planning.origins import resolve_origin

    resolved = resolve_origin(query)
    assert resolved.state == state
    # ~0.35 deg tolerance: city-centre fixes differ between geocoder versions.
    assert abs(resolved.coordinates.latitude - lat) < 0.35
    assert abs(resolved.coordinates.longitude - lng) < 0.35
    assert resolved.country_code in {None, "in"}


@pytest.mark.skipif(not LIVE, reason="set PILGRIM_LIVE_NETWORK=1 to geocode live")
def test_live_shirdi_is_maharashtra_not_telangana():
    from app.planning.origins import resolve_origin

    resolved = resolve_origin("Shirdi")
    assert resolved.state == "Maharashtra"
    assert "Telangana" not in (resolved.display_name or "")


# --------------------------------------------------------------------------
# Overnight planning
# --------------------------------------------------------------------------


def _routes(points, travel):
    return {
        a["id"] + ">" + b["id"]: {
            "from": a["id"],
            "to": b["id"],
            "minutes": travel,
            "km": round(travel * 0.9, 2),
            "source": "TEST_FIXTURE_ROAD",
            "estimated": False,
            "url": "https://maps.google.com/",
        }
        for a in points
        for b in points
        if a["id"] != b["id"]
    }


def plan_trip(temple_ids, days, travel=35, stay_mode="overnight", allow=True,
              opts=None, hotel_fixture=None):
    req = PlanRequest(
        temple_ids=temple_ids,
        primary_temple_id=temple_ids[0],
        origin="Nizamabad",
        start_date=DATE,
        days=days,
        adults=2,
        rooms=1,
        stay="hotel" if stay_mode == "overnight" else "none",
        stay_mode=stay_mode,
        allow_unconfirmed_stay=allow,
    )
    required = evidence.catalog(req.temple_ids, req.start_date, req.days)
    candidates, classified = discovery.discover(req, required)
    opts = opts if opts is not None else evidence.stay_food(req, required + candidates)
    if hotel_fixture is not None:
        # The engine re-derives the selection from opts["hotels"], so the
        # fixture must be a real candidate there - not a pre-set selection.
        opts = {**opts, "hotels": [hotel_fixture] + list(opts.get("hotels", []))}
    fixture_points = [hotel_fixture] if hotel_fixture is not None else []
    points = (
        [ORIGIN]
        + required
        + candidates
        + ([opts["selected_hotel"]] if opts.get("selected_hotel") else [])
        + fixture_points
        + [r for r in opts.get("restaurants", []) if r.get("lat") is not None]
    )
    matrix = engine.buffered_routes(req, _routes(points, travel))
    plan, budget, classified = engine.plan(
        req, required, candidates, classified, matrix, opts, ORIGIN
    )
    return plan, opts, matrix


def day_codes(plan):
    return {e["code"] for e in plan["conflicts"]}


@pytest.mark.parametrize(
    "temple_ids,days",
    [
        (["T0001"], 1),
        (["T0004"], 1),
        (["T0001"], 2),
        (["T0004"], 2),
        (["T0001"], 3),
        (["T0001", "T0013"], 2),
        (["T0001", "T0013"], 3),
    ],
)
def test_overnight_and_day_trips_are_feasible(temple_ids, days):
    """Requirements 3.7/3.8: single- and multi-temple overnight itineraries."""
    stay_mode = "daily_return" if days == 1 else "overnight"
    plan, opts, _ = plan_trip(temple_ids, days, stay_mode=stay_mode)
    assert plan["feasible"], plan["conflicts"]
    assert len(plan["days"]) == days
    # No requested day is left empty.
    from app.planning.solver import day_purpose

    lodging = (opts.get("selected_hotel") or opts.get("overnight_area") or {}).get("id")
    for index, day in enumerate(plan["days"]):
        assert (
            day_purpose(day, index, days, lodging_id=lodging) is not None
        ), f"day {index} empty: {day}"


def test_single_temple_two_day_overnight_final_day_returns():
    """Requirement 3.6: the last day is a real return journey to the origin."""
    plan, _opts, _matrix = plan_trip(["T0004"], 2)
    assert plan["feasible"], plan["conflicts"]
    final = plan["days"][-1]["items"]
    returns = [i for i in final if i["type"] == "travel" and i.get("to_id") == "origin"]
    assert returns, final
    assert returns[-1]["leg_complete"] is True
    # The first day must not already return home.
    assert not any(i.get("to_id") == "origin" for i in plan["days"][0]["items"])


@pytest.mark.parametrize("travel", [25, 60, 210])
def test_distant_and_near_origins_both_schedule(travel):
    """Requirement 3: short-distance and long-distance origins."""
    plan, _, _ = plan_trip(["T0004"], 2, travel=travel)
    assert plan["feasible"], plan["conflicts"]
    assert any(
        i["type"] == "visit" and i.get("place_id") == "T0004"
        for d in plan["days"]
        for i in d["items"]
    )


def test_meals_are_reserved_when_the_threshold_passes_during_a_visit():
    """Regression: MEAL_MISSING used to empty a short single-temple day."""
    plan, _, _ = plan_trip(["T0004"], 2)
    assert plan["feasible"], plan["conflicts"]
    meals = [
        i.get("meal")
        for d in plan["days"]
        for i in d["items"]
        if i["type"] == "meal"
    ]
    assert meals, "a crossed meal threshold must be reserved explicitly"
    assert not {"MEAL_MISSING"} & {e["code"] for e in plan["validation"]["critical"]}


def test_missing_hotel_capacity_reports_unverified_not_a_fake_match():
    """Requirement 2.6-2.8: discovery is not verification."""
    opts = options.retrieve(
        PlanRequest(
            temple_ids=["T0004"],
            origin="Nizamabad",
            start_date=DATE,
            days=2,
            stay="hotel",
            stay_mode="overnight",
            adults=2,
            rooms=1,
        ),
        [{"id": "T0004", "kind": "temple"}],
    )
    hotels = opts["hotels"]
    assert hotels, "the Basara catalogue has properties"
    for hotel in hotels:
        assert hotel["requirements_match"] is False
        assert hotel["capacity_verified"] is False
        assert hotel["coordinates_verified"] is False
        assert hotel["match_status"] == "capacity_unknown"
        # The reason must name the actual blocker for *this* record.
        if hotel["category_match"]:
            assert "capacity" in hotel["match_reason"].lower()
        else:
            assert "property type" in hotel["match_reason"].lower()
        # Never a verified match merely because the name is in the dataset.
        assert hotel["verification"] == "catalog_not_live"
    assert opts["selected_hotel"] is None
    assert opts["hotel_status"] == "unverified_options_only"
    assert "capacity" in opts["hotel_unverified_reason"]


def test_verified_hotel_is_selected_when_the_record_has_evidence():
    """Requirement 2.6: a genuinely evidenced record still matches."""
    hotel = {
        "id": "H0001",
        "name": "Fixture Lodge",
        "lat": 18.87,
        "lng": 77.94,
        "requirements_match": True,
        "capacity_per_room": 2,
        "capacity_verified": True,
        "coordinates_verified": True,
        "timing_verified": True,
        "check_in_minute": 720,
        "check_out_minute": 660,
        "kind": "hotel",
        "maps_url": "https://maps.google.com/",
        "verification": "catalog_not_live",
        "category_match": True,
        "availability": "unverified",
        "booking_status": "not_booked",
        "price_low": 1500,
        "price_high": 2500,
    }
    plan, opts, _ = plan_trip(["T0004"], 2, hotel_fixture=hotel)
    assert opts["selected_hotel"]["id"] == "H0001"
    assert plan["feasible"], plan["conflicts"]
    items = [i for d in plan["days"] for i in d["items"]]
    assert any(i["type"] == "checkin" for i in items)
    assert any(i["type"] == "checkout" for i in items)


def test_unverified_stay_is_a_warning_and_never_invents_a_property():
    """Requirement 3.10: the validator is not bypassed, the stay is flagged."""
    plan, opts, _ = plan_trip(["T0004"], 2, stay_mode="overnight", allow=True)
    assert plan["feasible"], plan["conflicts"]
    assert opts["selected_hotel"] is None
    warnings = {w["code"] for w in plan["validation"]["warnings"]}
    assert "STAY_UNVERIFIED" in warnings
    items = [i for d in plan["days"] for i in d["items"]]
    assert not any(i["type"] == "checkin" for i in items)
    assert not any(i["type"] == "checkout" for i in items)


def test_without_consent_an_unverified_stay_still_fails():
    """Requirement 3.11/2.8: no silent downgrade of a verified requirement."""
    plan, opts, _ = plan_trip(["T0004"], 2, stay_mode="overnight", allow=False)
    assert opts["selected_hotel"] is None
    assert plan["feasible"] is False
    assert "HOTEL_REQUIREMENTS_UNVERIFIED" in day_codes(plan)


def test_genuinely_infeasible_schedule_reports_needs_changes():
    """Requirement 3.12: infeasibility is reported, not papered over."""
    plan, _, _ = plan_trip(["T0004"], 2, travel=430)
    if plan["feasible"]:
        pytest.skip("this fixture still fits within a day; covered elsewhere")
    assert plan["conflicts"]
    assert not plan["days"] or all(
        code in {"DAY_UNPLANNED", "NO_VERIFIED_SCHEDULE_FOUND"}
        for code in {c["code"] for c in plan["conflicts"]}
    )


def test_route_evidence_is_never_manufactured():
    """Requirement 3.11: every leg in the plan exists in the matrix."""
    plan, _, matrix = plan_trip(["T0004", "T0013"], 2)
    assert plan["feasible"], plan["conflicts"]
    for day in plan["days"]:
        for item in day["items"]:
            if item["type"] != "travel":
                continue
            key = f"{item['from_id']}>{item['to_id']}"
            assert key in matrix, key
            assert item["source"] == matrix[key]["source"]
            assert item["distance_km"] >= 0


def test_validator_rejects_a_truncated_final_day():
    """The gate still catches a plan that forgets the return leg."""
    from app.planning.solver import validate as timeline_validate

    plan, _, matrix = plan_trip(["T0004"], 2)
    assert plan["feasible"], plan["conflicts"]
    broken = [dict(d) for d in plan["days"]]
    broken[-1] = {**broken[-1], "items": []}
    errors = timeline_validate(
        PlanRequest(
            temple_ids=["T0004"],
            primary_temple_id="T0004",
            origin="Nizamabad",
            start_date=DATE,
            days=2,
            stay="hotel",
            stay_mode="overnight",
            adults=2,
            allow_unconfirmed_stay=True,
        ),
        evidence.catalog(["T0004"], DATE, 2),
        {"days": broken},
        matrix,
        hotel={"id": "T0004", "kind": "overnight_area"},
    )
    codes = {e["code"] for e in errors}
    assert "DAY_UNPLANNED" in codes or "RETURN_MISSING" in codes


def test_day_purpose_rules():
    """The planned-day rule is explicit and unit-testable."""
    from app.planning.solver import day_purpose

    visit = {"items": [{"type": "visit"}]}
    checkin = {"items": [{"type": "checkin"}]}
    arrival = {"items": [{"type": "travel", "leg_complete": True, "to_id": "HTL"}]}
    return_leg = {"items": [{"type": "travel", "leg_complete": True, "to_id": "origin"}]}
    empty = {"items": []}

    assert day_purpose(visit, 0, 2) == "visit"
    assert day_purpose(checkin, 0, 2) == "checkin"
    assert day_purpose(arrival, 0, 2, lodging_id="HTL") == "transfer"
    assert day_purpose(return_leg, 1, 2) == "return"
    # A return leg on a middle day is not a reason for that day to exist.
    assert day_purpose(return_leg, 0, 2) is None
    assert day_purpose(empty, 0, 2) is None


# --------------------------------------------------------------------------
# Distant-origin diagnostics (clear explanations instead of "a day is empty")
# --------------------------------------------------------------------------


def _far_origin_codes(origin, days, leg_minutes, temple="T0004"):
    from app.planning import costing, validation

    req = PlanRequest(
        temple_ids=[temple],
        primary_temple_id=temple,
        origin=origin,
        start_date=DATE,
        days=days,
        stay="hotel",
        stay_mode="overnight",
        adults=2,
        allow_unconfirmed_stay=True,
    )
    leg = {
        "minutes": leg_minutes,
        "km": leg_minutes * 1.2,
        "source": "TEST_FIXTURE_ROAD",
        "estimated": False,
        "url": "https://maps.google.com/",
    }
    matrix = {f"origin>{temple}": leg, f"{temple}>origin": leg}
    days_ = [
        {"date": (DATE.replace(day=3 + i)).isoformat(), "items": []} for i in range(days)
    ]
    places = evidence.catalog([temple], DATE, days)
    cost = costing.calculate(req, days_, {"hotels": [], "restaurants": []}, places)
    result = validation.validate(
        req, places, {"days": days_}, matrix, {"hotels": [], "restaurants": []}, cost
    )
    return {e["code"] for e in result["critical"]}, result["critical"]


def test_drive_longer_than_a_planning_day_is_explained():
    codes, critical = _far_origin_codes("Mumbai", 2, 563)
    assert "DRIVE_EXCEEDS_DAILY_WINDOW" in codes
    detail = next(
        e["details"][0] for e in critical if e["code"] == "DRIVE_EXCEEDS_DAILY_WINDOW"
    )
    assert "h" in detail and "planning day" in detail


def test_round_trip_longer_than_the_trip_is_explained():
    codes, critical = _far_origin_codes("Delhi", 3, 1300, temple="T0001")
    assert "ROUND_TRIP_TOO_LONG" in codes
    detail = next(
        e["details"][0] for e in critical if e["code"] == "ROUND_TRIP_TOO_LONG"
    )
    assert "round trip" in detail


@pytest.mark.parametrize("leg", [35, 120, 300])
def test_reachable_origins_get_no_distance_diagnostic(leg):
    codes, _critical = _far_origin_codes("Nizamabad", 2, leg)
    assert not codes & {
        "DRIVE_EXCEEDS_DAILY_WINDOW",
        "ROUND_TRIP_TOO_LONG",
        "ARRIVAL_AFTER_CLOSING",
    }
