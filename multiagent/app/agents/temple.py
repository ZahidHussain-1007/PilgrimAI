"""Temple agent - RAG over the Qdrant collection. Heavy imports stay lazy so
the API boots (and tests run) without loading sentence-transformers.

When the vector store is unavailable (fresh machine, blocked torch, ingest
not run yet), the agent falls back to a deterministic keyword read of the
verified temple JSON files so named-temple questions still answer from
curated data instead of failing.
"""
from __future__ import annotations

import json
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
                }
            )
    return evidence[:12]


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
            return {"status": "COMPLETED", "evidence": evidence}
        return {
            "status": "ERROR",
            "error": retrieval_error or "no temple data matched the query",
            "evidence": [],
        }

    return {"status": "COMPLETED", "evidence": evidence}
