"""Travel agent - resolve places, run the provider chain, emit structured
evidence (facts + calculations + notes). Google first when a key is configured,
then OSRM, then Haversine (approximate)."""
from __future__ import annotations

from app.agents import temple as _temple_agent
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


def _run_nearby(subquery: dict) -> dict:
    """travel_nearby: resolve the anchor (endpoints, entity mentions, or the
    question text - whichever actually names one of OUR temples), then answer
    'what is near X' from the verified temple dataset (nearby_places). Live
    Places search stays P4 (honest note only when we have nothing)."""
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
    if place_anchor.strip():
        place = resolve_place(place_anchor)
        evidence.append(_place_evidence("near", place))

    # Verified dataset first: nearby attractions of an OUR temple always
    # answer from the curated temple JSON (never model memory).
    nearby_evidence: list[dict] = []
    if temple_id:
        nearby_evidence = [
            item
            for item in _temple_agent._dataset_evidence([temple_id])
            if item.get("field_name") == "nearby_places"
        ]

    if nearby_evidence:
        evidence.extend(nearby_evidence)
    else:
        note = {
            "source": "travel",
            "kind": "note",
            "key": "nearby_search_unavailable",
            "error": "Nearby places search is not available in this deployment yet.",
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
