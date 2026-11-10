from __future__ import annotations

from typing import Any

from app.core.config import settings
from app.services.entity_registry import get_entity_registry
from app.travel.geography import get_geography_registry
from app.travel.providers.nominatim import (
    resolve as nominatim_resolve,
    search as nominatim_search,
)
from app.travel.schemas import (
    Coordinate,
    PlaceCandidate,
    ResolvedPlace,
)


class TravelResolverError(RuntimeError):
    """Raised when a travel place cannot be resolved safely."""


class TravelResolverClarificationError(TravelResolverError):
    """Raised when a travel place has multiple plausible candidates."""

    def __init__(
        self,
        query: str,
        candidates: list[PlaceCandidate],
    ) -> None:
        self.query = query
        self.candidates = candidates

        super().__init__(
            f"Ambiguous travel place: {query}"
        )


def _extract_entity_id(value: Any) -> str | None:
    if isinstance(value, str):
        value = value.strip()
        return value or None

    if not isinstance(value, dict):
        return None

    for key in (
        "entity_id",
        "entityId",
        "canonical_entity_id",
        "canonicalEntityId",
        "temple_id",
        "templeId",
        "hotel_id",
        "hotelId",
        "restaurant_id",
        "restaurantId",
    ):
        candidate = value.get(key)

        if candidate is None:
            continue

        candidate = str(candidate).strip()

        if candidate:
            return candidate

    return None


def _coordinates_from_location(
    location: Any,
) -> Coordinate | None:
    if not isinstance(location, dict):
        return None

    latitude = location.get("latitude")
    longitude = location.get("longitude")

    if latitude is None or longitude is None:
        return None

    try:
        latitude = float(latitude)
        longitude = float(longitude)
    except (TypeError, ValueError):
        return None

    if not -90 <= latitude <= 90:
        return None

    if not -180 <= longitude <= 180:
        return None

    return Coordinate(
        latitude=latitude,
        longitude=longitude,
    )


def _resolve_from_entity_registry(
    value: Any,
) -> ResolvedPlace | None:
    entity_id = _extract_entity_id(value)

    if not entity_id:
        return None

    registry = get_entity_registry()
    entity = registry.get(entity_id)

    if not entity:
        return None

    coordinates = _coordinates_from_location(
        entity.get("location")
    )

    if coordinates is None:
        return None

    canonical_name = str(
        entity.get(
            "canonical_name",
            entity_id,
        )
    )

    return ResolvedPlace(
        query=canonical_name,
        display_name=canonical_name,
        coordinates=coordinates,
        source="entity_registry",
        canonical_entity_id=str(
            entity.get(
                "entity_id",
                entity_id,
            )
        ),
        canonical_entity_type=entity.get(
            "entity_type"
        ),
        confidence=1.0,
    )


def _resolve_named_entity(
    query: str,
) -> ResolvedPlace | None:
    registry = get_entity_registry()

    result = registry.resolve(
        mention=query
    )

    if result.get("status") == "AMBIGUOUS":
        # Multiple OUR-data matches: clarify with registry names (always
        # Telangana-scoped) instead of falling through to the world geocoder.
        candidates: list[PlaceCandidate] = []
        for item in result.get("candidates") or []:
            if not isinstance(item, dict):
                continue
            entity = registry.get(item.get("entity_id"))
            coordinates = _coordinates_from_location(
                (entity or {}).get("location")
            )
            if coordinates is None:
                continue
            candidates.append(
                PlaceCandidate(
                    display_name=str(
                        item.get("canonical_name") or query
                    ),
                    latitude=coordinates.latitude,
                    longitude=coordinates.longitude,
                    source="entity_registry",
                    place_type=item.get("entity_type"),
                    importance=1.0,
                )
            )

        if len(candidates) >= 2:
            raise TravelResolverClarificationError(
                query=query,
                candidates=candidates,
            )
        if len(candidates) == 1:
            only = candidates[0]
            return ResolvedPlace(
                query=query,
                display_name=only.display_name,
                coordinates=Coordinate(
                    latitude=only.latitude,
                    longitude=only.longitude,
                ),
                source="entity_registry",
                canonical_entity_id=str(
                    (result.get("candidates") or [{}])[0].get("entity_id", "")
                ),
                canonical_entity_type=only.place_type,
                confidence=1.0,
            )

    if result.get("status") != "RESOLVED":
        return None

    entity = result.get("entity")

    if not isinstance(entity, dict):
        return None

    coordinates = _coordinates_from_location(
        entity.get("location")
    )

    if coordinates is None:
        return None

    canonical_name = str(
        entity.get(
            "canonical_name",
            query,
        )
    )

    return ResolvedPlace(
        query=query,
        display_name=canonical_name,
        coordinates=coordinates,
        source="entity_registry",
        canonical_entity_id=entity.get(
            "entity_id"
        ),
        canonical_entity_type=entity.get(
            "entity_type"
        ),
        confidence=1.0,
    )


def _resolve_from_geography_registry(
    query: str,
) -> ResolvedPlace | None:
    registry = get_geography_registry()

    place = registry.resolve(query)

    if place is None:
        return None

    coordinates = _coordinates_from_location(
        place.get("location")
    )

    if coordinates is None:
        return None

    canonical_name = str(
        place.get(
            "canonical_name",
            query,
        )
    )

    # v23.2: carry the registry's own administrative context so callers can
    # report "Hyderabad, Telangana" instead of a bare city name.
    location = place.get("location") or {}

    return ResolvedPlace(
        query=query,
        display_name=canonical_name,
        coordinates=coordinates,
        source="geography_registry",
        canonical_entity_id=str(
            place.get("place_id")
        ),
        canonical_entity_type=str(
            place.get(
                "place_type",
                "place",
            )
        ),
        confidence=1.0,
        state=location.get("state"),
        country=location.get("country"),
        country_code="in" if str(location.get("country", "")).lower() == "india" else None,
    )


def _parse_bbox(value: str) -> tuple[float, float, float, float] | None:
    try:
        min_lat, min_lon, max_lat, max_lon = (float(p) for p in value.split(","))
    except (AttributeError, TypeError, ValueError):
        return None
    return min_lat, min_lon, max_lat, max_lon


def _in_bbox(candidate: PlaceCandidate, bbox: tuple[float, float, float, float]) -> bool:
    min_lat, min_lon, max_lat, max_lon = bbox
    return (
        min_lat <= candidate.latitude <= max_lat
        and min_lon <= candidate.longitude <= max_lon
    )


def _within_geo_scope(
    candidates: list[PlaceCandidate],
    scope: str = "destination",
) -> list[PlaceCandidate]:
    """Filter live-geocoder hits by geography.

    v23.2: destinations keep the Telangana catalogue scope (configurable via
    GEO_SCOPE_BBOX / GEO_SCOPE_ENABLED). Origins are nationwide - they are
    filtered by the India bounding box only, because the temple catalogue
    constrains *destinations*, not where a pilgrim starts from.

    Filtering origins by the Telangana box is what used to make "Mumbai"
    ambiguous and "Shirdi" resolve to a Khammam hamlet.
    """
    if not candidates:
        return []

    if scope == "origin":
        bbox = _parse_bbox(settings.origin_bbox)
        if bbox is None:
            return candidates
        country = (settings.origin_country_code or "").lower()
        scoped = [c for c in candidates if _in_bbox(c, bbox)]
        if country:
            # Prefer hits the geocoder explicitly placed in the target
            # country; keep unlabelled hits so a provider that omits
            # address details does not empty the list.
            labelled = [
                c for c in scoped if (c.country_code or "").lower() == country
            ]
            foreign = [
                c
                for c in scoped
                if c.country_code and (c.country_code or "").lower() != country
            ]
            scoped = labelled or [c for c in scoped if c not in foreign]
        return scoped

    if not settings.geo_scope_enabled:
        return candidates
    bbox = _parse_bbox(settings.geo_scope_bbox)
    if bbox is None:
        return candidates
    return [c for c in candidates if _in_bbox(c, bbox)]


SETTLEMENT_TYPES = {
    "city",
    "town",
    "village",
    "municipality",
    "administrative",
    "locality",
    "suburb",
    "hamlet",
    "isolated_dwelling",
}

# Terms that mean "this is a settlement, not a landmark/amenity".
_ADMIN_TYPES = {"administrative", "city", "town", "municipality", "village"}


def _state_of(candidate: PlaceCandidate) -> str | None:
    return candidate.state


def _rank_origin(candidate: PlaceCandidate) -> tuple:
    """Prefer real settlements, then geocoder confidence."""
    is_admin = candidate.place_type in _ADMIN_TYPES
    is_settlement = candidate.place_type in SETTLEMENT_TYPES
    return (
        0 if is_admin else (1 if is_settlement else 2),
        -(candidate.importance or 0.0),
    )


def _query_state_hint(query: str) -> str | None:
    """Return the trailing administrative hint in 'Shirdi, Maharashtra'."""
    if "," not in query:
        return None
    tail = query.rsplit(",", 1)[1].strip()
    return tail or None


def resolve_origin_place(query: str) -> ResolvedPlace:
    """Resolve a nationwide starting city.

    Rules, in order:
      * query is confined to the configured origin country;
      * results are filtered by the India bounding box, not the Telangana
        catalogue box;
      * an explicit state in the query ("Shirdi, Maharashtra") narrows the
        candidates to that state;
      * the winner must be a settlement, not a random amenity;
      * two equally plausible settlements in different states raise a
        clarification error that names the states instead of silently
        picking one.
    """
    country = settings.origin_country or "India"
    country_code = (settings.origin_country_code or "").lower() or None

    cleaned = query.strip().strip(",").strip()
    if not cleaned:
        raise TravelResolverError("Starting location cannot be empty.")

    hinted_state = _query_state_hint(cleaned)
    searches: list[str] = []
    if settings.origin_append_country:
        if hinted_state and hinted_state.lower() in {
            "india",
            str(country).lower(),
        }:
            searches.append(cleaned)
        else:
            searches.append(f"{cleaned}, {country}")
    searches.append(cleaned)
    searches = list(dict.fromkeys(searches))

    collected: list[PlaceCandidate] = []
    for text in searches:
        try:
            hits = nominatim_search(
                text,
                limit=8,
                timeout_seconds=8,
                country_code=country_code,
                use_service_viewbox=False,
            )
        except Exception:  # provider down -> try the next form
            continue
        collected = _within_geo_scope(hits, scope="origin")
        if collected:
            break

    if not collected:
        raise TravelResolverError(
            f"'{query}' could not be found in {country}. "
            "Enter an Indian city or district name, for example "
            "'Nizamabad' or 'Pune, Maharashtra'."
        )

    # Drop landmarks/amenities when at least one settlement was returned.
    settlements = [c for c in collected if c.place_type in SETTLEMENT_TYPES]
    pool = settlements or collected

    # Honour an explicit ", <state>" hint in the query.
    if hinted_state:
        hint = hinted_state.lower()
        narrowed = [
            c
            for c in pool
            if (c.state or "").lower() == hint
            or (c.district or "").lower() == hint
            or (c.display_name or "").lower().find(hint) >= 0
        ]
        if narrowed:
            pool = narrowed

    pool = sorted(pool, key=_rank_origin)
    top = pool[0]
    top_state = (_state_of(top) or "").lower()

    # Ambiguity: another equally plausible settlement in a different state.
    rivals = [
        c
        for c in pool[1:]
        if c.place_type in _ADMIN_TYPES
        and (_state_of(c) or "").lower() != top_state
        and abs((c.importance or 0.0) - (top.importance or 0.0)) < 0.02
    ]
    if rivals:
        raise TravelResolverClarificationError(
            query=query,
            candidates=[top] + rivals[:4],
        )

    return ResolvedPlace(
        query=query,
        display_name=top.display_name,
        coordinates=Coordinate(
            latitude=top.latitude,
            longitude=top.longitude,
        ),
        source="nominatim_origin",
        confidence=top.importance,
        state=top.state,
        country=top.country,
        country_code=top.country_code,
    )


def resolve_place(
    value: Any,
    scope: str = "destination",
) -> ResolvedPlace:
    """
    Deterministic resolution order:

    1. Canonical entity ID -> Entity Registry.
    2. Named canonical entity -> Entity Registry.
    3. Known geographic place -> Geography Registry.
    4. Unknown/free text -> Nominatim.

    `scope="origin"` resolves nationwide (see resolve_origin_place);
    `scope="destination"` keeps the catalogue's service-area filter.
    """

    entity_result = _resolve_from_entity_registry(
        value
    )

    if entity_result is not None:
        return entity_result

    if isinstance(value, dict):
        query = (
            value.get("query")
            or value.get("name")
        )

        if not isinstance(query, str):
            raise TravelResolverError(
                "Travel place dictionary must contain "
                "'query' or 'name'."
            )

        query = query.strip()

    elif isinstance(value, str):
        query = value.strip()

    else:
        raise TravelResolverError(
            "Travel place must be a string or dictionary."
        )

    if not query:
        raise TravelResolverError(
            "Travel place cannot be empty."
        )

    named_entity = _resolve_named_entity(
        query
    )

    if named_entity is not None:
        return named_entity

    geographic_place = _resolve_from_geography_registry(
        query
    )

    if geographic_place is not None:
        return geographic_place

    if scope == "origin":
        return resolve_origin_place(query)

    raw_candidates = nominatim_search(
        query,
        limit=5,
    )
    candidates = _within_geo_scope(raw_candidates, scope="destination")

    if not candidates:
        # Distinguish "no geocoder hit" from "hits exist but all outside
        # the catalogue service area" - never offer out-of-scope places.
        if raw_candidates:
            raise TravelResolverError(
                f"'{query}' matches places only outside the Telangana "
                "temple catalogue area; PilgrimAI's destinations are in "
                "Telangana. You can still start your journey from anywhere "
                "in India."
            )
        raise TravelResolverError(
            f"Unable to resolve travel place: {query}"
        )

    if len(candidates) > 1:
        top = candidates[0]
        second = candidates[1]

        if (
            top.importance is not None
            and second.importance is not None
            and abs(
                top.importance - second.importance
            ) < 0.05
        ):
            raise TravelResolverClarificationError(
                query=query,
                candidates=candidates,
            )

    top = candidates[0]

    return ResolvedPlace(
        query=query,
        display_name=top.display_name,
        coordinates=Coordinate(
            latitude=top.latitude,
            longitude=top.longitude,
        ),
        source="nominatim",
        confidence=top.importance,
    )