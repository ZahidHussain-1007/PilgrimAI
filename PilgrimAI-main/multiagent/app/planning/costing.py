"""A unit-aware, day-wise ledger. Partial totals NEVER bound unknown expenses.
Catalog estimates and explicit user allowances are not current vendor quotes.
"""

import re

from app.core.config import settings

from .contracts import BudgetEvidence

CATEGORIES = (
    "fuel",
    "tolls",
    "parking",
    "stay",
    "food",
    "darshan_sevas",
    "attraction_entry",
    "miscellaneous",
)


def _entry(
    category,
    day,
    quantity,
    unit,
    price=None,
    status="unknown",
    source=None,
    basis="",
    place_id=None,
):
    return dict(
        category=category,
        date=day,
        quantity=quantity,
        unit=unit,
        status=status,
        unit_low=price[0] if price else None,
        unit_high=price[1] if price else None,
        low=round(quantity * price[0], 2) if price else None,
        high=round(quantity * price[1], 2) if price else None,
        source=source,
        basis=basis,
        place_id=place_id,
    )


def _allowance(value):
    return (value.low, value.high) if value is not None else None


def _admission(place, req):
    facts = place.get("facts") or {}
    text = str((facts.get("darshan_and_tickets") or {}).get("general_darshan", ""))
    # An adult price takes precedence over a child "FREE" substring.
    adult = re.search(r"Adult\s*(?:\([^)]*\))?\s*[:–-]?\s*₹\s*([\d,]+)", text, re.I)
    if adult:
        if req.children:
            return (
                None,
                "Children require height/age-specific entry confirmation; adult price alone is not a group quote.",
            )
        val = float(adult[1].replace(",", ""))
        return (
            val,
            val,
        ), "Published adult admission; current price must be reconfirmed."
    if re.search(
        r"(sarva darshan|general darshan|entry and general darshan|entry)\s+(?:is |are )?free\b|free of cost for all|no entry fee",
        text,
        re.I,
    ):
        return (0, 0), "General admission only; optional paid sevas are not selected."
    return None, "General admission price is not established by the catalog."


def calculate(req, days, options, places) -> BudgetEvidence:
    people = req.adults + req.children + req.elderly
    by_id = {p["id"]: p for p in places}
    entries = []
    hotel = options.get("selected_hotel")
    all_restaurants = options.get("restaurants", [])
    for day in days:
        dt = day["date"]
        items = day["items"]
        visits = [i for i in items if i["type"] == "visit"]
        moves = [i for i in items if i["type"] == "travel"]
        km = sum(i.get("distance_km", 0) for i in moves)
        if req.transport == "car" and moves:
            entries.append(
                _entry(
                    "fuel",
                    dt,
                    round(km, 4),
                    "vehicle-km",
                    (settings.fuel_cost_per_km, settings.fuel_cost_per_km),
                    "estimated",
                    "configuration:fuel_cost_per_km",
                    "Configured per-kilometre fuel allowance; one vehicle; not a live pump-price quote.",
                )
            )
        else:
            entries.append(
                _entry(
                    "fuel",
                    dt,
                    1,
                    "day",
                    (0, 0) if req.transport != "car" else None,
                    "not_required" if req.transport != "car" else "unknown",
                    basis="Not applicable to this transport."
                    if req.transport != "car"
                    else "Daily route has not been established.",
                )
            )
        for category, allow, qty, unit in [
            ("tolls", req.tolls_per_day, 1, "day"),
            ("parking", req.parking_per_visit, len(visits), "visit"),
            ("miscellaneous", req.miscellaneous_per_day, 1, "day"),
        ]:
            price = _allowance(allow)
            if category == "tolls" and req.transport in {"bus", "train"}:
                price = (0, 0)
            entries.append(
                _entry(
                    category,
                    dt,
                    qty,
                    unit,
                    price,
                    "estimated"
                    if allow is not None
                    else "not_required"
                    if price == (0, 0)
                    else "unknown",
                    "user:allowance" if allow is not None else None,
                    "Explicit user allowance; not a verified charge."
                    if allow is not None
                    else "Route-specific cost not established.",
                )
            )
        nightly = req.stay_mode == "overnight" and dt != days[-1]["date"]
        price = (
            (hotel["price_low"], hotel["price_high"])
            if hotel
            and hotel.get("price_low") is not None
            and hotel.get("price_high") is not None
            else None
        )
        if not nightly:
            entries.append(
                _entry(
                    "stay",
                    dt,
                    0,
                    "room-night",
                    (0, 0),
                    "not_required",
                    basis="Daily return: no overnight charge."
                    if req.stay_mode == "daily_return"
                    else "Final day: no additional night.",
                )
            )
        else:
            entries.append(
                _entry(
                    "stay",
                    dt,
                    req.rooms,
                    "room-night",
                    price,
                    "estimated" if price else "unknown",
                    hotel.get("source_record") if hotel else None,
                    "Rooms × one night; occupancy, availability, taxes and extra-bed charges require confirmation.",
                    hotel["id"] if hotel else None,
                )
            )
        meals = [i for i in items if i["type"] == "meal"]
        for meal in meals:
            exact = next(
                (r for r in all_restaurants if r["id"] == meal.get("place_id")), None
            )
            candidates = (
                [exact]
                if exact
                else [
                    r
                    for r in all_restaurants
                    if r["temple_id"] == meal.get("location_id")
                ]
            )
            if not candidates:
                candidates = [
                    r
                    for r in all_restaurants
                    if any(v.get("place_id") == r["temple_id"] for v in visits)
                ]
            candidates = [
                r
                for r in candidates
                if r.get("price_low") is not None and r.get("price_high") is not None
            ]
            allowance = _allowance(req.meal_price_per_person)
            price = allowance or (
                (
                    min(r["price_low"] for r in candidates),
                    max(r["price_high"] for r in candidates),
                )
                if candidates
                else None
            )
            source = (
                "user:meal_allowance"
                if allowance is not None
                else ",".join(r["source_record"] for r in candidates)
                if candidates
                else None
            )
            entries.append(
                _entry(
                    "food",
                    dt,
                    people,
                    "person-meal",
                    price,
                    "estimated" if price else "unknown",
                    source,
                    f"{meal.get('meal')}: {people} travellers × one meal. "
                    + (
                        "Named venue catalog estimate."
                        if exact
                        else "Nearby-catalog meal-price scenario, NOT a confirmed venue/route; children use adult-equivalent meal allowance."
                    ),
                    meal.get("place_id"),
                )
            )
        if not meals:
            entries.append(
                _entry(
                    "food",
                    dt,
                    0,
                    "person-meal",
                    (0, 0),
                    "not_required",
                    basis="No meal falls within this planned activity period; meals outside it are excluded.",
                )
            )
        for visit in visits:
            place = by_id.get(visit.get("place_id"), {})
            price, basis = _admission(place, req)
            category = (
                "attraction_entry"
                if place.get("kind") == "attraction"
                else "darshan_sevas"
            )
            entries.append(
                _entry(
                    category,
                    dt,
                    people,
                    "person-entry",
                    price,
                    "catalog_price" if price else "unknown",
                    place.get("source"),
                    basis,
                    place.get("id"),
                )
            )
        for category in ["darshan_sevas", "attraction_entry"]:
            if not any(e["date"] == dt and e["category"] == category for e in entries):
                entries.append(
                    _entry(
                        category,
                        dt,
                        0,
                        "person-entry",
                        (0, 0),
                        "not_required",
                        basis="No selected paid activity in this category; optional sevas and unscheduled attractions excluded.",
                    )
                )
    daily = []
    for day in days:
        es = [e for e in entries if e["date"] == day["date"]]
        daily.append(
            dict(
                date=day["date"],
                low=round(sum(e["low"] or 0 for e in es), 2),
                high=round(sum(e["high"] or 0 for e in es), 2),
                unknown=sorted({e["category"] for e in es if e["status"] == "unknown"}),
            )
        )
    low = round(sum(d["low"] for d in daily), 2)
    high = round(sum(d["high"] for d in daily), 2)
    missing = sorted({e["category"] for e in entries if e["status"] == "unknown"})
    if req.transport != "car":
        missing.append("transport_fare")
        missing.sort()
    within = None if req.budget_cap is None or missing else high <= req.budget_cap
    if req.budget_cap is not None and high > req.budget_cap:
        within = False
    categories = []
    for c in CATEGORIES:
        es = [e for e in entries if e["category"] == c]
        categories.append(
            dict(
                category=c,
                low=round(sum(e["low"] or 0 for e in es), 2),
                high=round(sum(e["high"] or 0 for e in es), 2),
                status="unknown"
                if any(e["status"] == "unknown" for e in es)
                else "not_required"
                if all(e["status"] == "not_required" for e in es)
                else "estimated"
                if any(e["status"] == "estimated" for e in es)
                else "catalog_price",
            )
        )
    return dict(
        currency="INR",
        low=low,
        high=high,
        total_type="partial_subtotal" if missing else "planning_estimate",
        complete=not missing,
        missing=missing,
        within_cap=within,
        confidence="low" if missing else "medium",
        per_person=dict(
            low=round(low / people, 2), high=round(high / people, 2), travellers=people
        ),
        known_subtotal=round(
            sum(e["low"] or 0 for e in entries if e["status"] == "catalog_price"), 2
        ),
        estimated_subtotal=dict(
            low=round(
                sum(e["low"] or 0 for e in entries if e["status"] == "estimated"), 2
            ),
            high=round(
                sum(e["high"] or 0 for e in entries if e["status"] == "estimated"), 2
            ),
        ),
        categories=categories,
        daywise=daily,
        items=entries,
        assumptions=[
            "Partial totals exclude every unknown cost and are not a maximum total.",
            "Catalog prices/estimates are not live quotes.",
            "Meals outside scheduled hours and optional sevas are excluded.",
            "One private vehicle is assumed for car fuel; confirm vehicle capacity.",
            "Public transport/taxi fares are not included in fuel.",
        ],
        transport_fare_status="not_required" if req.transport == "car" else "unknown",
    )
