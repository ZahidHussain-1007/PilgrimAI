"""Travel agent - resolve places, run the provider chain, emit structured
evidence (facts + calculations + notes). Google first when a key is configured,
then OSRM, then Haversine (approximate)."""
from __future__ import annotations

import math

import json
from pathlib import Path

from app.agents import temple as _temple_agent
from app.agents.accommodation import _osm_evidence, _overpass_search
from app.core.config import settings
from app.services.entity_registry import get_entity_registry
from app.travel.calculations import calculate_travel
from app.travel.providers.route_chain import route_with_fallbacks
from app.travel.resolver import (
    TravelResolverClarificationError,
    TravelResolverError,
    resolve_place,
)


def _place_evidence(role: str, place) -> dict:
    return {
        "source": place.source,
        "kind": "place",
        "role": role,
        "name": place.display_name,
        "latitude": place.coordinates.latitude,
        "longitude": place.coordinates.longitude,
        "resolved_via": place.source,
    }


def _route_evidence(route_result) -> list[dict]:
    items: list[dict] = []

    for fact in route_result.facts:
        value = fact.value
        if isinstance(value, str) and len(value) > 400:
            value = value[:400] + " …"
        items.append(
            {
                "source": fact.provider,
                "kind": "fact",
                "key": fact.key,
                "value": value,
                "unit": fact.unit,
                "provider": fact.provider,
                "approximate": fact.approximate,
            }
        )

    for calc in route_result.calculations:
        items.append(
            {
                "source": "calculation",
                "kind": "calculation",
                "key": calc.key,
                "value": calc.value,
                "unit": calc.unit,
                "status": calc.status,
                "estimated": calc.estimated,
                "method": calc.method,
                "provider": (calc.metadata or {}).get("provider"),
            }
        )

    items.append(
        {
            "source": "route_chain",
            "kind": "status",
            "status": route_result.status,
            "selected": (route_result.metadata or {}).get("selected_provider"),
            "approximate": bool((route_result.metadata or {}).get("approximate")),
            "errors": [
                {"provider": err.provider, "error": err.message}
                for err in route_result.errors
            ],
        }
    )
    return items


def _temple_id_for(anchor: str) -> str | None:
    """Registry-first: is the anchor one of OUR temples? entity_id for
    temples is the dataset file id (T0009, ...)."""
    if not anchor.strip():
        return None
    try:
        result = get_entity_registry().resolve(
            mention=anchor,
            entity_type="temple",
        )
    except Exception:  # noqa: BLE001
        return None
    if result.get("status") != "RESOLVED":
        return None
    entity_id = str(result.get("entity_id") or "")
    return entity_id if entity_id else None


# question keywords -> LIVE OpenStreetMap kind (RAG dataset + realtime)
_NEARBY_KIND_KEYWORDS: list[tuple[tuple[str, ...], str]] = [
    (("ambulance",), "ambulance"),
    (("fire station", "fire brigade", "fire engine"), "fire_station"),
    (("hospital", "clinic", "emergency", "medical", "doctor",
      "unwell", "sick", "fever"), "hospital"),
    (("pharmacy", "chemist", "medicine", "medical shop"), "pharmacy"),
    (("police", "station house"), "police"),
    (("atm", "cash machine", "withdraw cash"), "atm"),
    (("parking", "park my", "park your", "park the"), "parking"),
    (("petrol", "fuel", "gas station", "petrol pump"), "fuel"),
    (("bus station", "bus stand"), "bus_station"),
    (("hotel", "lodging", "rooms near", "stay near"), "hotel"),
    (("restaurant", "food near", "eat near", "dining", "meals near"),
     "restaurant"),
    (("tourist", "attraction", "attractions", "sightseeing",
      "things to see", "places to see", "visit nearby", "what to see"),
     "attraction"),
]

# verified per-temple emergency dataset (data/emergency/T*.json, 23 files)
_EMERGENCY_DATA_DIR = (
    Path(__file__).resolve().parents[2] / "data" / "emergency"
)
_emergency_index: dict[str, dict] | None = None

# question/kind -> sections inside the emergency dataset
_EMERGENCY_SECTION_HINTS: list[tuple[tuple[str, ...], str]] = [
    (("ambulance",), "ambulance_services"),
    (("fire station", "fire brigade", "fire"), "fire_rescue"),
    (("pharmacy", "chemist", "medicine", "medical shop"), "pharmacies"),
    (("police", "station house"), "police"),
    (("hospital", "clinic", "medical", "doctor", "health", "unwell",
      "sick", "fever", "emergency"), "hospitals"),
]


def _emergency_index_load() -> dict[str, dict]:
    global _emergency_index
    if _emergency_index is None:
        index: dict[str, dict] = {}
        if _EMERGENCY_DATA_DIR.exists():
            for path in sorted(_EMERGENCY_DATA_DIR.glob("T*.json")):
                try:
                    record = json.loads(path.read_text(encoding="utf-8"))
                except Exception:  # noqa: BLE001 - skip broken file, keep rest
                    continue
                temple_id = str(record.get("temple_id") or "")
                if temple_id:
                    index[temple_id] = record
        _emergency_index = index
    return _emergency_index


def _emergency_sections(question: str, live_kind: str | None) -> list[str]:
    lowered = (question or "").lower()
    sections: list[str] = []
    for keywords, section in _EMERGENCY_SECTION_HINTS:
        if section in sections:
            continue
        if any(keyword in lowered for keyword in keywords):
            sections.append(section)
    if live_kind == "hospital" and "hospitals" not in sections:
        sections.append("hospitals")
    if live_kind == "police" and "police" not in sections:
        sections.append("police")
    if live_kind == "pharmacy" and "pharmacies" not in sections:
        sections.append("pharmacies")
    if live_kind == "fire_station" and "fire_rescue" not in sections:
        sections.append("fire_rescue")
    if live_kind == "ambulance" and "ambulance_services" not in sections:
        sections.append("ambulance_services")
    return sections


def _haversine_km(
    a_lat: float, a_lng: float, b_lat: float, b_lng: float
) -> float:
    """Straight-line km between two WGS84 points (audit D01 distances)."""
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * r * math.asin(math.sqrt(h)), 2)


_EMERGENCY_NAME_KEYS = (
    "name",
    "police_station_name",
    "fire_station_name",
    "service_name",
    "hospital_name",
)
_EMERGENCY_PHONE_KEYS = (
    "phone",
    "emergency_phone",
    "station_phone",
    "contact_number",
)
_EMERGENCY_DISTANCE_KEYS = (
    "distance_from_temple_km",
    "distance_from_temple",
    "distance_km",
    "distance",
)
_MAX_EMERGENCY_KM = 30.0


def _emergency_field(item: dict, keys: tuple[str, ...]) -> str:
    for key in keys:
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            inner = value.get("value")
            if isinstance(inner, str) and inner.strip():
                return inner.strip()
    return ""


def _emergency_coords(item: dict) -> tuple[float | None, float | None]:
    lat = item.get("latitude")
    lon = item.get("longitude")
    coords = item.get("coordinates")
    if isinstance(coords, dict):
        if lat is None:
            lat = coords.get("latitude", coords.get("lat"))
        if lon is None:
            lon = coords.get("longitude", coords.get("lon", coords.get("lng")))
    try:
        return (
            float(lat) if lat is not None else None,
            float(lon) if lon is not None else None,
        )
    except (TypeError, ValueError):
        return None, None


def _emergency_distance_km(item: dict) -> float | None:
    for key in _EMERGENCY_DISTANCE_KEYS:
        value = item.get(key)
        if value is None:
            continue
        try:
            text = str(value).lower().replace("km", "").strip()
            return round(float(text), 2)
        except (TypeError, ValueError):
            continue
    return None


def _emergency_evidence(
    temple_id: str,
    question: str,
    live_kind: str | None,
    place: dict | None = None,
) -> tuple[list[dict], list[str]]:
    """Verified facilities from data/emergency/T*.json (hospitals, police,
    pharmacies, ambulance, fire) - always available, no network needed.

    v14 (audit D03): every section's real key names are read (police uses
    'police_station_name', fire 'fire_station_name', ambulance
    'service_name' - the old 'name'-only gate dropped them entirely).
    v14 (audit D01): when the anchor place resolved, distances are
    recomputed from its coordinates; records whose stored coordinates
    imply an implausible distance (>30 km) are EXCLUDED with an honest
    note instead of being shown with a wrong anchor."""
    record = _emergency_index_load().get(temple_id)
    if not record:
        return [], []
    sections = _emergency_sections(question, live_kind)
    evidence: list[dict] = []
    skipped: list[str] = []
    # `place` is a ResolvedPlace model (attr access) — accept dicts too.
    p_lat = getattr(place, "lat", None) if place is not None else None
    p_lon = getattr(place, "lon", None) if place is not None else None
    if isinstance(place, dict):
        p_lat = place.get("lat", p_lat)
        p_lon = place.get("lon", p_lon)
    for section in sections:
        for item in (record.get("emergency") or {}).get(section) or []:
            if not isinstance(item, dict):
                continue
            name = _emergency_field(item, _EMERGENCY_NAME_KEYS)
            phone = _emergency_field(item, _EMERGENCY_PHONE_KEYS)
            if not name:
                # 25/27 ambulance records store an EMPTY service_name and
                # 1 fire record is blank. If a verified phone exists, label
                # the facility TYPE (never invent a proper name); records
                # with neither name nor phone are placeholders — skip.
                if phone and section == "ambulance_services":
                    name = "Ambulance service"
                elif phone and section == "fire_rescue":
                    name = "Fire station"
                else:
                    continue
            r_lat, r_lon = _emergency_coords(item)
            distance = _emergency_distance_km(item)
            distance_source = "dataset" if distance is not None else None
            if (
                p_lat is not None
                and p_lon is not None
                and r_lat is not None
                and r_lon is not None
            ):
                computed = _haversine_km(p_lat, p_lon, r_lat, r_lon)
                if computed > _MAX_EMERGENCY_KM:
                    skipped.append(
                        f"{name} ({section}) — stored coordinates imply "
                        f"{computed:.1f} km from the resolved place"
                    )
                    continue
                distance = computed
                distance_source = "computed"
            evidence.append(
                {
                    "source": "temple_emergency",
                    "kind": "poi",
                    "source_tier": "verified-data",
                    "name": name,
                    "category": section,
                    "cuisine": None,
                    "phone": phone or None,
                    "website": str(item.get("website") or "").strip() or None,
                    "address": str(item.get("address") or "").strip() or None,
                    "latitude": r_lat,
                    "longitude": r_lon,
                    "distance_km": distance,
                    "distance_source": distance_source,
                    "travel_time": item.get("estimated_travel_time"),
                    "hours": str(item.get("opening_hours") or "").strip()
                    or None,
                    "open_24x7": item.get("24x7_emergency")
                    if item.get("24x7_emergency") is not None
                    else item.get("24x7"),
                    "google_maps_url": item.get("google_maps_url"),
                    "temple_id": temple_id,
                }
            )
    return evidence[:6], skipped


def _live_kind(question: str) -> str | None:
    lowered = question.lower()
    for keywords, kind in _NEARBY_KIND_KEYWORDS:
        if any(keyword in lowered for keyword in keywords):
            return kind
    return None


def _run_nearby(subquery: dict) -> dict:
    """travel_nearby: resolve the anchor (endpoints, entity mentions, or the
    question text - whichever actually names one of OUR temples), then
    answer 'what is near X' from TWO layers:
      1. verified temple dataset (nearby_places / nearby_infrastructure) -
         always, never model memory;
      2. LIVE OpenStreetMap radius search for the asked kind (hospitals,
         police, ATMs, parking, petrol, hotels, food) - keyless realtime.
    Honest note only when both layers come back empty."""
    entities = [
        str(mention)
        for mention in (subquery.get("entities") or [])
        if str(mention).strip()
    ]
    destination = str(subquery.get("destination") or "")
    origin = str(subquery.get("origin") or "")
    question = str(subquery.get("question") or "")
    anchor_raw = destination or origin or (entities[0] if entities else "")

    # Find OUR temple among every candidate (context ids first, then each
    # endpoint, each mention, and finally the full question - containment
    # matching inside the question still hits "Birla Mandir").
    temple_id: str | None = None
    matched_name: str | None = None
    ctx_ids = [
        str(item)
        for item in (subquery.get("temple_ids") or [])
        if str(item).strip()
    ]
    if ctx_ids:
        temple_id = ctx_ids[0]
    else:
        for candidate in [destination, origin, *entities, question]:
            found = _temple_id_for(candidate)
            if found:
                temple_id = found
                if not anchor_raw:
                    anchor_raw = candidate
                matched_name = candidate
                break

    if not anchor_raw.strip() and not temple_id:
        return {
            "status": "ERROR",
            "error": "place_missing",
            "evidence": [
                {
                    "source": "travel",
                    "kind": "error",
                    "error": "place_missing",
                }
            ],
        }

    place_anchor = matched_name or anchor_raw
    evidence: list[dict] = []
    place = None
    if place_anchor.strip():
        place = resolve_place(place_anchor)
        evidence.append(_place_evidence("near", place))

    pre_live_kind = _live_kind(question)
    # Verified per-temple emergency dataset (hospitals/police/pharmacies/
    # ambulance/fire) - no network needed, answers even when OSM is down.
    emergency_items: list[dict] = []
    if temple_id:
        emergency_items, emergency_skipped = _emergency_evidence(
            temple_id, question, pre_live_kind, place
        )
        evidence.extend(emergency_items)
        if emergency_skipped:
            evidence.append(
                {
                    "source": "emergency",
                    "kind": "note",
                    "source_tier": "verified-data",
                    "key": "anchor_conflict_excluded",
                    "content": (
                        "Some emergency records were excluded because their "
                        "stored coordinates are inconsistent with the "
                        "resolved place: " + "; ".join(emergency_skipped[:3])
                    ),
                }
            )

    # Verified dataset layer: nearby attractions of an OUR temple always
    # answer from the curated temple JSON (never model memory).
    nearby_evidence: list[dict] = []
    if temple_id:
        nearby_evidence = [
            item
            for item in _temple_agent._dataset_evidence([temple_id])
            if item.get("field_name") in {
                "nearby_places",
                "nearby_infrastructure",
            }
        ]

    # LIVE OpenStreetMap layer for the kind the question asks about
    # (hospitals, police, ATMs, parking, petrol, hotels, food) - realtime,
    # keyless. Failures degrade to the dataset layer + honest note.
    live_kind = _live_kind(question or subquery.get("question") or "")
    osm_error: str | None = None
    osm_count = 0
    if live_kind and place is not None:
        try:
            pois, osm_error = _overpass_search(
                live_kind,
                place.coordinates.latitude,
                place.coordinates.longitude,
            )
        except Exception as exc:  # noqa: BLE001
            pois, osm_error = [], f"{type(exc).__name__}: {exc}"
        static_names = [
            str(item.get("name") or "")
            for item in [*nearby_evidence, *emergency_items]
        ]
        osm_items = []
        for poi in pois:
            item = _osm_evidence(poi, "osm_search")
            if item["name"].lower() in {
                n.lower() for n in static_names if n
            }:
                continue
            osm_items.append(item)
        evidence.extend(osm_items[: settings.overpass_max_pois])
        osm_count = len(osm_items)
        if osm_error:
            evidence.append(
                {
                    "source": "osm_search",
                    "kind": "note",
                    "key": "osm_status",
                    "error": "Live OpenStreetMap search is unavailable right now.",
                    "hint": None,
                }
            )

    evidence.extend(nearby_evidence)

    if not nearby_evidence and not osm_count:
        # nothing at all: dataset empty AND (no kind asked OR live failed)
        note = {
            "source": "travel",
            "kind": "note",
            "key": "nearby_search_unavailable",
            "error": "No nearby information is available for this place right now.",
        }
        note["hint"] = settings.fallback_transit_link
        evidence.append(note)

    return {
        "status": "COMPLETED",
        "evidence": evidence,
    }


def run(subquery: dict) -> dict:
    """Returns {status, evidence} or raises TravelResolverClarificationError
    (caught by the runner for a composer-phrased clarification)."""
    if subquery.get("category") == "travel_nearby":
        return _run_nearby(subquery)

    origin_raw = subquery.get("origin")
    destination_raw = subquery.get("destination")

    origin_missing = not origin_raw or not str(origin_raw).strip()
    destination_missing = not destination_raw or not str(destination_raw).strip()

    if origin_missing or destination_missing:
        if origin_missing and destination_missing:
            return {
                "status": "ERROR",
                "error": "origin_or_destination_missing",
                "evidence": [
                    {
                        "source": "travel",
                        "kind": "error",
                        "error": "origin_or_destination_missing",
                    }
                ],
            }
        # One endpoint known: resolve and present it (name + map link) so the
        # reply can answer with what we have, then ask only for the missing end.
        known_role = "destination" if origin_missing else "origin"
        known_raw = destination_raw if origin_missing else origin_raw
        missing_field = "origin" if origin_missing else "destination"
        known = resolve_place(str(known_raw).strip())
        return {
            "status": "COMPLETED",
            "evidence": [
                _place_evidence(known_role, known),
                {
                    "source": "travel",
                    "kind": "note",
                    "key": "route_end_missing",
                    "error": f"Route needs the {missing_field} to calculate distance and directions.",
                },
            ],
        }

    mode = subquery.get("mode") or "driving"

    origin = resolve_place(origin_raw)      # may raise clarification
    destination = resolve_place(destination_raw)

    route_result = route_with_fallbacks(
        origin.coordinates,
        destination.coordinates,
        mode=mode,
    )

    calculations = []
    if route_result.status in {"COMPLETED", "PARTIAL"}:
        calculations = calculate_travel(
            route_result.facts,
            cost_per_km=settings.fuel_cost_per_km,
        )
        route_result.calculations = calculations

    evidence: list[dict] = [
        _place_evidence("origin", origin),
        _place_evidence("destination", destination),
    ]
    evidence.extend(_route_evidence(route_result))

    if mode == "transit":
        # No transit provider in a keyless deployment: honest Redbus fallback.
        evidence.append(
            {
                "source": "travel",
                "kind": "note",
                "key": "transit_unavailable",
                "error": "No transit/bus data available for this route right now.",
                "hint": settings.fallback_transit_link,
            }
        )

    return {
        "status": "COMPLETED" if route_result.status in {"COMPLETED", "PARTIAL"} else "ERROR",
        "evidence": evidence,
        "provider_status": route_result.status,
    }


__all__ = ["run", "TravelResolverClarificationError", "TravelResolverError"]
