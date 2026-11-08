"""A–G are deterministic *fixtures*, never fabricated production records/quotes.
The separate live report/browser script tests real catalog + OSRM behavior.
"""

from copy import deepcopy
from datetime import timedelta, date
from types import SimpleNamespace
import pytest
from pydantic import ValidationError
from app.planning import (
    evidence,
    engine,
    discovery,
    costing,
    options,
    validation,
    intent,
)
from app.planning.models import PlanRequest

DATE = date(2026, 11, 4)
ORIGIN = {
    "id": "origin",
    "name": "TEST origin pin",
    "lat": 17.4025,
    "lng": 78.5613,
    "source": "TEST_FIXTURE",
}


@pytest.fixture(autouse=True)
def freeze_request_today(monkeypatch):
    # Date-only regression is anchored to the reported Nov 4–5 case; never
    # change the production clock or let these unit tests expire in a month.
    from app.planning import models

    class Today(date):
        @classmethod
        def today(cls):
            return date(2026, 11, 2)

    monkeypatch.setattr(models, "date", Today)
    from datetime import datetime, timezone

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            value = datetime(2026, 11, 2, 12, tzinfo=timezone.utc)
            return value.astimezone(tz) if tz else value.replace(tzinfo=None)

    monkeypatch.setattr(models, "datetime", FixedDateTime)


def request(**updates):
    return PlanRequest(
        temple_ids=["T0001"],
        origin="Uppal, Hyderabad",
        start_date=DATE,
        adults=3,
        priorities=["darshan"],
        **updates,
    )


def routes(points, travel=20):
    return {
        a["id"] + ">" + b["id"]: {
            "from": a["id"],
            "to": b["id"],
            "minutes": travel,
            "km": 12.5,
            "source": "TEST_FIXTURE_ROAD",
            "estimated": False,
            "url": "https://maps.google.com/",
        }
        for a in points
        for b in points
        if a["id"] != b["id"]
    }


def run(req, travel=20, opts=None, mutator=None):
    required = evidence.catalog(req.temple_ids, req.start_date, req.days)
    candidates, classified = discovery.discover(req, required)
    if mutator:
        mutator(required, candidates)
    opts = opts if opts is not None else evidence.stay_food(req, required + candidates)
    points = (
        [ORIGIN]
        + required
        + candidates
        + ([opts["selected_hotel"]] if opts.get("selected_hotel") else [])
        + [r for r in opts["restaurants"] if r.get("lat") is not None]
    )
    matrix = engine.buffered_routes(req, routes(points, travel))
    plan, budget, classified = engine.plan(
        req, required, candidates, classified, matrix, opts, ORIGIN
    )
    return plan, budget, classified, matrix, opts, required + candidates


def codes(plan):
    return {e["code"] for e in plan["conflicts"]}


def test_A_one_day_yadadri_full_visit_fits_window_and_exact_date():
    req = request()
    plan, b, _, _, _, places = run(req)
    assert plan["feasible"], plan["conflicts"]
    assert [d["date"] for d in plan["days"]] == ["2026-11-04"]
    visit = next(i for i in plan["days"][0]["items"] if i["type"] == "visit")
    assert visit["place_id"] == "T0001" and visit["duration_minutes"] == 75
    from app.planning.calendar import minutes

    assert any(
        a <= minutes(visit["start"]) and minutes(visit["end"]) <= z
        for a, z in places[0]["windows"]["2026-11-04"]
    )
    assert set(c["category"] for c in b["categories"]) == set(costing.CATEGORIES)
    assert len(b["daywise"]) == 1 and b["per_person"]["travellers"] == 3


def test_B_original_two_days_daily_return_no_fictional_stay():
    req = request(days=2, stay="hotel", include_attractions=True)
    plan, b, classified, _, _, _ = run(req)
    assert plan["feasible"], plan["conflicts"]
    assert [d["date"] for d in plan["days"]] == ["2026-11-04", "2026-11-05"]
    assert all(any(i["type"] == "visit" for i in d["items"]) for d in plan["days"])
    assert any(i.get("place_id") == "T0001" for i in plan["days"][0]["items"])
    assert any(c["classification"] == "scheduled" for c in classified)
    for day in plan["days"]:
        moves = [i for i in day["items"] if i["type"] == "travel"]
        assert moves[0]["from_id"] == "origin" and moves[-1]["to_id"] == "origin"
        assert day["maps_url"] and day["route_points"][0]["id"] == "origin"
    assert all(
        e["quantity"] == 0 and e["high"] == 0
        for e in b["items"]
        if e["category"] == "stay"
    )
    scheduled = {
        i["place_id"] for d in plan["days"] for i in d["items"] if i["type"] == "visit"
    }
    mapped = {p["id"] for d in plan["days"] for p in d["route_points"]}
    assert mapped == scheduled | {"origin"}
    assert all(
        c["classification"] == "optional"
        and c["reason"] == "coordinates_or_hours_missing"
        for c in classified
        if c["name"] == "Bhongir Fort"
    )


def fixture_hotel(req):
    return {
        "id": "HOTEL_TEST_FIXTURE",
        "name": "Explicit fixture only",
        "lat": 17.59,
        "lng": 78.95,
        "capacity_per_room": 3,
        "price_low": 1000,
        "price_high": 1800,
        "source_record": "TEST_FIXTURE",
        "check_in_minute": 720,
        "check_out_minute": 660,
        "maps_url": "https://maps.google.com/",
        "verification": "TEST_FIXTURE",
        "availability": "unverified",
    }


def test_C_overnight_with_evidenced_fixture_capacity_has_checkin_checkout_no_day1_home():
    req = request(days=2, stay="hotel", stay_mode="overnight", include_attractions=True)
    h = fixture_hotel(req)
    opts = {"hotels": [h], "selected_hotel": h, "restaurants": []}
    plan, b, _, _, _, _ = run(req, opts=opts)
    assert plan["feasible"], plan["conflicts"]
    first, last = plan["days"]
    assert not any(i.get("to_id") == "origin" for i in first["items"])
    assert any(i["type"] == "checkin" for i in first["items"])
    assert any(i["type"] == "checkout" for i in last["items"])
    assert next(i for i in last["items"] if i["type"] == "travel")["from_id"] == h["id"]
    assert [i for i in last["items"] if i["type"] == "travel"][-1]["to_id"] == "origin"
    assert first["overnight"]["rooms"] == 1
    stay = next(c for c in b["categories"] if c["category"] == "stay")
    assert stay["low"] == 1000 and stay["high"] == 1800
    assert any(
        w["code"] == "HOTEL_AVAILABILITY_UNVERIFIED"
        for w in plan["validation"]["warnings"]
    )


def test_C_actual_catalog_capacity_is_unknown_not_assumed_triple():
    req = request(days=2, stay="hotel", stay_mode="overnight", include_attractions=True)
    plan, b, _, _, opts, _ = run(req)
    assert not plan["feasible"] and "HOTEL_REQUIREMENTS_UNVERIFIED" in codes(plan)
    local = [h for h in opts["hotels"] if h["temple_id"] == "T0001"]
    assert len(local) == 8 and all(
        h["capacity_per_room"] is None and not h["requirements_match"] for h in local
    )
    assert "stay" in b["missing"] and b["within_cap"] is None


def test_D_required_alampur_not_replaced_and_longer_alternative_actually_checked():
    req = request().model_copy(update={"temple_ids": ["T0001", "T0006"]})
    required = evidence.catalog(req.temple_ids, req.start_date, req.days)
    # Explicit test road fixture: 210-minute intercity leg. 1-day fails, 2-day fits.
    matrix = engine.buffered_routes(req, routes([ORIGIN] + required, 210))
    opts = {"hotels": [], "restaurants": [], "selected_hotel": None}
    plan, _, _ = engine.plan(req, required, [], [], matrix, opts, ORIGIN)
    assert not plan["feasible"]
    alt = next(
        a for a in plan["alternatives"] if a["action"] == "extend_duration_or_overnight"
    )
    assert alt["suggested_days"] == 2 and alt["checked_feasible"], alt
    assert {
        i["place_id"]
        for d in alt["checked_days"]
        for i in d["items"]
        if i["type"] == "visit"
    } == {"T0001", "T0006"}


def test_E_elderly_rest_climbing_limit_and_wheelchair_not_falsely_certified():
    req = request(
        days=2,
        include_attractions=True,
        elderly=1,
        avoid_climbing=True,
        rest_minutes=30,
    )
    plan, _, classified, _, _, _ = run(req)
    assert plan["feasible"], plan["conflicts"]
    for day in plan["days"]:
        for n, item in enumerate(day["items"]):
            if item["type"] == "visit":
                assert (
                    item["duration_minutes"] >= 95
                    and day["items"][n + 1]["duration_minutes"] >= 30
                )
    assert not any(
        c["classification"] == "scheduled" and c.get("effort") == "climbing"
        for c in classified
    )
    wheel, *_ = run(request(special="wheel"))
    assert not wheel["feasible"] and "ACCESS_REQUIREMENTS_UNVERIFIED" in codes(wheel)
    limited, *_ = run(request(daily_travel_limit_minutes=30), travel=40)
    assert not limited["feasible"] and "DAILY_TRAVEL_LIMIT_EXCEEDED" in codes(limited)


def test_F_restrictive_budget_never_silent_overrun_and_allowances_complete_ledger():
    plan, b, *_ = run(request(budget_cap=50))
    assert not plan["feasible"] and "PRICED_COSTS_EXCEED_CAP" in codes(plan)
    assert b["within_cap"] is False
    assert "BUDGET_NOT_FULLY_PRICED" in codes(plan)
    req = request(
        budget_cap=100000,
        tolls_per_day={"low": 0, "high": 200},
        parking_per_visit={"low": 0, "high": 100},
        miscellaneous_per_day={"low": 0, "high": 300},
        meal_price_per_person={"low": 100, "high": 200},
    )
    plan, b, *_ = run(req)
    assert plan["feasible"] and b["complete"] and b["within_cap"] is True
    assert all(
        e["source"] == "user:allowance"
        for e in b["items"]
        if e["category"] in {"tolls", "parking", "miscellaneous"}
    )


def test_G_missing_hours_prices_useful_honest_partial():
    def missing(required, candidates):
        required[0]["windows"] = {}

    plan, b, *_ = run(
        request(),
        opts={"hotels": [], "restaurants": [], "selected_hotel": None},
        mutator=missing,
    )
    assert not plan["feasible"] and len(plan["days"]) == 1
    assert (
        plan["days"][0]["coverage"] == "incomplete"
        and plan["days"][0]["incomplete_reason"]
    )
    assert not b["complete"] and b["within_cap"] is None
    assert all(
        e["low"] is None and e["high"] is None
        for e in b["items"]
        if e["status"] == "unknown"
    )
    partial, b, *_ = run(
        request(), opts={"hotels": [], "restaurants": [], "selected_hotel": None}
    )
    assert partial["feasible"] and "food" in b["missing"]
    assert any(
        w["code"] == "MEAL_VENUE_UNCONFIRMED" for w in partial["validation"]["warnings"]
    )


def test_named_meal_requires_both_transfers_hours_diet_and_keeps_continuity():
    req = request()
    restaurant = {
        "id": "RESTAURANT_TEST_FIXTURE",
        "name": "Explicit meal fixture",
        "temple_id": "T0001",
        "lat": 17.588,
        "lng": 78.942,
        "windows": {"2026-11-04": [[360, 1380]]},
        "diet_match": True,
        "verification": "TEST_FIXTURE",
        "source_record": "TEST_FIXTURE",
        "maps_url": "https://maps.google.com/",
        "price_low": 100,
        "price_high": 200,
        "pure_veg": True,
    }
    places = evidence.catalog(req.temple_ids, req.start_date, req.days)
    opts = {"hotels": [], "restaurants": [restaurant], "selected_hotel": None}
    matrix = routes([ORIGIN] + places + [restaurant], travel=4)
    # Force breakfast before the first full 75-minute window.
    places[0]["windows"] = {"2026-11-04": [[600, 705]]}
    plan, b, _ = engine.plan(req, places, [], [], matrix, opts, ORIGIN)
    assert plan["feasible"], plan["conflicts"]
    meal = next(
        i for i in plan["days"][0]["items"] if i["type"] == "meal" and i.get("place_id")
    )
    assert meal["place_id"] == restaurant["id"] and meal["duration_minutes"] == 45
    moves = [i for i in plan["days"][0]["items"] if i["type"] == "travel"]
    assert any(i["to_id"] == restaurant["id"] for i in moves) and any(
        i["from_id"] == restaurant["id"] for i in moves
    )
    restaurant["windows"] = {}
    errors = validation.validate(req, places, plan, matrix, opts, b)
    assert not errors["passed"] and "MEAL_HOURS_INVALID" in {
        e["code"] for e in errors["critical"]
    }


@pytest.mark.parametrize(
    "mutation,expected",
    [
        ("empty", "DAY_UNPLANNED"),
        ("date", "DATE_RANGE_INVALID"),
        ("primary", "REQUIRED_VISIT_MISSING_OR_DUPLICATED"),
        ("food_quantity", "BUDGET_MEAL_QUANTITY_INVALID"),
        ("rooms", "BUDGET_ROOM_NIGHTS_INVALID"),
        ("total", "BUDGET_TOTAL_INVALID"),
        ("perperson", "BUDGET_PER_PERSON_INVALID"),
        ("category", "BUDGET_CATEGORY_MISSING"),
        ("unknownzero", "UNKNOWN_PRICE_AS_ZERO"),
        ("duration", "VISIT_TOO_SHORT"),
        ("return", "RETURN_MISSING"),
        ("route", "ROUTE_TOTAL_INVALID"),
        ("window", "CLOSED_DURING_VISIT"),
        ("rest", "REST_MISSING"),
        ("daytotal", "BUDGET_DAY_TOTAL_INVALID"),
        ("completeness", "BUDGET_COMPLETENESS_INVALID"),
    ],
)
def test_independent_gate_rejects_mutations(mutation, expected):
    req = request()
    plan, b, _, matrix, opts, places = run(req)
    assert plan["feasible"]
    items = plan["days"][0]["items"]
    if mutation == "empty":
        items.clear()
    elif mutation == "date":
        plan["days"][0]["date"] = "2026-11-03"
    elif mutation == "primary":
        next(i for i in items if i["type"] == "visit")["place_id"] = "T0009"
    elif mutation == "food_quantity":
        next(e for e in b["items"] if e["category"] == "food")["quantity"] += 1
    elif mutation == "rooms":
        next(e for e in b["items"] if e["category"] == "stay")["quantity"] = 1
    elif mutation == "total":
        b["high"] += 1
    elif mutation == "perperson":
        b["per_person"]["high"] += 1
    elif mutation == "category":
        b["categories"].pop()
    elif mutation == "unknownzero":
        next(e for e in b["items"] if e["status"] == "unknown")["low"] = 0
    elif mutation == "duration":
        from app.planning.calendar import clock, minutes

        item = next(i for i in items if i["type"] == "visit")
        item["duration_minutes"] = 5
        item["end"] = clock(minutes(item["start"]) + 5)
    elif mutation == "return":
        items.pop()
    elif mutation == "route":
        next(i for i in items if i["type"] == "travel")["distance_km"] += 5
    elif mutation == "window":
        places[0]["windows"] = {}
    elif mutation == "rest":
        next(i for i in items if i["type"] == "rest")["type"] = "wait"
    elif mutation == "daytotal":
        b["daywise"][0]["low"] += 1
    elif mutation == "completeness":
        b["complete"] = True
    gate = validation.validate(req, places, plan, matrix, opts, b)
    assert not gate["passed"] and expected in {e["code"] for e in gate["critical"]}


@pytest.mark.parametrize(
    "updates",
    [
        {"stay_mode": "overnight", "days": 1, "stay": "hotel"},
        {"stay_mode": "overnight", "days": 2},
        {"primary_temple_id": "T0006"},
        {"traffic_buffer_percent": float("nan")},
        {"meal_price_per_person": {"low": 300, "high": 100}},
        {"timezone": "America/Los_Angeles"},
    ],
)
def test_contradictions_and_nonfinite_allowances_rejected(updates):
    with pytest.raises(ValidationError):
        request(**updates)


@pytest.mark.parametrize("days", [1, 2, 3, 7])
def test_date_request_serialization_catalog_and_results_preserve_entire_range(days):
    req = request(days=days)
    loaded = PlanRequest.model_validate_json(req.model_dump_json())
    assert loaded.start_date == DATE
    places = evidence.catalog(req.temple_ids, req.start_date, req.days)
    expected = [(DATE + timedelta(days=i)).isoformat() for i in range(days)]
    assert list(places[0]["windows"]) == expected
    plan, b, *_ = run(req)
    assert [d["date"] for d in plan["days"]] == expected
    assert [d["date"] for d in b["daywise"]] == expected
    if days > 1:
        assert not plan["feasible"] and "DAY_UNPLANNED" in codes(plan)


def test_calendar_unknown_working_days_not_fabricated_and_midnight_hours():
    req = request(days=2)
    raw = {
        "workingHours": {
            "openingTime": "11:00 AM",
            "closingTime": "01:00 AM",
            "workingDays": ["Wednesday"],
        }
    }
    assert options.restaurant_windows(raw, req) == {
        "2026-11-04": [[660, 1439]],
        "2026-11-05": [[0, 60]],
    }
    raw["workingHours"].pop("workingDays")
    assert not any(options.restaurant_windows(raw, req).values())


def test_followups_preserve_context_and_make_policy_changes_explicit():
    req = request().model_dump(mode="json")
    assert intent.fallback("stay overnight", req).changes == {"stay_mode": "overnight"}
    assert intent.fallback("return home daily", req).changes == {
        "stay_mode": "daily_return"
    }
    assert intent.fallback("no hotel", req).changes == {
        "stay": "none",
        "stay_mode": "daily_return",
    }


@pytest.mark.parametrize(
    "field,code",
    [
        ("known_subtotal", "BUDGET_KNOWN_SUBTOTAL_INVALID"),
        ("estimated_subtotal", "BUDGET_ESTIMATED_SUBTOTAL_INVALID"),
    ],
)
def test_subtotals_independently_recomputed(field, code):
    req = request()
    plan, b, _, matrix, opts, places = run(req)
    if field == "known_subtotal":
        b[field] += 10
    else:
        b[field]["high"] += 10
    gate = validation.validate(req, places, plan, matrix, opts, b)
    assert code in {e["code"] for e in gate["critical"]}


def test_fuel_quantities_checked_against_route_not_just_consistent_ledger():
    req = request()
    plan, b, _, matrix, opts, places = run(req)
    fuel = next(e for e in b["items"] if e["category"] == "fuel")
    fuel["quantity"] += 1
    delta = fuel["unit_low"]
    fuel["low"] += delta
    fuel["high"] += delta
    category = next(c for c in b["categories"] if c["category"] == "fuel")
    for key in ["low", "high"]:
        b[key] = round(b[key] + delta, 2)
        b["per_person"][key] = round(b[key] / 3, 2)
        category[key] = round(category[key] + delta, 2)
        b["daywise"][0][key] = round(b["daywise"][0][key] + delta, 2)
        b["estimated_subtotal"][key] = round(b["estimated_subtotal"][key] + delta, 2)
    gate = validation.validate(req, places, plan, matrix, opts, b)
    assert {e["code"] for e in gate["critical"]} == {"BUDGET_FUEL_QUANTITY_INVALID"}


@pytest.mark.parametrize("bad", ["nonmatch", "ambiguous", "outside", "town_only"])
def test_venue_geocoder_never_promotes_ambiguous_or_unrelated_hits(
    tmp_path, monkeypatch, bad
):
    from app.planning import venues
    from app.travel.schemas import PlaceCandidate

    monkeypatch.setattr(venues, "ROOT", tmp_path)
    valid = PlaceCandidate(
        display_name="Example Udupi Kitchen, Telangana",
        latitude=17.588,
        longitude=78.941,
        source="nominatim",
        place_type="restaurant",
    )
    if bad == "nonmatch":
        hits = [valid.model_copy(update={"display_name": "Unrelated Diner"})]
    elif bad == "ambiguous":
        hits = [valid, valid.model_copy(update={"latitude": 17.589})]
    elif bad == "outside":
        hits = [valid.model_copy(update={"latitude": 12.9})]
    else:
        hits = [valid.model_copy(update={"place_type": "town"})]
    calls = []
    monkeypatch.setattr(venues, "search", lambda *a, **k: calls.append(a) or hits)
    v = {
        "id": "R_TEST",
        "name": "Example Udupi Kitchen",
        "city": "Test City",
        "lat": None,
        "lng": None,
    }
    anchor = {"lat": 17.589, "lng": 78.942}
    assert venues._lookup(v, anchor) is None
    assert (
        venues._lookup(v, anchor) is None and len(calls) == 1
    )  # negative cache avoids duplicate API calls
    assert v["lat"] is None


def test_venue_enrichment_only_adds_evidenced_coordinates_not_availability(
    tmp_path, monkeypatch
):
    from app.planning import venues
    from app.travel.schemas import PlaceCandidate

    monkeypatch.setattr(venues, "ROOT", tmp_path)
    candidate = PlaceCandidate(
        display_name="Example Udupi Kitchen, Telangana",
        latitude=17.588,
        longitude=78.941,
        source="nominatim",
        place_type="restaurant",
    )
    monkeypatch.setattr(venues, "search", lambda *a, **k: [candidate])
    v = {
        "id": "R_TEST",
        "name": "Example Udupi Kitchen",
        "city": "Test City",
        "lat": None,
        "lng": None,
    }
    match = venues._lookup(v, {"lat": 17.589, "lng": 78.942})
    assert match["lat"] == candidate.latitude and "coordinates_source" in match
    assert "availability" not in match and "capacity_per_room" not in match


def test_same_open_close_time_is_unknown_not_assumed_24_hours():
    raw = {
        "workingHours": {
            "openingTime": "12:00 AM",
            "closingTime": "12:00 AM",
            "workingDays": ["Wednesday"],
        }
    }
    assert options.restaurant_windows(raw, request()) == {}


def test_progress_callback_wraps_real_cost_and_validation_work():
    req = request()
    places = evidence.catalog(req.temple_ids, req.start_date, req.days)
    stages = []
    engine.plan(
        req,
        places,
        [],
        [],
        routes([ORIGIN] + places),
        {"hotels": [], "restaurants": [], "selected_hotel": None},
        ORIGIN,
        progress=stages.append,
    )
    assert stages == ["schedule", "budget", "validate"]


def test_hotel_candidates_are_tried_inside_search_not_fixed_before_routing():
    req = request(days=2, stay="hotel", stay_mode="overnight", include_attractions=True)
    primary = evidence.catalog(req.temple_ids, req.start_date, req.days)
    candidates, classified = discovery.discover(req, primary)
    first = fixture_hotel(req)
    second = {
        **first,
        "id": "HOTEL_SECOND_TEST_FIXTURE",
        "price_low": 1200,
        "price_high": 1900,
    }
    points = [ORIGIN] + primary + candidates + [first, second]
    matrix = routes(points)
    matrix = {key: leg for key, leg in matrix.items() if first["id"] not in key}
    opts = {"hotels": [first, second], "restaurants": [], "selected_hotel": first}
    plan, b, _ = engine.plan(req, primary, candidates, classified, matrix, opts, ORIGIN)
    assert plan["feasible"], plan["conflicts"]
    assert opts["selected_hotel"]["id"] == second["id"]
    assert next(c for c in b["categories"] if c["category"] == "stay")["low"] == 1200


def test_unselected_candidates_distinguish_feasible_lower_rank_from_failed_checks():
    # Explicit temporal fixture, not a change to any production opening hours.
    def equal_candidates(required, candidates):
        for candidate in candidates:
            candidate["visit_minutes"] = 75
            candidate["windows"] = {DATE.isoformat(): [[420, 1260]]}

    req = request(include_attractions=True, finish="12:00")
    plan, _, classified, *_ = run(req, travel=10, mutator=equal_candidates)
    assert plan["feasible"], plan["conflicts"]
    optional = [c for c in classified if c.get("reason") == "feasible_lower_rank"]
    assert optional
    for candidate in optional:
        attempted = [
            d
            for d in plan["search"]["diagnostics"]
            if candidate["id"] in d["candidate_ids"]
        ]
        assert any(not d["critical_codes"] for d in attempted)
        assert candidate["reason_codes"] == []


def test_conditional_overnight_draft_retains_days_without_inventing_a_hotel():
    req = request(
        days=2,
        stay="hotel",
        stay_mode="overnight",
        include_attractions=True,
        allow_unconfirmed_stay=True,
        time_grid_minutes=5,
    )
    plan, b, _, _, opts, _ = run(req, travel=13)
    assert not plan["feasible"]
    assert "HOTEL_REQUIREMENTS_UNVERIFIED" in codes(plan)
    assert "PRIMARY_TEMPLE_MISSING" not in codes(plan), plan["conflicts"]
    assert all(any(i["type"] == "visit" for i in d["items"]) for d in plan["days"])
    assert (
        opts["selected_hotel"] is None
        and opts["overnight_area"]["kind"] == "overnight_area"
    )
    assert not any(
        i["type"] in {"checkin", "checkout"} for d in plan["days"] for i in d["items"]
    )
    assert not any(i.get("to_id") == "origin" for i in plan["days"][0]["items"])
    assert any(i.get("to_id") == "origin" for i in plan["days"][-1]["items"])
    assert "stay" in b["missing"]
    assert (
        next(i for i in b["items"] if i["category"] == "stay" and i["quantity"])[
            "unit_low"
        ]
        is None
    )


def test_five_minute_grid_is_conservative_and_independently_validated():
    from app.planning.calendar import minutes

    req = request(
        time_grid_minutes=5,
        departure="07:02",
        finish="21:03",
        visit_minutes=76,
        rest_minutes=17,
        parking_buffer_minutes=11,
        meal_minutes=61,
    )
    plan, b, _, matrix, opts, places = run(req, travel=13)
    assert plan["feasible"], plan["conflicts"]
    assert all(
        minutes(i["start"]) % 5 == minutes(i["end"]) % 5 == 0
        for d in plan["days"]
        for i in d["items"]
    )
    assert (
        next(i for i in plan["days"][0]["items"] if i["type"] == "visit")[
            "duration_minutes"
        ]
        >= 80
    )
    assert all(v["minutes"] >= v["routing_minutes"] for v in matrix.values())
    bad = deepcopy(plan)
    bad["days"][0]["items"][0]["start"] = "07:06"
    assert "TIME_GRID_INVALID" in {
        e["code"]
        for e in validation.validate(req, places, bad, matrix, opts, b)["critical"]
    }


@pytest.mark.parametrize(
    "text,expected",
    [
        ("nalonda", "Nalgonda"),
        ("nizambad", "Nizamabad"),
        ("mahbubnagar", "Mahabubnagar"),
        ("adilabad", "Adilabad"),
        ("khammam", "Khammam"),
    ],
)
def test_origin_name_normalization_is_scoped_and_does_not_invent_coordinates(
    text, expected
):
    from app.planning.origins import canonical_city

    assert canonical_city(text) == expected
    assert canonical_city("Uppal, Hyderabad") is None
    assert canonical_city("Khammam railway station") is None


def test_origin_resolver_prefers_city_over_same_name_district_and_keeps_real_ambiguity(
    monkeypatch, tmp_path
):
    from app.planning import origins
    from app.travel.schemas import PlaceCandidate
    from app.travel.resolver import TravelResolverClarificationError

    monkeypatch.setattr(origins, "CACHE", tmp_path)
    city = PlaceCandidate(
        display_name="Khammam, Telangana, India",
        latitude=17.2465,
        longitude=80.15,
        source="TEST_FIXTURE",
        place_type="city",
    )
    district = PlaceCandidate(
        display_name="Khammam District, Telangana, India",
        latitude=17.5,
        longitude=80.4,
        source="TEST_FIXTURE",
        place_type="administrative",
    )
    monkeypatch.setattr(origins, "search", lambda *a, **k: [district, city])
    assert origins.resolve_origin("khammam").coordinates.latitude == city.latitude
    for p in tmp_path.glob("*"):
        p.unlink()
    other = city.model_copy(update={"latitude": 18.2})
    monkeypatch.setattr(origins, "search", lambda *a, **k: [city, other])
    with pytest.raises(TravelResolverClarificationError):
        origins.resolve_origin("khammam")

    monkeypatch.setattr(origins, "search", lambda *a, **k: [district])
    with pytest.raises(TravelResolverClarificationError):
        origins.resolve_origin("khammam")  # Never silently use a district centroid.
