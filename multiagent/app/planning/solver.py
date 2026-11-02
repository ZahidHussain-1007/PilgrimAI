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

MEALS = (("lunch", 750, 690), ("dinner", 1140, 1080))


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


def _allowances(req):
    visit = req.visit_minutes + (
        20 if req.elderly or req.special in {"elder", "wheel", "medical"} else 0
    )
    rest = max(req.rest_minutes, 20 if "family" in req.priorities else 0)
    return visit, rest


def _journey(state, destination, matrix, req):
    """Split provider driving time at explicit meal/rest breaks, without inventing
    a restaurant, rest-stop coordinate, service or a different road distance.
    All segments preserve the same evidenced leg; distance is apportioned only.
    """
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
                    s.now + 45,
                    meal=name,
                    venue="unconfirmed en-route stop",
                )
            )
            s.now += 45
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
    return s


def _close(state, matrix, finish, req):
    s = (
        deepcopy(state)
        if state.location == "origin"
        else _journey(state, "origin", matrix, req)
    )
    return s if s and s.now <= finish else None


def solve(
    req,
    temples: list[dict],
    matrix: dict,
    beam_width: int = 192,
    time_budget_seconds: float = 12.0,
    known_fixed_cost: float = 0.0,
) -> dict:
    start, finish = minutes(req.departure), minutes(req.finish)
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
            if state.mask == all_mask:
                closed = _close(state, matrix, finish, req)
                if closed:
                    complete.append(closed)
                continue
            for index, tm in enumerate(temples):
                if state.mask & (1 << index):
                    continue
                candidate = _journey(state, tm["id"], matrix, req)
                if not candidate:
                    continue
                items = candidate.days[-1]["items"]
                cursor = candidate.now
                items.append(_item("buffer", "arrival_buffer", cursor, cursor + 10))
                cursor += 10
                windows = tm["windows"].get(candidate.days[-1]["date"], [])
                # Reserve any meal that would be skipped during a long wait/visit.
                for name, target, earliest in MEALS:
                    prospective = min(
                        [
                            max(cursor, a)
                            for a, b in windows
                            if max(cursor, a) + duration <= min(b, finish)
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
                        items.append(
                            _item(
                                "meal",
                                "meal_break",
                                meal_at,
                                meal_at + 45,
                                meal=name,
                                venue="unconfirmed nearby venue",
                            )
                        )
                        cursor = meal_at + 45
                        candidate.meals.add(name)
                slots = [
                    max(cursor, a)
                    for a, b in windows
                    if max(cursor, a) + duration <= b
                    and max(cursor, a) + duration + rest <= finish
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
                    )
                )
                if rest:
                    items.append(_item("rest", "rest_break", end, end + rest))
                candidate.mask |= 1 << index
                candidate.now = end + rest
                candidates.append(candidate)
            # A failed visit today may become possible on a later weekday. Empty
            # days are retained, not silently shifted or represented as visits.
            if state.day + 1 < req.days:
                closed = _close(state, matrix, finish, req)
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
                    candidates.append(closed)
        if not candidates or time.monotonic() >= deadline:
            break
        candidates.sort(key=lambda s: (-s.mask.bit_count(), s.day, s.now, s.km))
        dedup = {}
        for s in candidates:
            key = (s.mask, s.day, s.location, tuple(sorted(s.meals)))
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
        if s.mask == all_mask:
            closed = _close(s, matrix, finish, req)
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
        if "quick" in req.priorities:
            return (cap_exceeded, len(active), sum(elapsed), s.km)
        # Spread visits over the requested duration when possible. Empty/free
        # days are explicit; they are never charged as fictional temple visits.
        return (
            cap_exceeded,
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
        "base_policy": "Each day starts and returns to the supplied origin; hotels/attractions are unscheduled options. Lunch/dinner and en-route rests are planning allowances; venues are unconfirmed.",
    }
    errors = validate(req, temples, result, matrix)
    return (
        {**result, "feasible": False, "conflicts": errors, "days": []}
        if errors
        else result
    )


def validate(req, temples, result, matrix):
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
        if day["date"] != (req.start_date + timedelta(days=index)).isoformat():
            error("DATE_INVALID", [day["date"]])
        cursor = start
        driving_since_break = 0
        last_arrival = start - 10
        location = "origin"
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
                if a - last_arrival < 10:
                    error("ARRIVAL_BUFFER_MISSING", [tid])
                if tid in by_id and (
                    item.get("title") != by_id[tid]["name"]
                    or item.get("url") != by_id[tid]["url"]
                ):
                    error("VISIT_EVIDENCE_INVALID", [tid])
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
        if pending or location != "origin":
            error("RETURN_MISSING", [day["date"]])
        for name, target, _ in MEALS:
            if start <= target and cursor > target + 30 and name not in meal_names:
                error("MEAL_MISSING", [day["date"], name])
    if sorted(visited) != sorted(req.temple_ids):
        error("MISSING_OR_DUPLICATE_VISIT", visited)
    return errors
