"""Bounded, conservative OSM coordinate enrichment for discovered venues.
A geocoder match is NOT an occupancy, availability, diet or opening-hours check.
No name match / ambiguous match => leave coordinates unknown. Cache public POIs
atomically on disk; cache failure never breaks planning. No booking credentials.
"""

import hashlib
import json
import math
import os
import re
import time
from pathlib import Path
from threading import Lock

from app.travel.providers.nominatim import search

from .evidence import _distance

ROOT = Path(__file__).resolve().parents[3] / ".planning-runtime" / "venues"
LOCK = Lock()


def _tokens(value):
    ignored = {
        "sri",
        "shri",
        "hotel",
        "restaurant",
        "pure",
        "veg",
        "the",
        "and",
        "lodge",
        "resort",
        "family",
        "rooms",
        "telangana",
        "india",
    }
    return {
        w
        for w in re.findall("[a-z]+", value.lower())
        if len(w) > 2 and w not in ignored
    }


def _lookup(venue, anchor):
    query = (
        venue["name"]
        + ", "
        + (str(venue.get("city", "")) or str(venue.get("address", "")))
        + ", Telangana"
    )
    path = ROOT / (hashlib.sha256(query.encode()).hexdigest() + ".json")
    with LOCK:
        try:
            cached = json.loads(path.read_text())
            if time.time() < cached["expires_at"]:
                return cached["match"]
        except (OSError, ValueError, KeyError):
            pass
        match = None
        try:
            candidates = search(query, limit=3, timeout_seconds=2)
            name = _tokens(venue["name"])
            hits = []
            for c in candidates:
                pin = {"lat": c.latitude, "lng": c.longitude}
                if not (15.6 <= c.latitude <= 20.3 and 76.6 <= c.longitude <= 81.5):
                    continue
                overlap = name & _tokens(c.display_name)
                if not name or len(overlap) < max(1, math.ceil(len(name) * 0.75)):
                    continue
                if c.place_type not in {
                    "restaurant",
                    "hotel",
                    "guest_house",
                    "hostel",
                    "motel",
                    "resort",
                    "cafe",
                    "fast_food",
                    "food_court",
                }:
                    continue
                if _distance(anchor, pin) > 10:
                    continue
                hits.append(c)
            if len(hits) == 1:
                c = hits[0]
                match = {
                    "lat": c.latitude,
                    "lng": c.longitude,
                    "coordinates_source": "Nominatim name/type/scope match; not venue confirmation",
                    "coordinates_query": query,
                    "coordinates_display_name": c.display_name,
                    "coordinates_checked_at": time.time(),
                }
        except (OSError, ValueError, RuntimeError, TimeoutError):
            pass
        try:
            ROOT.mkdir(parents=True, exist_ok=True)
            temp = path.with_suffix(".tmp")
            temp.write_text(
                json.dumps(
                    {
                        "expires_at": time.time() + (86400 if match else 300),
                        "match": match,
                    }
                )
            )
            os.replace(temp, path)
        except OSError:
            pass
        return match


def locate(req, opts, places):
    known = {p["id"]: p for p in places}
    deadline = time.monotonic() + 6
    lookups = 0
    # At most one occupancy-matching hotel and two relevant meal venues.
    hotel_candidates = (
        [
            h
            for h in opts["hotels"]
            if h.get("requirements_match")
            and h.get("lat") is None
            and (not req.hotel_id or h["id"] == req.hotel_id)
        ]
        if req.stay_mode == "overnight"
        else []
    )
    food = [
        r
        for r in opts["restaurants"]
        if r.get("lat") is None
        and r["temple_id"] == req.primary_temple_id
        and any(r.get("windows", {}).values())
    ][:2]
    for venue in hotel_candidates[:1] + food:
        if time.monotonic() >= deadline:
            break
        anchor = known.get(venue.get("temple_id"))
        if not anchor:
            continue
        match = _lookup(venue, anchor)
        lookups += 1
        if match:
            venue.update(match)
    if req.stay_mode == "overnight" and not opts.get("selected_hotel"):
        eligible = [
            h
            for h in opts["hotels"]
            if h.get("requirements_match")
            and h.get("lat") is not None
            and h.get("check_in_minute") is not None
            and h.get("check_out_minute") is not None
            and (not req.hotel_id or h["id"] == req.hotel_id)
        ]
        if eligible:
            opts["selected_hotel"] = eligible[0]
            opts["notes"] = [
                n for n in opts.get("notes", []) if n != "hotel_requirements_unverified"
            ]
    opts["coordinate_discovery"] = {
        "lookup_limit": 3,
        "lookups": lookups,
        "availability_verified": False,
    }
    return opts
