"""Central bounded candidate planner. Hard constraints and independent validation
precede preferences. A bounded search is never represented as an optimality proof.
"""

import itertools
import math
import time
from datetime import timedelta
from urllib.parse import urlencode

from . import costing, validation
from .solver import _allowances, solve


def requested_dates(req):
    return [(req.start_date + timedelta(days=i)).isoformat() for i in range(req.days)]


def buffered_routes(req, matrix):
    result = {}
    for key, leg in matrix.items():
        out = {
            **leg,
            "routing_minutes": leg.get("minutes"),
            "traffic_buffer_percent": req.traffic_buffer_percent,
            "traffic_live": False,
        }
        if leg.get("minutes") is not None:
            buffered = math.ceil(
                leg["minutes"] * (1 + req.traffic_buffer_percent / 100)
            )
            out["minutes"] = (
                math.ceil(buffered / req.time_grid_minutes) * req.time_grid_minutes
            )
            out["traffic_buffer_minutes"] = buffered - leg["minutes"]
            out["rounding_buffer_minutes"] = out["minutes"] - buffered
        result[key] = out
    return result


def _pad(req, schedule):
    by_date = {d["date"]: d for d in schedule.get("days", [])}
    days = []
    for date in requested_dates(req):
        d = by_date.get(date, {"date": date, "items": []})
        active = any(i.get("type") == "visit" for i in d["items"])
        d["coverage"] = "planned" if active else "incomplete"
        if not active:
            d["incomplete_reason"] = (
                "No evidence-backed activity was scheduled for this date; constraints or missing data require a revision."
            )
        days.append(d)
    schedule["days"] = days
    return schedule


def _maps(req, schedule, origin, places, options):
    known = {
        p["id"]: p
        for p in [origin]
        + places
        + options.get("hotels", [])
        + options.get("restaurants", [])
    }
    for index, day in enumerate(schedule["days"]):
        ids = (
            ["origin"]
            if index == 0 or req.stay_mode == "daily_return"
            else [
                (options.get("selected_hotel") or options.get("overnight_area"))["id"]
            ]
            if options.get("selected_hotel") or options.get("overnight_area")
            else []
        )
        ids += [
            i["to_id"]
            for i in day["items"]
            if i["type"] == "travel" and i.get("leg_complete")
        ]
        points = [
            {k: known[id].get(k) for k in ["id", "name", "lat", "lng"]}
            for id in ids
            if id in known and known[id].get("lat") is not None
        ]
        day["route_points"] = points
        day["maps_url"] = None
        if len(points) >= 2:
            q = {
                "api": 1,
                "origin": f"{points[0]['lat']},{points[0]['lng']}",
                "destination": f"{points[-1]['lat']},{points[-1]['lng']}",
                "travelmode": "driving",
            }
            if len(points) > 2:
                q["waypoints"] = "|".join(
                    f"{p['lat']},{p['lng']}" for p in points[1:-1]
                )
            day["maps_url"] = "https://www.google.com/maps/dir/?" + urlencode(q)
        if req.stay_mode == "overnight" and index < req.days - 1:
            hotel = options.get("selected_hotel")
            day["overnight"] = {
                "hotel_id": hotel["id"] if hotel else None,
                "area_id": options.get("overnight_area", {}).get("id"),
                "transfers_unconfirmed": bool(options.get("overnight_area")),
                "next_date": requested_dates(req)[index + 1],
                "rooms": req.rooms,
                "people": req.adults + req.children + req.elderly,
                "availability": hotel["availability"] if hotel else "unverified",
            }


def hotel_candidates(req, options):
    if req.stay_mode != "overnight":
        return []
    people = req.adults + req.children + req.elderly
    return [
        h
        for h in options.get("hotels", [])
        if h.get("requirements_match", True)
        and h.get("category_match", True)
        and isinstance(h.get("capacity_per_room"), int)
        and h["capacity_per_room"] * req.rooms >= people
        and h.get("lat") is not None
        and h.get("lng") is not None
        and h.get("check_in_minute") is not None
        and h.get("check_out_minute") is not None
        and (not req.hotel_id or h["id"] == req.hotel_id)
    ][:3]


def plan(
    req,
    required,
    candidates,
    classifications,
    matrix,
    options,
    origin,
    time_budget_seconds=12,
    allow_alternative=True,
    progress=None,
):
    options.pop("overnight_area", None)
    deadline = time.monotonic() + time_budget_seconds
    places = required + candidates
    diagnostics = []
    eligible = []
    for c in candidates:
        duration, _ = _allowances(req, c)
        if not any(
            hi - lo >= duration
            for windows in c["windows"].values()
            for lo, hi in windows
        ):
            c.update(classification="excluded", reason="visit_exceeds_open_window")
            continue
        if req.avoid_climbing and c.get("effort") in {"climbing", "assisted_access"}:
            c.update(
                classification="excluded",
                reason="assistance_requires_confirmation"
                if c.get("effort") == "assisted_access"
                else "climbing_conflicts",
            )
            continue
        if matrix.get("origin>" + c["id"], {}).get("minutes") is None:
            c.update(classification="excluded", reason="road_time_unavailable")
            continue
        eligible.append(c)
    extra = (
        max(1, req.days - len(required)) if req.include_attractions and eligible else 0
    )
    extra = min(extra, len(eligible))
    combinations = list(itertools.combinations(eligible, extra)) if extra else [()]
    combinations.sort(key=lambda combo: -sum(c.get("rank_score", 0) for c in combo))
    # Keep required-only fallback; it remains incomplete when a date lacks visits.
    hotels = hotel_candidates(req, options) if req.stay_mode == "overnight" else [None]
    if not hotels and req.stay_mode == "overnight" and req.allow_unconfirmed_stay:
        primary = next(p for p in required if p["id"] == req.primary_temple_id)
        hotels = [
            {
                **primary,
                "kind": "overnight_area",
                "maps_url": primary["url"],
                "verification": "area_only_not_a_hotel",
                "availability": "unverified",
            }
        ]
        options["overnight_area"] = hotels[0]
    hotels = hotels or [None]
    work = [(combo, hotel) for combo in combinations for hotel in hotels]
    truncated = len(work) > 15
    work = work[:15]
    if ((), hotels[0]) not in work:
        work.append(((), hotels[0]))
    best = None
    attempts = 0
    bounded = False
    for combo, hotel in work:
        if time.monotonic() >= deadline:
            bounded = True
            break
        if progress:
            progress("schedule")
        chosen = required + list(combo)
        synthetic = req.model_copy(update={"temple_ids": [p["id"] for p in chosen]})
        options["selected_hotel"] = (
            hotel if hotel and hotel.get("kind") != "overnight_area" else None
        )
        if req.stay_mode == "overnight" and not hotel:
            schedule = {
                "days": [],
                "feasible": False,
                "conflicts": [{"code": "HOTEL_REQUIREMENTS_UNVERIFIED", "details": []}],
            }
        else:
            schedule = solve(
                synthetic,
                chosen,
                matrix,
                beam_width=96,
                time_budget_seconds=min(2, max(0.05, deadline - time.monotonic())),
                hotel=hotel,
                restaurants=options.get("restaurants", []),
            )
        schedule = _pad(req, schedule)
        if progress:
            progress("budget")
        cost = costing.calculate(req, schedule["days"], options, places)
        if progress:
            progress("validate")
        check = validation.validate(req, places, schedule, matrix, options, cost)
        diagnostics.append(
            {
                "candidate_ids": [c["id"] for c in combo],
                "hotel_id": hotel["id"] if hotel else None,
                "critical_codes": sorted(set(e["code"] for e in check["critical"])),
            }
        )
        attempts += 1
        actual = [
            i["place_id"]
            for d in schedule["days"]
            for i in d["items"]
            if i["type"] == "visit"
        ]
        coverage = sum(d["coverage"] == "planned" for d in schedule["days"])
        missing_required = sum(t not in actual for t in req.temple_ids)
        critical = len(check["critical"])
        travel = sum(
            i["duration_minutes"]
            for d in schedule["days"]
            for i in d["items"]
            if i["type"] == "travel"
        )
        utility = sum(c.get("rank_score", 0) for c in combo if c["id"] in actual)
        score = (
            missing_required,
            req.days - coverage,
            critical,
            cost["high"]
            if req.budget_cap is not None or req.budget_tier == "low"
            else -utility,
            travel,
            cost["high"],
        )
        if best is None or score < best[0]:
            best = (score, schedule, cost, check, actual, hotel)
    if best is None:
        schedule = _pad(req, {"days": []})
        cost = costing.calculate(req, schedule["days"], options, places)
        best = (
            (),
            schedule,
            cost,
            validation.validate(req, places, schedule, matrix, options, cost),
            [],
            None,
        )
    _, schedule, cost, check, actual, hotel = best
    options["selected_hotel"] = (
        hotel if hotel and hotel.get("kind") != "overnight_area" else None
    )
    schedule.update(
        feasible=check["passed"],
        conflicts=check["critical"],
        validation=check,
        algorithm="bounded-candidate-beam-v3",
        optimality="not guaranteed",
        search={
            "attempts": attempts,
            "candidate_limit": 8,
            "hotel_limit": 3,
            "combination_limit": 16,
            "combination_limit_reached": truncated,
            "beam_width": 96,
            "time_budget_seconds": time_budget_seconds,
            "bounded": True,
            "time_limit_reached": bounded,
            "diagnostics": diagnostics,
        },
        base_policy=req.stay_mode,
    )
    used = set(actual)
    for c in classifications:
        if c.get("id") in used:
            c.update(classification="scheduled", reason="selected_feasible_route")
        elif c.get("classification") != "excluded" and c.get("reason") not in {
            "coordinates_or_hours_missing",
            "outside_search_bound",
        }:
            evaluated = [d for d in diagnostics if c.get("id") in d["candidate_ids"]]
            if any(not d["critical_codes"] for d in evaluated):
                reason = "feasible_lower_rank"
            elif evaluated:
                reason = "validation_constraints"
            else:
                reason = "outside_search_bound"
            c.update(
                classification="optional",
                reason=reason,
                reason_codes=(
                    sorted({code for d in evaluated for code in d["critical_codes"]})
                    if reason == "validation_constraints"
                    else []
                ),
            )
    alternatives = []
    if not check["passed"]:
        codes = {e["code"] for e in check["critical"]}
        if "HOTEL_REQUIREMENTS_UNVERIFIED" in codes:
            alternatives.append(
                {
                    "action": "confirm_hotel",
                    "reason": "Provide a property record with coordinates, adult capacity, extra-bed policy, check-in/out times and a date-specific quote; or explicitly choose daily return.",
                }
            )
        if codes & {"ROUND_TRIP_TOO_LONG", "ARRIVAL_AFTER_CLOSING"}:
            alternatives.append(
                {
                    "action": "change_origin_or_days",
                    "suggested_days": min(7, req.days + 1),
                    "reason": (
                        "Your starting point is too far for the days requested: "
                        "the drive alone leaves no usable visiting window. Add a "
                        "day, reduce the number of temples, or start closer."
                    ),
                }
            )
        if "DAY_UNPLANNED" in codes and "HOTEL_REQUIREMENTS_UNVERIFIED" not in codes:
            alternatives.append(
                {
                    "action": "change_days_or_stops",
                    "reason": "Reduce requested days or allow additional evidence-backed destinations; empty dates are not completed days.",
                }
            )
        if codes & {"PRICED_COSTS_EXCEED_CAP", "BUDGET_NOT_FULLY_PRICED"}:
            alternatives.append(
                {
                    "action": "price_or_revise_budget",
                    "reason": "Supply missing allowances/quotes or approve a revised cap. The primary temple is not replaced.",
                }
            )
        if (
            "PRIMARY_TEMPLE_MISSING" in codes
            and "HOTEL_REQUIREMENTS_UNVERIFIED" not in codes
        ):
            alternatives.append(
                {
                    "action": "extend_duration_or_overnight",
                    "suggested_days": min(7, req.days + 1),
                    "reason": "Test a longer or overnight alternative after resolving accommodation. This suggestion has NOT been feasibility-certified.",
                }
            )
    if (
        allow_alternative
        and not check["passed"]
        and req.days < 7
        and not any(
            e["code"] == "HOTEL_REQUIREMENTS_UNVERIFIED" for e in check["critical"]
        )
        and time.monotonic() < deadline
        and any(
            e["code"]
            in {"PRIMARY_TEMPLE_MISSING", "REQUIRED_VISIT_MISSING_OR_DUPLICATED"}
            for e in check["critical"]
        )
    ):
        # Reuse the road matrix; extend dated evidence, not arbitrary timestamps.
        # Required-only alternative needs explicit user acceptance before saving.
        from . import evidence

        next_req = req.model_copy(
            update={"days": req.days + 1, "include_attractions": False}
        )
        next_places = evidence.catalog(
            next_req.temple_ids, next_req.start_date, next_req.days
        )
        alt, alt_cost, _ = plan(
            next_req,
            next_places,
            [],
            [],
            matrix,
            options,
            origin,
            time_budget_seconds=max(0.05, min(3, deadline - time.monotonic())),
            allow_alternative=False,
            progress=progress,
        )
        alternatives = [
            a for a in alternatives if a["action"] != "extend_duration_or_overnight"
        ]
        alternatives.append(
            {
                "action": "extend_duration_or_overnight",
                "suggested_days": next_req.days,
                "checked_feasible": alt["feasible"],
                "checked_days": alt["days"],
                "checked_conflicts": alt["conflicts"],
                "checked_budget": {
                    "low": alt_cost["low"],
                    "high": alt_cost["high"],
                    "missing": alt_cost["missing"],
                },
                "changes": {"days": next_req.days, "include_attractions": False},
                "reason": "Required-only longer alternative tested with reused road evidence; availability and prices remain conditional. Apply only after review.",
            }
        )
    _maps(req, schedule, origin, places, options)
    visible_temples = set(req.temple_ids) | set(actual)
    used_meals = {
        i.get("place_id")
        for d in schedule["days"]
        for i in d["items"]
        if i["type"] == "meal"
    }
    options["restaurants"] = [
        r
        for r in options.get("restaurants", [])
        if r["temple_id"] in visible_temples or r["id"] in used_meals
    ]
    schedule["selection_rationale"] = {
        "primary_temple_id": req.primary_temple_id,
        "required_ids": req.temple_ids,
        "scheduled_ids": actual,
        "hard_constraints_before_preferences": True,
        "rank_factors": [
            "opening_windows",
            "road_transfers",
            "visit_duration",
            "daily_coverage",
            "required_primary",
            "mobility",
            "fatigue",
            "budget",
            "interests",
            "detour",
        ],
        "review_required": True,
    }
    schedule["alternatives"] = alternatives
    return schedule, cost, classifications
