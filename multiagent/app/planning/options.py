"""Evidence-preserving stay/food adapters. Discovery != requirement match !=
availability verification != booking. Unknown capacity or coordinates stay null.
"""

import json
import re
from datetime import timedelta
from pathlib import Path

from app.agents import accommodation, budget

from .contracts import StayFoodEvidence
from .evidence import map_link

DATA = Path(__file__).resolve().parents[2] / "data"


def time_clock(text):
    m = re.fullmatch(r"\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)\s*", str(text), re.I)
    if not m:
        return None
    hour = int(m[1])
    minute = int(m[2] or 0)
    if not 1 <= hour <= 12 or minute > 59:
        return None
    return (hour % 12 + (12 if m[3].upper() == "PM" else 0)) * 60 + minute


def restaurant_windows(raw, req):
    hours = raw.get("workingHours") or {}
    a = time_clock(hours.get("openingTime"))
    b = time_clock(hours.get("closingTime"))
    if a is None or b is None or a == b:
        return {}
    days = hours.get("workingDays")
    names = [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
    ]
    # Missing working days are unknown, never assume every day.
    if isinstance(days, list):
        valid = {names.index(str(d).lower()) for d in days if str(d).lower() in names}
    elif isinstance(days, str) and (
        "daily" in days.lower() or "all days" in days.lower()
    ):
        valid = set(range(7))
    elif (
        isinstance(days, str) and "monday" in days.lower() and "sunday" in days.lower()
    ):
        valid = set(range(7))
    else:
        valid = set()
    result = {}
    for i in range(req.days):
        day = req.start_date + timedelta(days=i)
        windows = []
        if day.weekday() in valid:
            if b > a:
                windows.append([a, b])
            else:
                windows.append([a, 1439])
        if (day.weekday() - 1) % 7 in valid and b < a:
            windows.insert(0, [0, b])
        result[day.isoformat()] = windows
    return result


def _coords(raw):
    """Verified coordinates only, filtered by the catalogue service area.

    v23.2: the box now comes from configuration instead of literals, and the
    extra `lat`/`lng` spellings are accepted so enriched records are picked
    up without inventing anything. A record without coordinates still
    returns (None, None) - unknown stays unknown.
    """
    from app.core.config import settings

    loc = raw.get("location") or {}
    lat = loc.get("latitude", raw.get("latitude", raw.get("lat")))
    lng = loc.get("longitude", raw.get("longitude", raw.get("lng")))
    if not isinstance(lat, (int, float)) or not isinstance(lng, (int, float)):
        return None, None
    if isinstance(lat, bool) or isinstance(lng, bool):
        return None, None
    try:
        min_lat, min_lon, max_lat, max_lon = (
            float(part) for part in settings.geo_scope_bbox.split(",")
        )
    except (AttributeError, TypeError, ValueError):
        return lat, lng
    if min_lat <= lat <= max_lat and min_lon <= lng <= max_lon:
        return lat, lng
    return None, None


def _capacity(raw):
    """Room capacity, only when the record actually publishes it."""
    for key in ("max_adults_per_room", "room_capacity", "capacity_per_room"):
        value = raw.get(key)
        if isinstance(value, int) and not isinstance(value, bool) and value > 0:
            return value
    return None


def _capacity_reason(capacity, people, rooms, category_match):
    """Human-readable reason a hotel did or did not meet the requirement."""
    if not category_match:
        return "The property type does not match the selected stay preference."
    if capacity is None:
        return (
            "Room capacity is not published in this verified record, so a "
            f"{people}-guest requirement cannot be confirmed."
        )
    if capacity * rooms < people:
        return (
            f"Published capacity is {capacity} guest(s) per room; "
            f"{rooms} room(s) is not enough for {people} guest(s)."
        )
    return (
        f"Published capacity is {capacity} guest(s) per room, which covers "
        f"{people} guest(s) in {rooms} room(s)."
    )


def retrieve(req, places) -> StayFoodEvidence:
    wanted = {p["id"] for p in places}
    people = req.adults + req.children + req.elderly
    result = {"hotels": [], "restaurants": [], "selected_hotel": None, "notes": []}
    for path in sorted((DATA / "accommodations").glob("*.json")):
        meta = json.loads(path.read_text(encoding="utf-8"))
        if meta.get("temple_id") not in set(req.temple_ids):
            continue
        for raw in meta.get("hotels", []):
            norm = accommodation._norm_hotel(raw, meta)
            # Show discovered options even when capacity can't be proven.
            if req.stay == "none":
                continue
            capacity = _capacity(raw)
            extra = raw.get("extra_bed_available")
            lat, lng = _coords(raw)
            price = budget._parse_price_range(raw.get("price_range"))
            kind = norm["hotel_type"].lower()
            category_match = (
                bool(re.search(r"hotel|resort", kind))
                if req.stay == "hotel"
                else bool(re.search(r"guest|lodge", kind))
                if req.stay == "guest"
                else bool(re.search(r"dharam|satra|choultry|dorm", kind))
            )
            match = (
                category_match
                and capacity is not None
                and capacity * req.rooms >= people
            )
            item = {
                **accommodation._hotel_evidence(norm),
                "id": raw.get("hotel_id") or path.stem,
                "source_url": norm["website"] or norm["map_link"],
                "last_verified": raw.get("last_verified") or meta.get("last_verified"),
                "catalog_proximity": raw.get("nearby_landmarks") or [],
                "source_record": f"multiagent/data/accommodations/{path.name}",
                "maps_url": norm["map_link"]
                or map_link(norm["name"] + " " + norm["address"]),
                "price_low": price[0] if price else None,
                "price_high": price[1] if price else None,
                "price_status": "catalog_estimate" if price else "unknown",
                "capacity_per_room": capacity,
                "extra_bed": extra if isinstance(extra, bool) else None,
                "requested_rooms": req.rooms,
                "requested_people": people,
                "category_match": category_match,
                "requirements_match": match,
                "match_status": "matches_catalog_constraints"
                if match
                else "capacity_unknown"
                if capacity is None
                else "does_not_match",
                # v23.2: a name in the dataset is discovery, never
                # verification. Each requirement is reported separately so
                # the UI can say exactly what is and is not confirmed.
                "match_reason": _capacity_reason(
                    capacity, people, req.rooms, category_match
                ),
                "capacity_verified": capacity is not None,
                "coordinates_verified": lat is not None,
                "timing_verified": time_clock(norm["check_in"]) is not None
                and time_clock(norm["check_out"]) is not None,
                "availability": "unverified",
                "booking_status": "not_booked",
                "verification": "catalog_not_live",
                "distance_from_route_km": None,
                "lat": lat,
                "lng": lng,
                "check_in_minute": time_clock(norm["check_in"]),
                "check_out_minute": time_clock(norm["check_out"]),
                "chargeable_nights": req.days - 1
                if req.stay_mode == "overnight"
                else 0,
            }
            result["hotels"].append(item)
    for path in sorted((DATA / "restaurants").glob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        norm = accommodation._norm_restaurant(raw)
        if norm["temple_id"] not in wanted or not norm["open"]:
            continue
        dietary = raw.get("dietaryInformation") or raw.get("foodType") or {}
        match = (
            req.food == "any"
            or (req.food == "veg" and norm["vegetarian"] is True)
            or (req.food == "nonveg" and dietary.get("nonVegetarian") is True)
            or (req.food == "jain" and dietary.get("jain") is True)
        )
        if not match:
            continue
        price = budget._parse_price_range(norm["average_cost_for_one"])
        if price is None:
            two = budget._parse_price_range(norm["average_cost_for_two"])
            price = (two[0] / 2, two[1] / 2) if two else None
        lat, lng = _coords(raw)
        result["restaurants"].append(
            {
                **accommodation._restaurant_evidence(norm),
                "id": raw.get("restaurantId") or path.stem,
                "source_url": norm["maps_link"],
                "source_record": f"multiagent/data/restaurants/{path.name}",
                "maps_url": norm["maps_link"]
                or map_link(norm["name"] + " " + norm["address"]),
                "price_low": price[0] if price else None,
                "price_high": price[1] if price else None,
                "price_status": "catalog_estimate" if price else "unknown",
                "windows": restaurant_windows(raw, req),
                "lat": lat,
                "lng": lng,
                "verification": "catalog_not_live",
                "availability": "unverified",
                "diet_match": True,
                "diet_evidence": "pure_vegetarian"
                if norm["pure_veg"]
                else "vegetarian_options"
                if req.food == "veg"
                else req.food,
                "distance_status": "catalog_estimate",
                "distance_from_route_km": norm.get("distance_km"),
            }
        )
    result["hotels"].sort(
        key=lambda h: (
            not h["requirements_match"],
            h["temple_id"] != req.primary_temple_id,
            not h["category_match"],
            h["price_low"] is None,
            h["price_low"] or 0,
            h["id"],
        )
    )
    result["restaurants"].sort(
        key=lambda r: (
            not r["pure_veg"] if req.food == "veg" else False,
            r["price_low"] is None,
            r["price_low"] or 0,
            r["id"],
        )
    )
    if req.stay_mode == "overnight":
        # Verified selection: capacity + coordinates + check-in/out all
        # evidenced by the record itself.
        eligible = [
            h
            for h in result["hotels"]
            if h["requirements_match"]
            and h["lat"] is not None
            and h["check_in_minute"] is not None
            and h["check_out_minute"] is not None
        ]
        if req.hotel_id:
            eligible = [h for h in eligible if h["id"] == req.hotel_id]
        if eligible:
            result["selected_hotel"] = eligible[0]
            result["hotel_status"] = "verified_match"
        else:
            # Nothing verified. Report *why* instead of a bare flag, and keep
            # the discovered properties as clearly-unverified options.
            missing = {
                "capacity": sum(1 for h in result["hotels"] if not h["capacity_verified"]),
                "coordinates": sum(1 for h in result["hotels"] if not h["coordinates_verified"]),
                "timing": sum(1 for h in result["hotels"] if not h["timing_verified"]),
            }
            if not result["hotels"]:
                reason = "No accommodation is catalogued for the selected temples."
            else:
                parts = [
                    f"{count} without published room capacity"
                    for key, count in missing.items()
                    if key == "capacity" and count
                ] + [
                    f"{count} without coordinates"
                    for key, count in missing.items()
                    if key == "coordinates" and count
                ] + [
                    f"{count} without check-in/out times"
                    for key, count in missing.items()
                    if key == "timing" and count
                ]
                reason = (
                    f"{len(result['hotels'])} propert"
                    f"{'y' if len(result['hotels']) == 1 else 'ies'} discovered, "
                    "none verifiable for this stay: " + "; ".join(parts) + "."
                )
            result["hotel_status"] = "unverified_options_only"
            result["hotel_unverified_reason"] = reason
            result["notes"].append("hotel_requirements_unverified")
    elif req.stay != "none":
        result["notes"].append("hotel_not_needed_daily_return")
    return result
