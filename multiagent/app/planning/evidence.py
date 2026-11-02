"""Bounded adapters over the existing agents' deterministic data/provider cores.
No paid LLM, account secrets or fabricated booking availability are required.
"""

import json
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from urllib.parse import urlencode

from app.agents import accommodation, budget, temple
from app.core.config import settings
from app.travel.providers.routing import route_osrm
from app.travel.resolver import resolve_place
from app.travel.schemas import Coordinate

from .calendar import _normalized, opening_windows


def map_link(query: str) -> str:
    return "https://www.google.com/maps/search/?" + urlencode(
        {"api": 1, "query": query}
    )


def platform_links(origin: str, destination: str) -> list[dict]:
    # Platform search entry points; no unsupported vendor city IDs/date formats.
    return [
        {"label": "redBus", "url": "https://www.redbus.in/", "kind": "bus_search"},
        {"label": "AbhiBus", "url": "https://www.abhibus.com/", "kind": "bus_search"},
        {
            "label": "IRCTC",
            "url": "https://www.irctc.co.in/nget/train-search",
            "kind": "train_search",
        },
        {"label": "OYO", "url": "https://www.oyorooms.com/", "kind": "hotel_search"},
        {
            "label": "Booking.com",
            "url": "https://www.booking.com/searchresults.html?"
            + urlencode({"ss": destination}),
            "kind": "hotel_search",
        },
        {
            "label": "MakeMyTrip",
            "url": "https://www.makemytrip.com/hotels/",
            "kind": "hotel_search",
        },
        {
            "label": "Google Maps",
            "url": "https://www.google.com/maps/dir/?"
            + urlencode({"api": 1, "origin": origin, "destination": destination}),
            "kind": "directions",
        },
    ]


def catalog(ids: list[str], start: date, days: int) -> list[dict]:
    from datetime import timedelta

    result = []
    for tid in ids:
        path = temple._TEMPLE_DIR / f"{tid}.json"
        if not path.is_file():
            raise ValueError(f"Unknown temple: {tid}")
        raw = json.loads(path.read_text(encoding="utf-8"))
        location = raw.get("location") or {}
        lat, lng = float(location["latitude"]), float(location["longitude"])
        nearby = []
        for item in (raw.get("nearby_places") or [])[:8]:
            name = (
                item if isinstance(item, str) else item.get("name") or item.get("place")
            )
            if name:
                nearby.append(
                    {
                        "name": name,
                        "url": map_link(str(name) + " Telangana"),
                        "scheduled": False,
                    }
                )
        result.append(
            {
                "id": tid,
                "name": raw["name"],
                "lat": lat,
                "lng": lng,
                "hours_basis": _normalized().get(tid, {}).get("note", "Unknown"),
                "windows": {
                    (start + timedelta(days=i)).isoformat(): opening_windows(
                        raw, start + timedelta(days=i)
                    )
                    for i in range(days)
                },
                "facts": {
                    k: raw.get(k)
                    for k in [
                        "summary",
                        "overview",
                        "history",
                        "darshan_timings",
                        "timing_conflict_note",
                        "dress_code",
                        "darshan_and_tickets",
                        "sevas",
                        "facilities",
                        "accessibility",
                        "contact",
                        "travel",
                        "sources",
                        "last_verified",
                    ]
                },
                "nearby": nearby,
                "url": map_link(f"{lat},{lng}"),
                "evidence": temple._dataset_evidence(
                    [tid], "darshan timings dress tickets accessibility travel"
                ),
            }
        )
    return result


def origin_point(text: str) -> dict:
    import re

    match = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*", text)
    if match:
        lat, lng = float(match[1]), float(match[2])
        if not (15.6 <= lat <= 20.3 and 76.6 <= lng <= 81.5):
            raise ValueError("Coordinates are outside the Telangana service area.")
        return {"id": "origin", "name": text, "lat": lat, "lng": lng}
    place = resolve_place(text)
    if not place or not place.coordinates:
        raise ValueError(
            "Starting location is unresolved. Enter a city or precise area."
        )
    return {
        "id": "origin",
        "name": place.display_name,
        "lat": place.coordinates.latitude,
        "lng": place.coordinates.longitude,
    }


def _distance(a: dict, b: dict) -> float:
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp, dl = p2 - p1, math.radians(b["lng"] - a["lng"])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.atan2(math.sqrt(h), math.sqrt(max(0, 1 - h)))


def route_pair(a: dict, b: dict, allow_estimates: bool, deadline: float) -> dict:
    base = {
        "from": a["id"],
        "to": b["id"],
        "url": "https://www.google.com/maps/dir/?"
        + urlencode(
            {
                "api": 1,
                "origin": f"{a['lat']},{a['lng']}",
                "destination": f"{b['lat']},{b['lng']}",
            }
        ),
    }
    try:
        if time.monotonic() >= deadline:
            raise TimeoutError("Route budget expired")
        facts = route_osrm(
            Coordinate(latitude=a["lat"], longitude=a["lng"]),
            Coordinate(latitude=b["lat"], longitude=b["lng"]),
            timeout_seconds=min(2.5, max(0.1, deadline - time.monotonic())),
        )
        values = {f.key: float(f.value) for f in facts}
        return {
            **base,
            "km": values["distance"],
            "minutes": math.ceil(values["duration"]),
            "source": "OSRM",
            "estimated": False,
            "traffic_live": False,
        }
    except Exception:
        if not allow_estimates:
            return {
                **base,
                "km": None,
                "minutes": None,
                "source": "unavailable",
                "estimated": True,
                "traffic_live": False,
            }
        distance = round(_distance(a, b), 2)
        # Deliberately identified scenario, never a road-distance fact.
        return {
            **base,
            "km": distance,
            "minutes": math.ceil(distance / 30 * 60),
            "source": "straight-line / assumed 30 km/h; verify road route",
            "estimated": True,
            "traffic_live": False,
        }


def route_matrix(points: list[dict], allow_estimates: bool) -> dict:
    deadline = time.monotonic() + 38
    pairs = [(a, b) for a in points for b in points if a["id"] != b["id"]]
    result = {}
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = {
            pool.submit(route_pair, a, b, allow_estimates, deadline): (a, b)
            for a, b in pairs
        }
        for f in as_completed(futures):
            a, b = futures[f]
            result[a["id"] + ">" + b["id"]] = f.result()
    return result


def stay_food(req, temples: list[dict]) -> dict:
    """Reuse catalog normalization and strict post-merge constraints, not slow live search.
    Candidates are options, not booked/scheduled properties with invented transfers.
    """
    options = {"hotels": [], "restaurants": []}
    for tm in temples:
        for kind, key in [("hotel", "hotels"), ("restaurant", "restaurants")]:
            if kind == "hotel" and (req.days < 2 or req.stay == "none"):
                continue
            question = (
                (
                    "pure vegetarian"
                    if req.food == "veg"
                    else "jain"
                    if req.food == "jain"
                    else ""
                )
                if kind == "restaurant"
                else ""
            )
            records = (
                accommodation._load_hotels()
                if kind == "hotel"
                else accommodation._load_restaurants()
            )
            selected = accommodation._select_static(
                records,
                question=question,
                entities=[tm["name"]],
                temple_ids=[tm["id"]],
                kind=kind,
            )
            if kind == "hotel":
                import re

                if req.stay in {"guest", "dham"}:
                    pattern = (
                        r"guest|lodge|choultry"
                        if req.stay == "guest"
                        else r"dharam|dham|yatri|satra|choultry|dorm"
                    )
                    selected = [
                        r
                        for r in selected
                        if re.search(
                            pattern,
                            str(r.get("hotel_type", "")) + " " + r["name"],
                            re.I,
                        )
                    ]
                selected.sort(
                    key=lambda r: (
                        budget._parse_price_range(r.get("price_range"))
                        or (float("inf"), float("inf"))
                    )[0],
                    reverse=req.budget_tier == "high",
                )
                if req.budget_tier == "mid" and len(selected) > 3:
                    selected = selected[(len(selected) - 3) // 2 :]
            selected = [r for r in selected if r.get("temple_id") == tm["id"]][:3]
            items = [
                accommodation._hotel_evidence(r)
                if kind == "hotel"
                else accommodation._restaurant_evidence(r)
                for r in selected
            ]
            items, _ = accommodation._enforce_post_merge_constraints(
                items, question, kind
            )
            if req.food == "nonveg" and kind == "restaurant":
                items = []  # no explicit non-veg contract in this catalog adapter
            if req.food == "jain" and kind == "restaurant":
                items = []  # pure veg does not establish Jain suitability
            for item in items:
                options[key].append(
                    {
                        **item,
                        "temple_id": tm["id"],
                        "maps_url": map_link(
                            str(item.get("name", "")) + " " + tm["name"]
                        ),
                        "availability": "unverified",
                    }
                )
    return options


def calculate_budget(req, days: list[dict], options: dict) -> dict:
    """Use existing budget-agent money parsing; arithmetic is per explicit unit."""
    total_people = req.adults + req.children + req.elderly
    km = sum(
        float(i.get("distance_km") or 0)
        for d in days
        for i in d["items"]
        if i["type"] == "travel"
    )
    components = []
    missing = [
        "Temple tickets / optional sevas: confirm selected services and current charges",
        "Tolls, parking and any booking taxes not supplied by providers",
    ]
    if req.transport == "car":
        amount = round(km * settings.fuel_cost_per_km)
        components.append(
            {
                "name": "vehicle_fuel",
                "low": amount,
                "high": amount,
                "basis": f"{km:.1f} km × ₹{settings.fuel_cost_per_km}/km, per vehicle; estimates inherit route uncertainty",
            }
        )
    else:
        missing.append(
            "Public transport fares / taxi quote: not available; platform search is not a fare"
        )
    restaurant_costs = []
    for r in options["restaurants"]:
        one = r.get("average_cost_for_one")
        two = r.get("average_cost_for_two")
        try:
            cost = (
                float(one)
                if one is not None
                else float(two) / 2
                if two is not None
                else None
            )
            if cost is not None:
                restaurant_costs.append(cost)
        except (ValueError, TypeError):
            pass
    if restaurant_costs:
        count = 3 * req.days * total_people
        components.append(
            {
                "name": "food",
                "low": round(min(restaurant_costs) * count),
                "high": round(max(restaurant_costs) * count),
                "basis": f"3 meals/day × {total_people} people × {req.days} days; catalog meal-price scenario, not a booking",
            }
        )
    else:
        missing.append("Food prices matching your dietary requirements")
    if req.days > 1 and req.stay != "none":
        costs = [
            budget._parse_price_range(h.get("price_range")) for h in options["hotels"]
        ]
        costs = [c for c in costs if c]
        if costs:
            n = (req.days - 1) * req.rooms
            components.append(
                {
                    "name": "stay",
                    "low": round(min(c[0] for c in costs) * n),
                    "high": round(max(c[1] for c in costs) * n),
                    "basis": f"{req.days - 1} nights × {req.rooms} rooms; occupancy, property category and date-specific availability unverified",
                }
            )
        else:
            missing.append("Accommodation price and occupancy")
    low = sum(c["low"] for c in components)
    high = sum(c["high"] for c in components)
    return {
        "currency": "INR",
        "components": components,
        "low": low,
        "high": high,
        "missing": missing,
        "complete": False,
        "cap": req.budget_cap,
        "within_cap": None if req.budget_cap is None else high <= req.budget_cap,
        "distance_km": round(km, 1),
    }
