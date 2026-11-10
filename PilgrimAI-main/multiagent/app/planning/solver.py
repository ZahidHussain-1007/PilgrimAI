"""Bounded deterministic subset/day/last-stop beam search (not a global optimum).
Daily-base policy is explicit: origin -> mandatory visits -> origin. Unlocated hotel
and attraction options never become invented timed stops. Independent validation
checks the selected route, not just the solver's own feasibility flag.
"""

import math
import time
from copy import deepcopy
from dataclasses import dataclass, field
from datetime import timedelta

from .calendar import clock, minutes

MEALS = (("breakfast", 510, 450), ("lunch", 750, 690), ("dinner", 1140, 1080))


@dataclass
class State:
    mask: int
    day: int
    location: str
    now: int
    km: float
    days: list
    meals: set = field(default_factory=set)


def _item(kind, title, start, end, **kw):
    return {
        "type": kind,
        "title": title,
        "start": clock(start),
        "end": clock(end),
        "duration_minutes": end - start,
        **kw,
    }


def day_purpose(day, index, day_count, origin_id="origin", lodging_id=None):
    """Why a day is a real part of the itinerary, or None if it is empty.

    v23.2: requiring a temple visit on *every* day made a legitimate
    final-day return journey ("check out, drive home") unrepresentable, so
    single-temple overnight trips could never pass validation.

    A day counts when it contains at least one committed activity:
      * a temple visit;
      * a check-in or check-out;
      * a completed journey to the overnight lodging (arrival/transfer day);
      * a completed journey back to the origin on the final day.

    An empty day is still reported - the product does not invent free days.
    """
    items = day.get("items", [])
    for item in items:
        if item.get("type") == "visit":
            return "visit"
    for item in items:
        if item.get("type") in {"checkin", "checkout"}:
            return item["type"]
    completed = [
        item
        for item in items
        if item.get("type") == "travel"
        and item.get("leg_complete")
        and item.get("to_id") is not None
    ]
    if lodging_id is not None and any(
        item.get("to_id") == lodging_id for item in completed
    ):
        return "transfer"
    if index == day_count - 1 and any(
        item.get("to_id") == origin_id for item in completed
    ):
        return "return"
    return None


def _allowances(req, place=None):
    visit = max(req.visit_minutes, (place or {}).get("visit_minutes") or 0) + (
        20 if req.elderly or req.special in {"elder", "wheel", "medical"} else 0
    )
    rest = max(req.rest_minutes, 20 if "family" in req.priorities else 0)
    grid = req.time_grid_minutes
    return math.ceil(visit / grid) * grid, math.ceil(rest / grid) * grid


def _journey(state, destination, matrix, req):
    """Split provider driving time at explicit meal/rest breaks, without inventing
    a restaurant, rest-stop coordinate, service or a different road distance.
    All segments preserve the same evidenced leg; distance is apportioned only.
    """
    if state.location == destination:
        # Already at the destination: this is not a route at all, so no
        # provider leg is required and none is invented. Route matrices never
        # contain self-pairs, which used to make "visit the place you are
        # staying at tomorrow" impossible and left a middle day empty.
        return deepcopy(state)
    leg = matrix.get(state.location + ">" + destination)
    if not leg or leg.get("minutes") is None or leg.get("km") is None:
        return None
    raw = float(leg["minutes"])
    km = float(leg["km"])
    if not math.isfinite(raw) or not math.isfinite(km) or raw < 0 or km < 0:
        return None
    if leg.get("estimated") and not req.allow_estimates:
        return None
    s = deepcopy(state)
    items = s.days[-1]["items"]
    leg_id = f"{s.day}:{len(items)}:{s.location}>{destination}"
    left = int(math.ceil(raw))
    total = left
    driven = 0
    allocated = 0.0
    limit = 120 if req.elderly or req.special != "none" else 180
    while left > 0:
        # Meals outside this day's user-selected planning hours are not assumed
        # to happen on-route. A crossed threshold triggers an explicit break.
        due = next(
            (
                (name, target)
                for name, target, _ in MEALS
                if name not in s.meals and minutes(req.departure) <= target <= s.now
            ),
            None,
        )
        if due:
            name, _ = due
            items.append(
                _item(
                    "meal",
                    "meal_break",
                    s.now,
                    s.now
                    + math.ceil(req.meal_minutes / req.time_grid_minutes)
                    * req.time_grid_minutes,
                    meal=name,
                    venue="unconfirmed en-route stop",
                    verification="unconfirmed",
                    location_id=None,
                )
            )
            s.now += (
                math.ceil(req.meal_minutes / req.time_grid_minutes)
                * req.time_grid_minutes
            )
            s.meals.add(name)
            driven = 0
            continue
        if driven == limit:
            items.append(
                _item(
                    "rest",
                    "enroute_rest",
                    s.now,
                    s.now + 15,
                    venue="unconfirmed en-route stop",
                )
            )
            s.now += 15
            driven = 0
            continue
        until_meal = min(
            [
                target - s.now
                for name, target, _ in MEALS
                if name not in s.meals and s.now < target
            ]
            or [left]
        )
        piece = min(left, limit - driven, until_meal)
        distance = (
            round(km - allocated, 4) if piece == left else round(km * piece / total, 4)
        )
        items.append(
            _item(
                "travel",
                "return_to_origin" if destination == "origin" else "travel_leg",
                s.now,
                s.now + piece,
                from_id=state.location,
                to_id=destination,
                leg_id=leg_id,
                leg_complete=piece == left,
                distance_km=distance,
                source=leg["source"],
                estimated=leg["estimated"],
                url=leg["url"],
            )
        )
        allocated += distance
        left -= piece
        driven += piece
        s.now += piece
    if total == 0:
        items.append(
            _item(
                "travel",
                "travel_leg",
                s.now,
                s.now,
                from_id=state.location,
                to_id=destination,
                leg_id=leg_id,
                leg_complete=True,
                distance_km=km,
                source=leg["source"],
                estimated=leg["estimated"],
                url=leg["url"],
            )
        )
    s.location = destination
    s.km += km
    if (
        req.daily_travel_limit_minutes is not None
        and sum(i["duration_minutes"] for i in items if i["type"] == "travel")
        > req.daily_travel_limit_minutes
    ):
        return None
    return s


def _close(state, matrix, finish, req, hotel=None):
    destination = hotel["id"] if hotel and state.day < req.days - 1 else "origin"
    s = (
        deepcopy(state)
        if state.location == destination
        else _journey(state, destination, matrix, req)
    )
    if (
        s
        and hotel
        and hotel.get("kind") != "overnight_area"
        and state.day == 0
        and destination == hotel["id"]
    ):
        at = (
            math.ceil(max(s.now, hotel["check_in_minute"]) / req.time_grid_minutes)
            * req.time_grid_minutes
        )
        if at > s.now:
            s.days[-1]["items"].append(
                _item("wait", "wait_for_checkin", s.now, at, location_id=hotel["id"])
            )
        s.days[-1]["items"].append(
            _item(
                "checkin",
                "hotel_checkin",
                at,
                at + 15,
                place_id=hotel["id"],
                url=hotel["maps_url"],
                verification=hotel["verification"],
            )
        )
        s.now = at + 15
    return s if s and s.now <= finish else None


def _nearby_meal(state, name, req, matrix, restaurants):
    """Only choose a venue when BOTH road transfers and dated hours fit the
    reserved meal block. Never convert a distance-only listing into a road leg."""
    reserve = (
        math.ceil(req.meal_minutes / req.time_grid_minutes) * req.time_grid_minutes
    )
    for venue in restaurants:
        a = matrix.get(state.location + ">" + venue["id"])
        b = matrix.get(venue["id"] + ">" + state.location)
        if not a or not b or a.get("minutes") is None or b.get("minutes") is None:
            continue
        if math.ceil(a["minutes"]) + math.ceil(b["minutes"]) + 45 > reserve:
            continue
        arrival = state.now + math.ceil(a["minutes"])
        if not any(
            lo <= arrival and arrival + 45 <= hi
            for lo, hi in venue.get("windows", {}).get(state.days[-1]["date"], [])
        ):
            continue
        start = state.now
        anchor = state.location
        trial = deepcopy(state)
        trial.meals.add(name)
        trial = _journey(trial, venue["id"], matrix, req)
        if not trial or trial.now != arrival:
            continue
        trial.days[-1]["items"].append(
            _item(
                "meal",
                "meal_break",
                trial.now,
                trial.now + 45,
                meal=name,
                place_id=venue["id"],
                location_id=venue["id"],
                venue=venue["name"],
                verification=venue["verification"],
                url=venue["maps_url"],
                source_record=venue["source_record"],
            )
        )
        trial.now += 45
        trial = _journey(trial, anchor, matrix, req)
        if not trial or trial.now > start + reserve:
            continue
        if trial.now < start + reserve:
            trial.days[-1]["items"].append(
                _item(
                    "buffer",
                    "meal_transfer_buffer",
                    trial.now,
                    start + reserve,
                    location_id=anchor,
                )
            )
        trial.now = start + reserve
        return trial
    state.days[-1]["items"].append(
        _item(
            "meal",
            "meal_break",
            state.now,
            state.now + reserve,
            meal=name,
            location_id=state.location,
            venue="unconfirmed nearby venue",
            verification="unconfirmed",
        )
    )
    state.now += reserve
    state.meals.add(name)
    return state


def solve(
    req,
    temples: list[dict],
    matrix: dict,
    beam_width: int = 192,
    time_budget_seconds: float = 12.0,
    known_fixed_cost: float = 0.0,
    hotel: dict | None = None,
    restaurants: list | None = None,
) -> dict:
    start = (
        math.ceil(minutes(req.departure) / req.time_grid_minutes)
        * req.time_grid_minutes
    )
    finish = minutes(req.finish) // req.time_grid_minutes * req.time_grid_minutes
    states = [
        State(
            0,
            0,
            "origin",
            start,
            0,
            [{"date": req.start_date.isoformat(), "items": []}],
        )
    ]
    deadline = time.monotonic() + time_budget_seconds
    complete = []
    best = states[0]
    all_mask = (1 << len(temples)) - 1
    duration, rest = _allowances(req)
    for _ in range(len(temples) + req.days):
        candidates = []
        for state in states:
            if time.monotonic() >= deadline:
                break
            if state.mask.bit_count() > best.mask.bit_count():
                best = state
            if state.mask == all_mask and (not hotel or state.day == req.days - 1):
                closed = _close(state, matrix, finish, req, hotel)
                if closed:
                    complete.append(closed)
                continue
            for index, tm in enumerate(temples):
                if state.mask & (1 << index):
                    continue
                duration, rest = _allowances(req, tm)
                candidate = _journey(state, tm["id"], matrix, req)
                if not candidate:
                    continue
                items = candidate.days[-1]["items"]
                cursor = candidate.now
                items.append(
                    _item(
                        "buffer",
                        "arrival_buffer",
                        cursor,
                        cursor
                        + math.ceil(req.parking_buffer_minutes / req.time_grid_minutes)
                        * req.time_grid_minutes,
                    )
                )
                cursor += (
                    math.ceil(req.parking_buffer_minutes / req.time_grid_minutes)
                    * req.time_grid_minutes
                )
                windows = tm["windows"].get(candidate.days[-1]["date"], [])
                # Reserve any meal that would be skipped during a long wait/visit.
                for name, target, earliest in MEALS:
                    prospective = min(
                        [
                            math.ceil(max(cursor, a) / req.time_grid_minutes)
                            * req.time_grid_minutes
                            for a, b in windows
                            if math.ceil(max(cursor, a) / req.time_grid_minutes)
                            * req.time_grid_minutes
                            + duration
                            <= min(b, finish)
                        ]
                        or [finish + 1]
                    )
                    if (
                        name not in candidate.meals
                        and start <= target
                        and prospective + duration > target + 30
                        and cursor <= target + 90
                    ):
                        meal_at = max(cursor, earliest)
                        if meal_at > cursor:
                            items.append(
                                _item("wait", "wait_for_meal", cursor, meal_at)
                            )
                        candidate.now = meal_at
                        candidate = _nearby_meal(
                            candidate, name, req, matrix, restaurants or []
                        )
                        items = candidate.days[-1]["items"]
                        cursor = candidate.now
                slots = [
                    math.ceil(max(cursor, a) / req.time_grid_minutes)
                    * req.time_grid_minutes
                    for a, b in windows
                    if math.ceil(max(cursor, a) / req.time_grid_minutes)
                    * req.time_grid_minutes
                    + duration
                    <= b
                    and math.ceil(max(cursor, a) / req.time_grid_minutes)
                    * req.time_grid_minutes
                    + duration
                    + rest
                    <= finish
                ]
                if not slots:
                    continue
                visit = min(slots)
                end = visit + duration
                if cursor < visit:
                    items.append(_item("wait", "wait_for_opening", cursor, visit))
                items.append(
                    _item(
                        "visit",
                        tm["name"],
                        visit,
                        end,
                        place_id=tm["id"],
                        url=tm["url"],
                        verification=tm.get("verification", "catalog_not_live"),
                        visit_kind=tm.get("kind", "temple"),
                        source_record=tm.get("source"),
                    )
                )
                if rest:
                    items.append(_item("rest", "rest_break", end, end + rest))
                candidate.mask |= 1 << index
                # v23.2: a meal threshold crossed while standing still (during
                # the visit or the opening wait) is still a crossed meal. Only
                # _journey() used to reserve meals, so a short single-temple
                # day silently lost breakfast and failed MEAL_MISSING.
                cursor = end + rest
                for name, target, earliest in MEALS:
                    if name in candidate.meals:
                        continue
                    if start > target:
                        # The threshold passed before the day began.
                        continue
                    if cursor < target:
                        continue
                    meal_start = max(cursor, earliest)
                    meal_end = (
                        meal_start
                        + math.ceil(req.meal_minutes / req.time_grid_minutes)
                        * req.time_grid_minutes
                    )
                    if meal_end > finish:
                        # Does not fit today; the validator reports it rather
                        # than us shortening a visit or inventing a venue.
                        continue
                    items.append(
                        _item(
                            "meal",
                            "meal_break",
                            meal_start,
                            meal_end,
                            meal=name,
                            venue="unconfirmed en-route stop",
                            verification="unconfirmed",
                            location_id=None,
                        )
                    )
                    candidate.meals.add(name)
                    cursor = meal_end
                candidate.now = cursor
                candidates.append(candidate)
            # A failed visit today may become possible on a later weekday. Empty
            # days are retained, not silently shifted or represented as visits.
            if state.day + 1 < req.days:
                closed = _close(state, matrix, finish, req, hotel)
                if closed:
                    closed.day += 1
                    closed.now = start
                    closed.meals = set()
                    closed.days.append(
                        {
                            "date": (
                                req.start_date + timedelta(days=closed.day)
                            ).isoformat(),
                            "items": [],
                        }
                    )
                    if (
                        hotel
                        and hotel.get("kind") != "overnight_area"
                        and closed.day == req.days - 1
                    ):
                        closed.days[-1]["items"].append(
                            _item(
                                "checkout",
                                "hotel_checkout",
                                start,
                                start + 15,
                                place_id=hotel["id"],
                                url=hotel["maps_url"],
                                verification=hotel["verification"],
                            )
                        )
                        closed.now = start + 15
                        if closed.now > hotel["check_out_minute"]:
                            continue
                    candidates.append(closed)
        if not candidates or time.monotonic() >= deadline:
            break
        candidates.sort(key=lambda s: (-s.mask.bit_count(), s.day, s.now, s.km))
        dedup = {}
        for s in candidates:
            key = (
                s.mask,
                s.day,
                s.location,
                tuple(sorted(s.meals)),
                tuple(any(i["type"] == "visit" for i in d["items"]) for d in s.days),
            )
            frontier = dedup.setdefault(key, [])
            if any(old.now <= s.now and old.km <= s.km for old in frontier):
                continue
            frontier[:] = [
                old for old in frontier if not (s.now <= old.now and s.km <= old.km)
            ]
            frontier.append(s)
        states = sorted(
            (s for group in dedup.values() for s in group),
            key=lambda s: (-s.mask.bit_count(), s.day, s.now, s.km),
        )[:beam_width]
    for s in states:
        if s.mask == all_mask and (not hotel or s.day == req.days - 1):
            closed = _close(s, matrix, finish, req, hotel)
            if closed:
                complete.append(closed)
    if not complete:
        missing = [
            t["name"] for i, t in enumerate(temples) if not (best.mask & (1 << i))
        ]
        return {
            "days": [],
            "feasible": False,
            "conflicts": [
                {
                    "code": "NO_VERIFIED_SCHEDULE_FOUND",
                    "details": missing or [t["name"] for t in temples],
                }
            ],
            "algorithm": "bounded-beam-v2",
            "optimality": "not guaranteed",
        }

    def score(s):
        active = [d for d in s.days if d["items"]]
        elapsed = [minutes(d["items"][-1]["end"]) - start for d in active]
        from app.core.config import settings

        known_cost = known_fixed_cost + (
            s.km * settings.fuel_cost_per_km if req.transport == "car" else 0
        )
        cap_exceeded = req.budget_cap is not None and known_cost > req.budget_cap
        primary_day = next(
            (
                i
                for i, d in enumerate(s.days)
                if any(
                    x.get("place_id") == req.primary_temple_id and x["type"] == "visit"
                    for x in d["items"]
                )
            ),
            req.days,
        )
        covered = sum(any(i["type"] == "visit" for i in d["items"]) for d in s.days)
        # v23.2: an empty day is a failed day (DAY_UNPLANNED). Prefer any
        # schedule that fills each requested day with a committed purpose -
        # spreading a visit or an arrival/return leg - before optimising cost.
        empty_days = sum(1 for d in s.days if not d["items"])
        if "quick" in req.priorities:
            return (
                empty_days,
                req.days - covered,
                cap_exceeded,
                primary_day,
                len(active),
                sum(elapsed),
                s.km,
            )
        # Spread visits over the requested duration when possible. Empty/free
        # days are explicit; they are never charged as fictional temple visits.
        return (
            empty_days,
            req.days - covered,
            cap_exceeded,
            primary_day,
            abs(len(active) - min(req.days, len(temples))),
            max(elapsed or [0]),
            s.km,
            sum(elapsed),
        )

    winner = min(complete, key=score)
    while len(winner.days) < req.days:
        winner.days.append(
            {
                "date": (req.start_date + timedelta(days=len(winner.days))).isoformat(),
                "items": [],
            }
        )
    result = {
        "days": winner.days,
        "feasible": True,
        "conflicts": [],
        "algorithm": "bounded-beam-v2",
        "beam_width": beam_width,
        "optimality": "not guaranteed",
        "base_policy": req.stay_mode,
    }
    errors = validate(req, temples, result, matrix, hotel=hotel)
    return (
        {
            **result,
            "feasible": False,
            "conflicts": errors,
            "days": result["days"]
            if all(e["code"] == "DAY_UNPLANNED" for e in errors)
            else [],
        }
        if errors
        else result
    )


def validate(req, temples, result, matrix, hotel=None):
    """Recompute coverage, dates, travel continuity/provider totals, daily bounds,
    visit windows/duration, required rest and crossed meal thresholds independently.
    Pricing/accessibility/booking are separate evidence checks, not invented here.
    """
    errors = []
    visited = []
    by_id = {t["id"]: t for t in temples}
    duration, rest = _allowances(req)
    days = result["days"]
    start = minutes(req.departure)
    finish = minutes(req.finish)

    def error(code, details):
        errors.append({"code": code, "details": [str(x) for x in details]})

    if len(days) != req.days:
        error("DAY_COUNT_INVALID", [len(days)])
    for index, day in enumerate(days):
        lodging = hotel["id"] if hotel else None
        if day_purpose(day, index, len(days), lodging_id=lodging) is None:
            error("DAY_UNPLANNED", [day.get("date")])
        if day["date"] != (req.start_date + timedelta(days=index)).isoformat():
            error("DATE_INVALID", [day["date"]])
        cursor = math.ceil(start / req.time_grid_minutes) * req.time_grid_minutes
        driving_since_break = 0
        last_arrival = start - 10
        location = hotel["id"] if hotel and index > 0 else "origin"
        pending = None
        motion = 0
        distance = 0.0
        meal_names = set()
        for n, item in enumerate(day["items"]):
            try:
                a, b = minutes(item["start"]), minutes(item["end"])
            except (ValueError, KeyError):
                error("CLOCK_INVALID", [n])
                continue
            if a != cursor or b < a or b > finish or b - a != item["duration_minutes"]:
                error("TIMELINE_INVALID", [day["date"], n])
            cursor = b
            if item["type"] not in {
                "travel",
                "visit",
                "meal",
                "rest",
                "wait",
                "buffer",
                "checkin",
                "checkout",
            }:
                error("ITEM_TYPE_INVALID", [n])
            if item["type"] in {"rest", "meal", "visit", "wait"} and b - a >= 15:
                driving_since_break = 0
            if item["type"] == "travel":
                driving_since_break += b - a
                limit = 120 if req.elderly or req.special != "none" else 180
                if driving_since_break > limit:
                    error("DRIVE_BREAK_MISSING", [n])
                pair = (item.get("from_id"), item.get("to_id"))
                if pending is None:
                    pending = (item.get("leg_id"), pair)
                    motion = 0
                    distance = 0.0
                    if pair[0] != location:
                        error("ROUTE_DISCONTINUITY", [n])
                if pending != (item.get("leg_id"), pair):
                    error("ROUTE_SEGMENTS_INVALID", [n])
                motion += b - a
                distance += float(item.get("distance_km") or 0)
                leg = matrix.get(str(pair[0]) + ">" + str(pair[1]))
                if not leg or leg.get("minutes") is None or leg.get("km") is None:
                    error("ROUTE_UNAVAILABLE", [n])
                else:
                    if (
                        item.get("source") != leg["source"]
                        or item.get("estimated") != leg["estimated"]
                        or item.get("url") != leg["url"]
                        or (leg["estimated"] and not req.allow_estimates)
                    ):
                        error("ROUTE_EVIDENCE_INVALID", [n])
                    if item.get("leg_complete"):
                        if (
                            motion != math.ceil(leg["minutes"])
                            or abs(distance - leg["km"]) > 0.01
                        ):
                            error("ROUTE_TOTAL_INVALID", [n])
                if item.get("leg_complete"):
                    location = pair[1]
                    last_arrival = b
                    pending = None
            elif item["type"] == "visit":
                tid = item.get("place_id")
                visited.append(tid)
                if pending or tid != location:
                    error("VISIT_LOCATION_INVALID", [tid])
                if tid not in by_id or not any(
                    lo <= a and b <= hi
                    for lo, hi in by_id[tid]["windows"].get(day["date"], [])
                ):
                    error("CLOSED_DURING_VISIT", [tid])
                if a - last_arrival < req.parking_buffer_minutes:
                    error("ARRIVAL_BUFFER_MISSING", [tid])
                if tid in by_id and (
                    item.get("title") != by_id[tid]["name"]
                    or item.get("url") != by_id[tid]["url"]
                ):
                    error("VISIT_EVIDENCE_INVALID", [tid])
                duration, _ = _allowances(req, by_id.get(tid))
                if b - a < duration:
                    error("VISIT_TOO_SHORT", [tid])
                following = day["items"][n + 1] if n + 1 < len(day["items"]) else {}
                if rest and (
                    following.get("type") != "rest"
                    or following.get("duration_minutes", 0) < rest
                ):
                    error("REST_MISSING", [tid])
            elif item["type"] == "meal":
                name = item.get("meal")
                meal_names.add(name)
                if b - a < 45:
                    error("MEAL_TOO_SHORT", [n])
                limits = {
                    name: (earliest, target + 90) for name, target, earliest in MEALS
                }
                if name not in limits or not limits[name][0] <= a <= limits[name][1]:
                    error("MEAL_WINDOW_INVALID", [n])
            elif pending and item["type"] not in {"meal", "rest"}:
                error("ROUTE_INTERRUPTED", [n])
        expected_end = hotel["id"] if hotel and index < req.days - 1 else "origin"
        if pending or location != expected_end:
            error("RETURN_MISSING", [day["date"]])
        for name, target, _ in MEALS:
            if start <= target and cursor > target + 30 and name not in meal_names:
                error("MEAL_MISSING", [day["date"], name])
    if sorted(visited) != sorted(req.temple_ids):
        error("MISSING_OR_DUPLICATE_VISIT", visited)
    return errors
