"""Travel agent - resolve places, run the provider chain, emit structured
evidence (facts + calculations + notes). Google first when a key is configured,
then OSRM, then Haversine (approximate)."""
from __future__ import annotations

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
    (("hospital", "clinic", "emergency", "ambulance", "medical", "doctor",
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
]


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
            for item in nearby_evidence
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
