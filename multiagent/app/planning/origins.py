"""Scoped planning-origin adapter. Names are not inferred coordinates.
City/district duplicates from geocoding are not resolved using importance alone.
"""

import json
import re
import time
from pathlib import Path
from difflib import SequenceMatcher
from app.travel.resolver import (
    resolve_place,
    TravelResolverClarificationError,
    TravelResolverError,
    _within_geo_scope,
    _resolve_from_geography_registry,
)
from app.travel.providers.nominatim import search
from app.travel.schemas import ResolvedPlace, Coordinate

NAMES = json.loads(
    (
        Path(__file__).resolve().parents[2]
        / "data/geography/telangana_district_names.json"
    ).read_text(encoding="utf-8")
)["names"]
CACHE = Path(".planning-runtime/origins")


def normalized(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def canonical_city(query):
    # Only whole, bare region names: NEVER turn a detailed locality into a city centre.
    text = normalized(query)
    text = re.sub(r"\s+(telangana|india)$", "", text)
    ranked = sorted(
        ((SequenceMatcher(None, text, normalized(n)).ratio(), n) for n in NAMES),
        reverse=True,
    )
    if ranked[0][0] >= 0.86 and (
        ranked[0][0] == 1 or ranked[0][0] - ranked[1][0] >= 0.08
    ):
        return ranked[0][1]
    return None


def resolve_origin(query):
    city = canonical_city(query)
    if not city:
        return resolve_place(query)
    registered = _resolve_from_geography_registry(city)
    if registered and registered.canonical_entity_type in {"city", "town"}:
        return registered.model_copy(update={"query": query})
    key = normalized(city).replace(" ", "-")
    cache = CACHE / (key + ".json")
    try:
        data = json.loads(cache.read_text(encoding="utf-8"))
        if data.get("version") == 2 and time.time() - data["saved_at"] < 7 * 86400:
            return ResolvedPlace.model_validate(data["place"]).model_copy(
                update={"query": query}
            )
    except (OSError, ValueError, KeyError):
        pass
    candidates = []
    settlements = []
    # Preserve a valid historical/transliterated city spelling before correcting
    # a typo against district names; district spelling need not be a city alias.
    queries = list(
        dict.fromkeys(
            [
                s.casefold()
                for s in [
                    query.strip() + ", Telangana, India",
                    city + ", Telangana, India",
                ]
            ]
        )
    )
    for scoped in queries:
        hits = _within_geo_scope(search(scoped, limit=5, timeout_seconds=6))
        candidates += hits
        settlements = [
            c
            for c in hits
            if c.place_type in {"city", "town", "village", "municipality"}
            and SequenceMatcher(
                None, normalized(c.display_name.split(",")[0]), normalized(city)
            ).ratio()
            >= 0.86
        ]
        if settlements:
            break
    if not settlements:
        if candidates:
            unique = {(c.latitude, c.longitude, c.place_type): c for c in candidates}
            raise TravelResolverClarificationError(query, list(unique.values())[:5])
        raise TravelResolverError("Unable to resolve travel place: " + query)
    first = settlements[0]

    def near(c):
        return (c.latitude - first.latitude) ** 2 + (
            c.longitude - first.longitude
        ) ** 2 < 0.02**2

    if any(not near(c) for c in settlements[1:]):
        raise TravelResolverClarificationError(query, settlements)
    result = ResolvedPlace(
        query=query,
        display_name=first.display_name,
        coordinates=Coordinate(latitude=first.latitude, longitude=first.longitude),
        source="nominatim_city",
        confidence=0.95,
    )
    try:
        CACHE.mkdir(parents=True, exist_ok=True)
        temp = cache.with_suffix(".tmp")
        temp.write_text(
            json.dumps(
                {
                    "version": 2,
                    "saved_at": time.time(),
                    "place": result.model_dump(mode="json"),
                }
            ),
            encoding="utf-8",
        )
        temp.replace(cache)
    except OSError:
        pass
    return result
