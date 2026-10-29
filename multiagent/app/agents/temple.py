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

# Fields turned into evidence chunks by the dataset fallback, in priority
# order (visitor essentials first).
_FALLBACK_FIELDS: list[tuple[str, str]] = [
    ("summary", "Summary"),
    ("overview", "Overview"),
    ("darshan_timings", "Darshan timings"),
    ("darshan_and_tickets", "Entry and tickets"),
    ("dress_code", "Dress code"),
    ("travel", "How to reach"),
    ("nearby_places", "Nearby attractions"),
    ("faq", "FAQ"),
]


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


def _dataset_evidence(temple_ids: list[str] | None) -> list[dict]:
    """Deterministic fallback: read the verified temple JSON files directly
    (no model, no vector store)."""
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
        for field, label in _FALLBACK_FIELDS:
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
    return evidence[:8]


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

    if not evidence:
        evidence = _dataset_evidence(temple_ids)
        if evidence:
            return {"status": "COMPLETED", "evidence": evidence}
        return {
            "status": "ERROR",
            "error": retrieval_error or "no temple data matched the query",
            "evidence": [],
        }

    return {"status": "COMPLETED", "evidence": evidence}
