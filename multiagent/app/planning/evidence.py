"""Bounded adapters over the existing agents' deterministic data/provider cores.
No paid LLM, account secrets or fabricated booking availability are required.
"""

import json
import math
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date
from urllib.parse import urlencode

from app.agents import temple
from app.travel.providers.routing import route_osrm
from .origins import resolve_origin as resolve_place
from app.travel.schemas import Coordinate

from .calendar import _normalized, opening_windows
from .contracts import RouteEvidence, TempleEvidence


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


def _visit_allowance(raw):
    import re

    for seva in raw.get("sevas") or []:
        if not isinstance(seva, dict) or not re.search(
            r"general|entry|visit|museum", str(seva.get("name", "")), re.I
        ):
            continue
        match = re.search(
            r"takes?\s+(\d+)\s*[-–]\s*(\d+)\s*hours?",
            str(seva.get("description", "")),
            re.I,
        )
        if match:
            return int(match[2]) * 60
    return None


def _effort(raw):
    import re

    text = json.dumps(
        {k: raw.get(k) for k in ["accessibility", "overview", "sevas"]},
        ensure_ascii=False,
    ).lower()
    if re.search(r"climb|steep|trekk|[1-9][0-9]{2,}\s+steps", text):
        access = str(
            (raw.get("accessibility") or {}).get("wheelchair_access", "")
        ).lower()
        return (
            "assisted_access"
            if re.search(r"lift|shuttle|battery.operated", access)
            else "climbing"
        )
    walks = re.findall(
        r"(\d+(?:\.\d+)?)\s*[- ]?\s*km\s+(?:pathway|walkway|walk|trail)", text
    )
    if any(float(km) >= 2 for km in walks):
        return "long_walk"
    return "unknown"


def catalog(ids: list[str], start: date, days: int) -> list[TempleEvidence]:
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
                "verification": "catalog_not_live",
                "source": f"multiagent/data/temples/{tid}.json",
                "last_verified": raw.get("last_verified"),
                "required": True,
                "kind": "attraction"
                if any(
                    w
                    in (
                        str(raw.get("summary", "")) + " " + str(raw.get("overview", ""))
                    ).lower()
                    for w in ["museum", "theme park"]
                )
                else "temple",
                "visit_minutes": _visit_allowance(raw),
                "effort": _effort(raw),
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
        return {
            "id": "origin",
            "name": text,
            "lat": lat,
            "lng": lng,
            "source": "user_coordinates",
        }
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
        "source": place.source,
        "confidence": place.confidence,
    }


def _distance(a: dict, b: dict) -> float:
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    dp, dl = p2 - p1, math.radians(b["lng"] - a["lng"])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 6371 * 2 * math.atan2(math.sqrt(h), math.sqrt(max(0, 1 - h)))


def route_pair(
    a: dict, b: dict, allow_estimates: bool, deadline: float
) -> RouteEvidence:
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


def route_matrix(points: list[dict], allow_estimates: bool) -> dict[str, RouteEvidence]:
    deadline = time.monotonic() + 38
    unique = {p["id"]: p for p in points}
    points = list(unique.values())
    pairs = [(a, b) for a in points for b in points if a["id"] != b["id"]]

    def required(p):
        return (
            p["id"] == "origin" or p.get("required", False) or p.get("kind") == "hotel"
        )

    pairs.sort(
        key=lambda pair: (
            0
            if all(required(p) for p in pair)
            else 1
            if any(required(p) for p in pair)
            else 2
        )
    )
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


def stay_food(req, temples):
    from .options import retrieve

    return retrieve(req, temples)


def calculate_budget(req, days: list[dict], options: dict, places=None) -> dict:
    """Compatibility entry point; all budgeting now uses the selected-activity ledger."""
    from .costing import calculate

    return calculate(
        req, days, options, places or catalog(req.temple_ids, req.start_date, req.days)
    )


def locate_options(req, options, places):
    from .venues import locate

    return locate(req, options, places)
