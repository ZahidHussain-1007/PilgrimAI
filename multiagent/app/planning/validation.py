"""Independent acceptance gate. Recompute coverage, continuity, resource units
and totals from the chosen activities, not the optimizer's feasibility claim.
"""

import math
from datetime import timedelta

from .calendar import minutes
from .costing import CATEGORIES
from .solver import (
    State,
    _journey,
    day_purpose,
    validate as timeline_validate,
)


def validate(req, places, schedule, matrix, options, budget):
    errors = []
    warnings = []
    days = schedule.get("days", [])
    hotel = options.get("selected_hotel")

    def error(code, *details):
        errors.append(dict(code=code, details=[str(d) for d in details]))

    def warn(code, *details):
        warnings.append(dict(code=code, details=[str(d) for d in details]))

    requested = [
        (req.start_date + timedelta(days=i)).isoformat() for i in range(req.days)
    ]
    if [d.get("date") for d in days] != requested:
        error("DATE_RANGE_INVALID", requested)
    actual = [
        i.get("place_id")
        for d in days
        for i in d.get("items", [])
        if i.get("type") == "visit"
    ]
    for tid in req.temple_ids:
        if actual.count(tid) != 1:
            error("REQUIRED_VISIT_MISSING_OR_DUPLICATED", tid)
    if req.primary_temple_id not in actual:
        error("PRIMARY_TEMPLE_MISSING", req.primary_temple_id)
    known = {p["id"]: p for p in places}
    if len(set(actual)) != len(actual):
        error("DUPLICATE_VISIT", actual)
    if any(t not in known for t in actual):
        error("UNEVIDENCED_VISIT", actual)
    if req.stay_mode == "overnight" and hotel is None:
        area = options.get("overnight_area")
        if area and req.allow_unconfirmed_stay:
            # The traveller accepted a conditional stay and the night is
            # anchored on the destination area. Still reported - as a
            # warning, because nothing about a property is confirmed - but
            # it no longer blocks an otherwise schedulable route.
            warn(
                "STAY_UNVERIFIED",
                area.get("name") or area.get("id"),
                options.get("hotel_unverified_reason")
                or "No property has evidenced room capacity and check-in/out times.",
            )
        else:
            error(
                "HOTEL_REQUIREMENTS_UNVERIFIED",
                options.get("hotel_unverified_reason")
                or "No property has evidenced room capacity, coordinates and "
                "check-in/out times. Choose an unverified stay area, or add a "
                "property record with verified capacity and location.",
            )
    if req.stay_mode == "daily_return" and any(
        i.get("type") in {"checkin", "checkout"}
        for d in days
        for i in d.get("items", [])
    ):
        error("HOTEL_WITH_DAILY_RETURN")
    # v23.2: "the visit is missing" is accurate but useless when the real
    # reason is that the starting point is too far away. These diagnostics
    # only ever run when no visit was scheduled, so they can never change a
    # passing plan - they replace a vague failure with an actionable one.
    if not actual and req.days and days:
        out = matrix.get("origin>" + req.primary_temple_id) or {}
        back = matrix.get(req.primary_temple_id + ">origin") or {}
        if out.get("minutes") is not None and back.get("minutes") is not None:
            round_trip = float(out["minutes"]) + float(back["minutes"])
            per_day = minutes(req.finish) - minutes(req.departure)
            available = per_day * req.days
            if round_trip > available:
                error(
                    "ROUND_TRIP_TOO_LONG",
                    f"{round_trip / 60:.1f} h of driving is needed for the "
                    f"round trip, but {req.days} day(s) only allow "
                    f"{available / 60:.1f} h.",
                )
            else:
                # Reuse the solver's own journey arithmetic (breaks included)
                # so the diagnosis matches the failure instead of guessing
                # from raw provider minutes.
                finish = minutes(req.finish)
                probe = State(
                    0,
                    0,
                    "origin",
                    minutes(req.departure),
                    0.0,
                    [{"date": days[0]["date"], "items": []}],
                )
                outbound = _journey(probe, req.primary_temple_id, matrix, req)
                # You can only drive home after the visit, so the return probe
                # starts at the earliest possible departure from the temple.
                earliest_return = (
                    minutes(req.departure)
                    + req.parking_buffer_minutes
                    + req.visit_minutes
                    + req.rest_minutes
                )
                returning = _journey(
                    State(
                        0,
                        0,
                        req.primary_temple_id,
                        earliest_return,
                        0.0,
                        [{"date": days[0]["date"], "items": []}],
                    ),
                    "origin",
                    matrix,
                    req,
                )
                too_long = None
                if outbound and outbound.now > finish:
                    too_long = outbound.now - minutes(req.departure)
                elif returning and returning.now > finish:
                    too_long = returning.now - earliest_return
                if too_long is not None:
                    error(
                        "DRIVE_EXCEEDS_DAILY_WINDOW",
                        f"This drive takes about {too_long / 60:.1f} h "
                        f"(breaks included) and cannot fit in a "
                        f"{req.departure}-{req.finish} planning day. Add a day "
                        f"or start closer.",
                    )
                elif outbound:
                    primary = next(
                        (p for p in places if p.get("id") == req.primary_temple_id),
                        {},
                    )
                    arrival = outbound.now + req.parking_buffer_minutes
                    closings = [
                        max(hi for _lo, hi in primary["windows"].get(day["date"], []))
                        for day in days
                        if primary.get("windows", {}).get(day["date"])
                    ]
                    if closings and all(
                        arrival + req.visit_minutes > closing
                        for closing in closings
                    ):
                        error(
                            "ARRIVAL_AFTER_CLOSING",
                            f"Leaving at {req.departure} reaches "
                            f"{req.primary_temple_id} at "
                            f"{arrival // 60:02d}:{arrival % 60:02d}, after the "
                            f"published visiting windows close on every "
                            f"requested date.",
                        )
    if actual:
        synthetic = req.model_copy(update={"temple_ids": list(dict.fromkeys(actual))})
        try:
            errors += timeline_validate(
                synthetic,
                places,
                schedule,
                matrix,
                hotel=hotel or options.get("overnight_area"),
            )
        except (KeyError, TypeError, ValueError, OverflowError):
            error("MALFORMED_TIMELINE")
    if req.daily_travel_limit_minutes and req.stay_mode == "daily_return":
        for tid in req.temple_ids:
            legs = [
                matrix.get("origin>" + tid, {}).get("minutes"),
                matrix.get(tid + ">origin", {}).get("minutes"),
            ]
            if (
                all(isinstance(x, (int, float)) for x in legs)
                and sum(math.ceil(x) for x in legs) > req.daily_travel_limit_minutes
            ):
                error(
                    "DAILY_TRAVEL_LIMIT_EXCEEDED",
                    tid,
                    "Shortest evidenced round-trip already exceeds the daily driving cap.",
                )
    for day_index, day in enumerate(days):
        items = day.get("items", [])
        if req.time_grid_minutes > 1 and any(
            minutes(i["start"]) % req.time_grid_minutes
            or minutes(i["end"]) % req.time_grid_minutes
            for i in items
        ):
            error("TIME_GRID_INVALID", day.get("date"))
        visits = [i for i in items if i.get("type") == "visit"]
        # v23.2: a day with a committed non-visit purpose (final-day return,
        # check-in/out, transfer to the lodging) is planned. Requiring a visit
        # every day made single-temple overnight trips unrepresentable.
        lodging = (
            (options.get("selected_hotel") or options.get("overnight_area") or {}).get("id")
        )
        purpose = day_purpose(
            day, day_index, len(days), lodging_id=lodging
        )
        if purpose is None:
            error(
                "DAY_UNPLANNED",
                day.get("date"),
                day.get("incomplete_reason", "No evidenced activity fits this date."),
            )
        meal_names = [i.get("meal") for i in items if i.get("type") == "meal"]
        if len(meal_names) != len(set(meal_names)):
            error("DUPLICATE_MEAL", day.get("date"))
        travel = sum(
            i.get("duration_minutes", 0) for i in items if i.get("type") == "travel"
        )
        if req.daily_travel_limit_minutes and travel > req.daily_travel_limit_minutes:
            error(
                "DAILY_TRAVEL_LIMIT_EXCEEDED",
                day.get("date"),
                travel,
                req.daily_travel_limit_minutes,
            )
        if travel > (240 if req.elderly or req.special != "none" else 360):
            warn("HIGH_TRAVEL_FATIGUE", day.get("date"), travel)
        base = hotel or options.get("overnight_area")
        location = base["id"] if base and day != days[0] else "origin"
        for item in items:
            if item.get("type") == "travel" and item.get("leg_complete"):
                location = item.get("to_id")
            if item.get("type") == "visit":
                place = known.get(item.get("place_id"), {})
                if req.avoid_climbing and place.get("effort") == "climbing":
                    error("CLIMBING_CONFLICT", place.get("id"))
                if req.avoid_climbing and place.get("effort") == "assisted_access":
                    error(
                        "ACCESS_REQUIREMENTS_UNVERIFIED",
                        place.get("id"),
                        "Lift or step-free assistance requires date-specific confirmation.",
                    )
                if req.elderly and place.get("effort") == "long_walk":
                    warn("LONG_WALK_COMFORT_REVIEW", place.get("id"))
            if item.get("type") == "meal":
                venue = next(
                    (
                        r
                        for r in options.get("restaurants", [])
                        if r["id"] == item.get("place_id")
                    ),
                    None,
                )
                if venue:
                    if item.get("place_id") != location or venue.get("lat") is None:
                        error("MEAL_LOCATION_INVALID", item.get("place_id"))
                    if not venue.get("diet_match"):
                        error("MEAL_DIET_UNVERIFIED", item.get("place_id"))
                    if not any(
                        lo <= minutes(item["start"]) and minutes(item["end"]) <= hi
                        for lo, hi in venue.get("windows", {}).get(day["date"], [])
                    ):
                        error("MEAL_HOURS_INVALID", item.get("place_id"))
                    if item.get("source_record") != venue.get(
                        "source_record"
                    ) or item.get("url") != venue.get("maps_url"):
                        error("MEAL_EVIDENCE_INVALID", item.get("place_id"))
                elif item.get("place_id"):
                    error("UNEVIDENCED_MEAL_VENUE", item.get("place_id"))
                else:
                    warn("MEAL_VENUE_UNCONFIRMED", day["date"], item.get("meal"))
            if item.get("type") in {"checkin", "checkout"}:
                if (
                    not hotel
                    or item.get("place_id") != hotel["id"]
                    or location != hotel["id"]
                ):
                    error("HOTEL_LOCATION_INVALID", day["date"])
                elif (
                    item.get("type") == "checkin"
                    and minutes(item["start"]) < hotel["check_in_minute"]
                ):
                    error("CHECKIN_TOO_EARLY")
                elif (
                    item.get("type") == "checkout"
                    and minutes(item["end"]) > hotel["check_out_minute"]
                ):
                    error("CHECKOUT_TOO_LATE")
                if item.get("duration_minutes", 0) < 15:
                    error("HOTEL_BUFFER_MISSING")
    if hotel:
        people = req.adults + req.children + req.elderly
        capacity = hotel.get("capacity_per_room")
        if not isinstance(capacity, int) or capacity * req.rooms < people:
            error("ROOM_CAPACITY_UNVERIFIED", people, req.rooms)
        if hotel.get("availability") != "verified":
            warn("HOTEL_AVAILABILITY_UNVERIFIED", hotel["id"])
        if len([i for d in days for i in d["items"] if i["type"] == "checkin"]) != 1:
            error("HOTEL_CHECKIN_MISSING")
        if len([i for d in days for i in d["items"] if i["type"] == "checkout"]) != 1:
            error("HOTEL_CHECKOUT_MISSING")
        for index, day in enumerate(days):
            if index < req.days - 1 and any(
                i.get("to_id") == "origin"
                for i in day["items"]
                if i["type"] == "travel"
            ):
                error("PREMATURE_HOME_RETURN", day["date"])
    if req.special in {"wheel", "medical"}:
        error(
            "ACCESS_REQUIREMENTS_UNVERIFIED",
            "Catalog accessibility notes do not certify date-specific assistance.",
        )
    if req.food in {"jain", "nonveg"} and any(
        i.get("type") == "meal" and not i.get("place_id")
        for d in days
        for i in d["items"]
    ):
        error("MEAL_DIET_UNVERIFIED", req.food)
    if req.transport in {"bus", "train"}:
        error(
            "SERVICE_TIMETABLE_UNVERIFIED",
            "Road scenario is not a published service timetable.",
        )
    people = req.adults + req.children + req.elderly
    entries = budget.get("items", [])

    def near(a, b):
        return isinstance(a, (int, float)) and math.isfinite(a) and abs(a - b) <= 0.011

    for e in entries:
        if e.get("date") not in requested or e.get("category") not in CATEGORIES:
            error("BUDGET_ENTRY_INVALID", e.get("date"), e.get("category"))
        if e.get("status") == "unknown":
            if any(
                e.get(k) is not None for k in ["low", "high", "unit_low", "unit_high"]
            ):
                error("UNKNOWN_PRICE_AS_ZERO", e.get("category"))
        else:
            try:
                if (
                    e["quantity"] < 0
                    or e["unit_low"] < 0
                    or e["unit_high"] < e["unit_low"]
                    or not near(e["low"], round(e["quantity"] * e["unit_low"], 2))
                    or not near(e["high"], round(e["quantity"] * e["unit_high"], 2))
                ):
                    error("BUDGET_UNIT_MATH_INVALID", e.get("category"))
            except (KeyError, TypeError):
                error("BUDGET_UNIT_MATH_INVALID", e.get("category"))
    for key in ["low", "high"]:
        total = round(sum(e.get(key) or 0 for e in entries), 2)
        if not near(budget.get(key), total):
            error("BUDGET_TOTAL_INVALID", key)
        if not near(budget.get("per_person", {}).get(key), round(total / people, 2)):
            error("BUDGET_PER_PERSON_INVALID", key)
    expected_known = round(
        sum(e.get("low") or 0 for e in entries if e["status"] == "catalog_price"), 2
    )
    if not near(budget.get("known_subtotal"), expected_known):
        error("BUDGET_KNOWN_SUBTOTAL_INVALID")
    for key in ["low", "high"]:
        expected = round(
            sum(e.get(key) or 0 for e in entries if e["status"] == "estimated"), 2
        )
        if not near(budget.get("estimated_subtotal", {}).get(key), expected):
            error("BUDGET_ESTIMATED_SUBTOTAL_INVALID", key)
    if [d.get("date") for d in budget.get("daywise", [])] != requested:
        error("BUDGET_DAY_RANGE_INVALID")
    for day in budget.get("daywise", []):
        es = [e for e in entries if e["date"] == day["date"]]
        if set(e["category"] for e in es) != set(CATEGORIES):
            error("BUDGET_CATEGORY_MISSING", day["date"])
        for key in ["low", "high"]:
            if not near(day.get(key), round(sum(e.get(key) or 0 for e in es), 2)):
                error("BUDGET_DAY_TOTAL_INVALID", day["date"])
    for category in budget.get("categories", []):
        for key in ["low", "high"]:
            if not near(
                category.get(key),
                round(
                    sum(
                        e.get(key) or 0
                        for e in entries
                        if e["category"] == category["category"]
                    ),
                    2,
                ),
            ):
                error("BUDGET_CATEGORY_TOTAL_INVALID", category["category"])
    if set(c.get("category") for c in budget.get("categories", [])) != set(CATEGORIES):
        error("BUDGET_CATEGORY_MISSING")
    # Independently tie ledger quantities to the actual chosen day, not just
    # internally consistent ledger arithmetic or trip-wide sums.
    for index, day in enumerate(days):
        es = [e for e in entries if e["date"] == day["date"]]
        visits = [i for i in day["items"] if i["type"] == "visit"]
        meals_on_day = [i for i in day["items"] if i["type"] == "meal"]

        def quantity(category):
            return sum(e["quantity"] for e in es if e["category"] == category)

        if quantity("food") != people * len(meals_on_day):
            error("BUDGET_MEAL_QUANTITY_INVALID", day["date"])
        if quantity("parking") != len(visits):
            error("BUDGET_PARKING_QUANTITY_INVALID", day["date"])
        if quantity("tolls") != 1 or quantity("miscellaneous") != 1:
            error("BUDGET_DAY_QUANTITY_INVALID", day["date"])
        nights_on_day = (
            req.rooms if req.stay_mode == "overnight" and index < req.days - 1 else 0
        )
        if quantity("stay") != nights_on_day:
            error("BUDGET_ROOM_NIGHTS_INVALID", day["date"])
        admissions = [
            e
            for e in es
            if e["category"] in {"darshan_sevas", "attraction_entry"}
            and e.get("place_id")
        ]
        if sorted(e["place_id"] for e in admissions) != sorted(
            i["place_id"] for i in visits
        ) or any(e["quantity"] != people for e in admissions):
            error("BUDGET_ADMISSION_QUANTITY_INVALID", day["date"])
        moves = [i for i in day["items"] if i["type"] == "travel"]
        if req.transport == "car" and moves:
            expected_km = round(sum(i.get("distance_km", 0) for i in moves), 4)
            if not near(quantity("fuel"), expected_km):
                error("BUDGET_FUEL_QUANTITY_INVALID", day["date"])
        elif req.transport != "car" and any(
            (e.get("high") or 0) != 0 for e in es if e["category"] == "fuel"
        ):
            error("BUDGET_FUEL_NOT_APPLICABLE")
    meals = sum(i["type"] == "meal" for d in days for i in d["items"])
    if sum(e["quantity"] for e in entries if e["category"] == "food") != people * meals:
        error("BUDGET_MEAL_QUANTITY_INVALID")
    nights = req.rooms * (req.days - 1) if req.stay_mode == "overnight" else 0
    if sum(e["quantity"] for e in entries if e["category"] == "stay") != nights:
        error("BUDGET_ROOM_NIGHTS_INVALID")
    missing = sorted(
        {e["category"] for e in entries if e["status"] == "unknown"}
        | ({"transport_fare"} if req.transport != "car" else set())
    )
    if budget.get("missing") != missing or budget.get("complete") != (not missing):
        error("BUDGET_COMPLETENESS_INVALID")
    if req.budget_cap is not None:
        if budget.get("high", 0) > req.budget_cap:
            error("PRICED_COSTS_EXCEED_CAP", budget["high"], req.budget_cap)
        if missing:
            error("BUDGET_NOT_FULLY_PRICED", *missing)
    elif missing:
        warn("BUDGET_PARTIAL", *missing)
    # Deduplicate repeated checks without trusting a supplied severity.
    unique = {(e["code"], tuple(e["details"])): e for e in errors}
    return {
        "passed": not unique,
        "critical": list(unique.values()),
        "warnings": warnings,
        "checks": "dates/day coverage/required-primary/windows/durations/route continuity/returns/meals/rest/stay-occupancy/cost units/totals/cap/access/fatigue",
    }
