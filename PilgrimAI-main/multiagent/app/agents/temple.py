"""Temple agent - RAG over the Qdrant collection. Heavy imports stay lazy so
the API boots (and tests run) without loading sentence-transformers.

When the vector store is unavailable (fresh machine, blocked torch, ingest
not run yet), the agent falls back to a deterministic keyword read of the
verified temple JSON files so named-temple questions still answer from
curated data instead of failing.
"""
from __future__ import annotations

import re

import json
import logging
import math
from pathlib import Path
from typing import Any

_TEMPLE_DIR = Path(__file__).resolve().parents[2] / "data" / "temples"

# Default fields turned into evidence chunks by the dataset fallback, in
# priority order (visitor essentials first). Used when there is no question
# or no keyword match.
_FALLBACK_FIELDS: list[tuple[str, str]] = [
    ("summary", "Summary"),
    ("overview", "Overview"),
    ("darshan_timings", "Darshan timings"),
    ("darshan_and_tickets", "Entry and tickets"),
    ("dress_code", "Dress code"),
    ("travel", "How to reach"),
    ("nearby_places", "Nearby attractions"),
    ("nearby_infrastructure", "Nearby infrastructure"),
    ("faq", "FAQ"),
]

# Keyword -> section routing: a naive question ("near by places",
# "seva list", "hotels near it") pulls exactly the JSON sections it asks
# about, so every part of the dataset stays reachable without embeddings.
_KEYWORD_FIELDS: list[tuple[tuple[str, ...], tuple[str, str]]] = [
    (("timing", "timings", "hour", "open", "close", "darshan", "schedule"),
     ("darshan_timings", "Darshan timings")),
    (("ticket", "fee", "price", "entry", "cost"),
     ("darshan_and_tickets", "Entry and tickets")),
    (("dress", "wear", "allowed clothes"),
     ("dress_code", "Dress code")),
    (("seva", "sevas", "pooja", "abhishek", "homam", "ritual", "aarti",
      "arti", "suprabhata"),
     ("sevas", "Sevas and poojas")),
    (("ritual", "aarti", "arti", "suprabhata", "naivedyam"),
     ("rituals", "Rituals")),
    (("festival", "utsav", "brahmotsavam"),
     ("festivals", "Festivals")),
    (("review", "reviews", "rating", "rated", "theme", "feedback"),
     ("reviews", "Reviews and ratings")),
    (("history", "historical", "built", "construction", "who built",
      "established", "founded", "origin"),
     ("history", "History")),
    (("deity", "god", "goddess", "lord", "presiding", "worship",
      "dedicated to", "venkateswara", "balaji"),
     ("deity", "Deity")),
    (("architecture", "architectural", "marble", "carving", "idol",
      "sculpture", "style of"),
     ("architecture", "Architecture")),
    (("legend", "puranam", "mythology", "story of", "why is this"),
     ("sthala_puranam", "Legend")),
    (("miracle", "miracles", "experience", "experiences", "devotee",
      "devotees said", "testimonial"),
     ("miracles_and_devotee_experiences", "Miracles and devotee experiences")),
    (("healing", "belief", "beliefs", "cure", "wish fulfilled"),
     ("healing_beliefs", "Healing beliefs")),
    (("significance", "why important", "pilgrimage merit", "importance"),
     ("religious_significance", "Religious significance")),
    (("meditation", "spiritual", "inner peace"),
     ("spiritual_significance", "Spiritual significance")),
    (("layout", "inside the temple", "sanctum", "floor plan", "complex plan"),
     ("temple_layout", "Temple layout")),
    (("special pooja", "special poojas", "ekadasi pooja"),
     ("special_poojas", "Special poojas")),
    (("nearby", "near by", "around", "tourist", "attraction",
      "sightsee", "places to see", "places near"),
     ("nearby_places", "Nearby attractions")),
    (("infrastructure", "hospital", "atm", "petrol", "police",
      "parking", "restaurants near", "food near"),
     ("nearby_infrastructure", "Nearby infrastructure")),
    (("hotel", "stay", "room", "lodg", "accommodation"),
     ("accommodation", "Where to stay")),
    (("facilit", "washroom", "restroom", "wheelchair", "drinking water",
      "locker"),
     ("facilities", "Facilities")),
    (("reach", "route", "bus", "train", "metro", "direction", "transport",
      "how to go"),
     ("travel", "How to reach")),
    (("tip", "crowd", "queue", "avoid"),
     ("travel_tips", "Travel tips")),
    (("best time", "when to visit", "season"),
     ("best_time_to_visit", "Best time to visit")),
    (("contact", "phone", "call", "number"),
     ("contact", "Contact")),
    (("accessib", "senior", "disabl", "elderly"),
     ("accessibility", "Accessibility")),
    (("faq", "frequently", "question"),
     ("faq", "FAQ")),
]

_CORE_FIELDS: list[tuple[str, str]] = [
    ("summary", "Summary"),
    ("overview", "Overview"),
]


def _select_fallback_fields(question: str | None) -> list[tuple[str, str]]:
    """Pick JSON sections for the question; core (summary/overview) always,
    plus every keyword-matched section, in priority order. No match (or no
    question) -> the default visitor-essentials list."""
    if not question:
        return _FALLBACK_FIELDS
    lowered = question.lower()
    matched: list[tuple[str, str]] = []
    for keywords, field_label in _KEYWORD_FIELDS:
        if any(keyword in lowered for keyword in keywords):
            if field_label not in matched:
                matched.append(field_label)
    if not matched:
        return _FALLBACK_FIELDS
    selected: list[tuple[str, str]] = list(_CORE_FIELDS)
    for field_label in matched:
        if field_label not in selected:
            selected.append(field_label)
    return selected[:10]


_URL_IN_TEXT_RE = re.compile(r"https?://[^\s<>\"'\])}]+")
_URL_TRAIL_RE = re.compile(r"[.,;:!?'’”]+$")


def _first_source_url(sources: object) -> str | None:
    """First usable URL from the temple record's sources list (R01).

    v15 (audit R01): real source strings are messy —
    "Wikipedia: https://en.wikipedia.org/wiki/X (accessed …)" or
    {"url": "…"} — so embedded URLs are extracted and trailing
    punctuation/annotations stripped instead of requiring the whole
    string to start with http."""
    candidates: list[str] = []
    if isinstance(sources, list):
        items: list[object] = list(sources)
    elif sources is None:
        items = []
    else:
        items = [sources]
    for item in items:
        if isinstance(item, dict):
            for key in ("url", "link", "href", "source_url"):
                value = item.get(key)
                if isinstance(value, str) and value.strip():
                    candidates.append(value.strip())
            for key in ("name", "title", "reference"):
                value = item.get(key)
                if isinstance(value, str):
                    candidates.append(value)
        elif isinstance(item, str):
            candidates.append(item)
    for text in candidates:
        if text.startswith("http"):
            return _URL_TRAIL_RE.sub("", text)
        match = _URL_IN_TEXT_RE.search(text)
        if match:
            return _URL_TRAIL_RE.sub("", match.group(0))
    return None


def _document_to_evidence(document: Any) -> dict:
    metadata = dict(document.metadata)
    return {
        "source": "temple_rag",
        "kind": "chunk",
        "text": document.page_content,
        "temple_id": metadata.get("temple_id"),
        "name": metadata.get("name"),
        "content_type": metadata.get("content_type"),
        "field_name": metadata.get("field_name"),
        "section": metadata.get("section"),
        "chunk_index": metadata.get("chunk_index"),
        "source_tier": metadata.get("source_tier"),
        # R01: currency of the claim travels WITH the evidence
        "last_verified": metadata.get("last_verified"),
        "source_url": _first_source_url(metadata.get("sources")),
    }


def _dataset_evidence(
    temple_ids: list[str] | None,
    question: str | None = None,
) -> list[dict]:
    """Deterministic fallback: read the verified temple JSON files directly
    (no model, no vector store). Sections are keyword-routed from the
    question so every dataset section (sevas, festivals, infrastructure,
    ...) is reachable; without a question, the default essentials."""
    evidence: list[dict] = []
    for temple_id in sorted(temple_ids or []):
        path = _TEMPLE_DIR / f"{temple_id}.json"
        if not path.is_file():
            continue
        try:
            temple = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        name = str(temple.get("name") or temple_id)
        for field, label in _select_fallback_fields(question):
            value = temple.get(field)
            if not value:
                continue
            text = f"{name} — {label}: " + json.dumps(
                value, ensure_ascii=False
            )
            evidence.append(
                {
                    "source": "temple_dataset",
                    "kind": "chunk",
                    "text": text,
                    "temple_id": temple.get("temple_id", temple_id),
                    "name": name,
                    "field_name": field,
                    "section": label,
                    "source_tier": "internal_dataset",
                    # v15 (audit R01): fallback path keeps the same
                    # citation contract as the vector path
                    "last_verified": temple.get("last_verified"),
                    "source_url": _first_source_url(temple.get("sources")),
                }
            )
    return evidence[:12]


def _dedupe(evidence: list[dict]) -> list[dict]:
    """Drop identical chunks (duplicate points in the store, RAG + dataset
    overlap) so the composer sees each fact exactly once."""
    seen: set[tuple] = set()
    unique: list[dict] = []
    for item in evidence:
        key = (
            item.get("source"),
            item.get("field_name"),
            item.get("section"),
            str(item.get("text") or item.get("name") or ""),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


_GEO_INDEX: list[dict] | None = None
logger = logging.getLogger(__name__)


def _haversine_km(
    a_lat: float, a_lng: float, b_lat: float, b_lng: float
) -> float:
    """Straight-line km (discovery pre-rank before OSRM road lookup)."""
    r = 6371.0
    p1, p2 = math.radians(a_lat), math.radians(b_lat)
    dp = math.radians(b_lat - a_lat)
    dl = math.radians(b_lng - a_lng)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return round(2 * r * math.asin(math.sqrt(h)), 2)


def _temple_geo_index() -> list[dict]:
    """Lightweight coordinates index over data/temples/T*.json (23 files).
    Cached per process; rebuilt if files change is needed -> restart."""
    global _GEO_INDEX
    if _GEO_INDEX is not None:
        return _GEO_INDEX
    entries: list[dict] = []
    for path in sorted(_TEMPLE_DIR.glob("T*.json")):
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001 - skip broken file
            continue
        location = record.get("location") or {}
        try:
            lat = float(location.get("latitude"))
            lng = float(location.get("longitude"))
        except (TypeError, ValueError):
            continue
        entries.append(
            {
                "temple_id": str(
                    record.get("temple_id") or record.get("id") or ""
                ).strip(),
                "name": str(
                    record.get("temple_name")
                    or record.get("name")
                    or path.stem
                ).strip(),
                "district": str(location.get("district") or "").strip(),
                "lat": lat,
                "lng": lng,
            }
        )
    _GEO_INDEX = [e for e in entries if e["temple_id"]]
    return _GEO_INDEX


def _fact_value(result: Any, key: str) -> float | None:
    for fact in getattr(result, "facts", None) or []:
        if getattr(fact, "key", None) == key:
            try:
                return float(getattr(fact, "value", None))
            except (TypeError, ValueError):
                return None
    return None


def discover(
    origin: str,
    question: str = "",
    *,
    limit: int = 6,
    radius_km: float = 150.0,
) -> dict:
    """v17 — temple_discover capability: WHICH temples are nearest a place,
    using OUR registry coordinates (23 temples) + OSRM road routes with an
    honest straight-line fallback. No LLM memory, no hardcoded distances."""
    base_status: dict = {"question": question}

    if not str(origin or "").strip():
        return {
            **base_status,
            "status": "NEEDS_CLARIFICATION",
            "query": "Which city or area are you starting from?",
            "evidence": [],
        }

    from app.travel.resolver import resolve_place
    from app.travel.providers.route_chain import route_with_fallbacks
    from app.travel.schemas import Coordinate

    try:
        place = resolve_place(origin)
    except Exception as exc:  # noqa: BLE001 - resolver/provider failure
        return {
            **base_status,
            "status": "ERROR",
            "error": f"origin_unresolvable: {type(exc).__name__}: {exc}"[:160],
            "evidence": [],
        }
    if place is None or place.coordinates is None:
        return {
            **base_status,
            "status": "ERROR",
            "error": "origin_unresolvable: no coordinates",
            "evidence": [],
        }

    origin_coord = Coordinate(
        latitude=place.coordinates.latitude,
        longitude=place.coordinates.longitude,
    )
    ranked: list[tuple[float, dict]] = []
    for entry in _temple_geo_index():
        straight = _haversine_km(
            origin_coord.latitude,
            origin_coord.longitude,
            entry["lat"],
            entry["lng"],
        )
        if straight <= radius_km:
            ranked.append((straight, entry))
    ranked.sort(key=lambda pair: pair[0])

    evidence: list[dict] = [
        {
            "source": "place_resolution",
            "kind": "place",
            "role": "origin",
            "name": place.display_name,
            "latitude": origin_coord.latitude,
            "longitude": origin_coord.longitude,
            "resolved_via": place.source,
        }
    ]

    road_used = 0
    for straight, entry in ranked[:limit]:
        road_km: float | None = None
        road_min: float | None = None
        road_source = "straight_line"
        try:
            route = route_with_fallbacks(
                origin_coord,
                Coordinate(latitude=entry["lat"], longitude=entry["lng"]),
                mode="driving",
            )
            road_km = _fact_value(route, "distance")
            road_min = _fact_value(route, "duration")
            provider = (route.metadata or {}).get("selected_provider")
            if provider == "osrm" and road_km is not None:
                road_source = "road_osrm"
                road_used += 1
        except Exception as exc:  # noqa: BLE001 - honest fallback
            logger.warning("discovery route failed for %s: %s", entry["temple_id"], exc)
        evidence.append(
            {
                "source": "temple_registry",
                "kind": "temple_candidate",
                "source_tier": "temple-dataset",
                "temple_id": entry["temple_id"],
                "name": entry["name"],
                "district": entry["district"] or None,
                "straight_km": straight,
                "road_km": road_km,
                "road_minutes": road_min,
                "distance_source": road_source,
                "error": None,
            }
        )

    if not evidence[1:]:
        evidence.append(
            {
                "source": "temple_registry",
                "kind": "note",
                "key": "discovery_empty",
                "error": (
                    f"No registry temples within {radius_km:g} km of "
                    f"{place.display_name}. Our verified registry covers "
                    f"{len(_temple_geo_index())} temples in Telangana."
                ),
                "hint": None,
            }
        )
        return {**base_status, "status": "COMPLETED", "evidence": evidence}

    evidence.append(
        {
            "source": "temple_registry",
            "kind": "note",
            "key": "discovery_method",
            "error": (
                f"Ranked from our {len(_temple_geo_index())}-temple registry. "
                + (
                    "Distances are road distances (OSRM)."
                    if road_used
                    else "Road routing was unavailable — distances shown "
                    "are straight-line estimates."
                )
            ),
            "hint": None,
        }
    )
    return {**base_status, "status": "COMPLETED", "evidence": evidence[: limit + 3]}


def run(question: str, temple_ids: list[str] | None = None) -> dict:
    """Retrieve top-5 reranked chunks, filtered to resolved temple ids.
    Falls back to the verified dataset files when retrieval is unavailable
    or returns nothing (answer always from curated data)."""
    retrieval_error: str | None = None
    evidence: list[dict] = []

    try:
        from app.services.temple_vector_store import similarity_search
    except Exception as exc:  # pragma: no cover - environment issue
        retrieval_error = f"temple retrieval unavailable: {type(exc).__name__}: {exc}"
    else:
        try:
            documents = similarity_search(
                question,
                k=5,
                temple_ids=sorted(temple_ids) if temple_ids else None,
            )
            evidence = [_document_to_evidence(doc) for doc in documents]

            # hard filter: never return another temple's chunks when ids
            # were resolved
            if temple_ids:
                expected = set(temple_ids)
                evidence = [
                    e for e in evidence if e.get("temple_id") in expected
                ]
        except Exception as exc:  # noqa: BLE001
            retrieval_error = f"temple retrieval failed: {type(exc).__name__}: {exc}"

    # Section-completeness guard: RAG top-k can drop a section the question
    # clearly asks for (e.g. "contact"); fill explicitly-requested sections
    # straight from the verified dataset so keyword-clear answers are
    # deterministic.
    if evidence:
        matched = _select_fallback_fields(question)
        if matched is not _FALLBACK_FIELDS:
            present = {item.get("field_name") for item in evidence}
            missing_fields = [
                field
                for field, _label in matched
                if field not in present
            ]
            if missing_fields and temple_ids:
                # explicitly-matched sections FIRST (contact/reviews/...),
                # core summary/overview only if budget remains
                core_names = {field for field, _ in _CORE_FIELDS}
                missing_fields.sort(key=lambda f: f in core_names)
                by_field = {
                    chunk.get("field_name"): chunk
                    for chunk in _dataset_evidence(
                        temple_ids,
                        question=question,
                    )
                }
                fills = [
                    by_field[field]
                    for field in missing_fields
                    if field in by_field
                ][:3]
                evidence = evidence + fills

    if not evidence:
        evidence = _dataset_evidence(temple_ids, question=question)
        if evidence:
            return {"status": "COMPLETED", "evidence": _dedupe(evidence)}
        return {
            "status": "ERROR",
            "error": retrieval_error or "no temple data matched the query",
            "evidence": [],
        }

    return {"status": "COMPLETED", "evidence": _dedupe(evidence)}
