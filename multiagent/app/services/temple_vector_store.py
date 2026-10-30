from __future__ import annotations

import os
import re
from pathlib import Path

from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchAny,
    VectorParams,
)
try:  # preferred backend: sentence-transformers (torch)
    from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover - e.g. AppLocker blocks torch DLLs
    SentenceTransformer = None


PROJECT_ROOT = Path(__file__).resolve().parents[2]

QDRANT_PATH = PROJECT_ROOT / "data" / "qdrant"

COLLECTION_NAME = "temple_documents_bge_m3"

EMBEDDING_MODEL = "BAAI/bge-m3"

EMBEDDING_DIMENSION = int(
    os.environ.get("EMBEDDING_DIMENSION", "1024")
)

BATCH_SIZE = 32

RETRIEVAL_CANDIDATES = 20


CONTENT_TYPE_PRIORITY = {
    "overview": 1.00,
    "summary": 1.00,
    "religious_significance": 1.00,
    "spiritual_significance": 0.98,
    "sthala_puranam": 0.98,
    "history": 0.98,
    "faq": 0.96,
    "festivals": 0.95,
    "rituals": 0.95,
    "special_poojas": 0.95,
    "architecture": 0.90,
    "architectural_style": 0.90,
    "temple_layout": 0.88,
    "travel": 0.75,
    "travel_tips": 0.65,
    "nearby_places": 0.55,
    "nearby_infrastructure": 0.55,
    "accommodation": 0.80,
    "accessibility": 0.65,
    "healing_beliefs": 0.60,
    "miracles_and_devotee_experiences": 0.60,
    "deity": 0.85,
    "darshan_timings": 0.95,
    "timing_conflict_note": 0.95,
    "sevas": 0.85,
    "darshan_and_tickets": 0.90,
    "contact": 0.85,
    "facilities": 0.60,
    "reviews": 0.70,
    "audio": 0.85,
}


TIMING_QUERY_TERMS = {
    "timing",
    "timings",
    "time",
    "times",
    "hours",
    "opening",
    "opens",
    "open",
    "closing",
    "closes",
    "darshan",
    "visiting",
    "visit",
}

TIMING_DOCUMENT_TERMS = {
    "timing",
    "timings",
    "time",
    "times",
    "hours",
    "opening",
    "opens",
    "open",
    "closing",
    "closes",
    "darshan",
    "visiting",
    "visit",
}

ACCESS_QUERY_TERMS = {
    "reach",
    "route",
    "travel",
    "airport",
    "railway",
    "station",
    "bus",
    "distance",
    "directions",
}

FESTIVAL_QUERY_TERMS = {
    "festival",
    "festivals",
    "jathara",
    "utsavam",
    "celebration",
    "celebrations",
}

HISTORY_QUERY_TERMS = {
    "history",
    "built",
    "construction",
    "constructed",
    "inaugurated",
    "founded",
    "foundation",
    "founder",
    "founders",
}

RELIGIOUS_QUERY_TERMS = {
    "deity",
    "god",
    "goddess",
    "religious",
    "spiritual",
    "significance",
    "worship",
    "ritual",
    "rituals",
    "pooja",
    "puja",
}

FACILITY_QUERY_TERMS = {
    "facility",
    "facilities",
    "parking",
    "water",
    "shops",
    "amenities",
}


class BGEEmbeddings(Embeddings):
    """1024-dim embeddings for the temple collection.

    Backend order:
      1. sentence-transformers + BAAI/bge-m3 (torch machines, matches the
         architecture doc / paper setup);
      2. fastembed (ONNX, NO torch) + intfloat/multilingual-e5-large - same
         1024 dimensions, multilingual (en/te/hi) - so ingestion and search
         also work where torch is blocked by Application Control policies.

    The two backends never run together: this singleton picks the first one
    that is importable/usable on the machine.
    """

    FASTEMBED_MODEL = "intfloat/multilingual-e5-large"

    def __init__(self) -> None:
        self._st = None
        self._fastembed = None

        if SentenceTransformer is not None:
            try:
                self._st = SentenceTransformer(
                    EMBEDDING_MODEL,
                    device="cpu",
                )
                self._st.max_seq_length = 512
                return
            except Exception:  # noqa: BLE001
                self._st = None

        from fastembed import TextEmbedding

        self._fastembed = TextEmbedding(
            model_name=os.environ.get(
                "FASTEMBED_EMBEDDING_MODEL", self.FASTEMBED_MODEL
            ),
            # keep the ~2.2 GB ONNX model outside the repo and outside
            # tmpfs (too small) - survives repo cleans, never git-added
            cache_dir=str(Path.home() / ".cache" / "fastembed"),
            # ORT thread count: default (cpu_count) allocates big arenas
            # that can OOM small machines; override with FASTEMBED_THREADS
            threads=max(
                1,
                int(
                    __import__("os").environ.get(
                        "FASTEMBED_THREADS", "2"
                    )
                ),
            ),
        )

    @property
    def backend(self) -> str:
        if self._st is not None:
            return "sentence-transformers/bge-m3"
        return f"fastembed/{self.FASTEMBED_MODEL}"

    def _encode(
        self,
        texts: list[str],
        *,
        prefix: str = "",
    ) -> list[list[float]]:
        if self._st is not None:
            embeddings = self._st.encode(
                texts,
                batch_size=BATCH_SIZE,
                show_progress_bar=True,
                normalize_embeddings=True,
                convert_to_numpy=True,
            )
            return embeddings.tolist()

        # multilingual-e5 expects task prefixes for best quality
        return [
            vector.tolist()
            for vector in self._fastembed.embed(
                [prefix + text for text in texts]
            )
        ]

    def embed_documents(
        self,
        texts: list[str],
    ) -> list[list[float]]:
        return self._encode(texts, prefix="passage: ")

    def embed_query(
        self,
        text: str,
    ) -> list[float]:
        return self._encode([text], prefix="query: ")[0]


_embeddings: BGEEmbeddings | None = None
_qdrant_client: QdrantClient | None = None
_vector_store: QdrantVectorStore | None = None


def get_embeddings() -> BGEEmbeddings:
    """Lazy singleton - the model loads on first temple query, not at import."""
    global _embeddings
    if _embeddings is None:
        _embeddings = BGEEmbeddings()
    return _embeddings


def get_qdrant_client() -> QdrantClient:
    """Lazy singleton - embedded (path) Qdrant allows only ONE client per
    process; creating per call breaks under concurrency."""
    global _qdrant_client
    if _qdrant_client is None:
        QDRANT_PATH.mkdir(
            parents=True,
            exist_ok=True,
        )
        _qdrant_client = QdrantClient(
            path=str(QDRANT_PATH),
        )
    return _qdrant_client


def ensure_collection() -> None:
    client = get_qdrant_client()

    collections = client.get_collections().collections

    existing_names = {
        collection.name
        for collection in collections
    }

    if COLLECTION_NAME in existing_names:
        return

    client.create_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(
            size=EMBEDDING_DIMENSION,
            distance=Distance.COSINE,
        ),
    )


def get_vector_store() -> QdrantVectorStore:
    """Lazy singleton vector store sharing the singleton client + embeddings."""
    global _vector_store
    if _vector_store is None:
        ensure_collection()
        _vector_store = QdrantVectorStore(
            client=get_qdrant_client(),
            collection_name=COLLECTION_NAME,
            embedding=get_embeddings(),
        )
    return _vector_store


def _tokenize(text: str) -> set[str]:
    return {
        token.lower()
        for token in re.findall(
            r"\b[\w'-]+\b",
            text,
            flags=re.UNICODE,
        )
        if len(token) > 1
    }


def _lexical_score(
    query: str,
    document: Document,
) -> float:
    query_tokens = _tokenize(query)

    if not query_tokens:
        return 0.0

    content = document.page_content.lower()

    metadata_text = " ".join(
        [
            str(document.metadata.get("name", "")),
            str(document.metadata.get("content_type", "")),
            str(document.metadata.get("section", "")),
        ]
    ).lower()

    content_tokens = _tokenize(content)
    metadata_tokens = _tokenize(metadata_text)

    content_matches = query_tokens.intersection(
        content_tokens
    )

    metadata_matches = query_tokens.intersection(
        metadata_tokens
    )

    content_ratio = (
        len(content_matches) / len(query_tokens)
    )

    metadata_ratio = (
        len(metadata_matches) / len(query_tokens)
    )

    phrase_bonus = 0.0

    normalized_query = " ".join(
        query.lower().split()
    )

    if (
        normalized_query
        and normalized_query in content
    ):
        phrase_bonus = 0.20

    return (
        (content_ratio * 0.60)
        + (metadata_ratio * 0.20)
        + phrase_bonus
    )


def _query_focus_terms(
    query: str,
) -> set[str]:
    query_tokens = _tokenize(query)

    focus_terms: set[str] = set()

    if query_tokens.intersection(TIMING_QUERY_TERMS):
        focus_terms.update(TIMING_QUERY_TERMS)

    if query_tokens.intersection(ACCESS_QUERY_TERMS):
        focus_terms.update(ACCESS_QUERY_TERMS)

    if query_tokens.intersection(FESTIVAL_QUERY_TERMS):
        focus_terms.update(FESTIVAL_QUERY_TERMS)

    if query_tokens.intersection(HISTORY_QUERY_TERMS):
        focus_terms.update(HISTORY_QUERY_TERMS)

    if query_tokens.intersection(RELIGIOUS_QUERY_TERMS):
        focus_terms.update(RELIGIOUS_QUERY_TERMS)

    if query_tokens.intersection(FACILITY_QUERY_TERMS):
        focus_terms.update(FACILITY_QUERY_TERMS)

    return focus_terms


def _query_focus_score(
    query: str,
    document: Document,
) -> float:
    query_tokens = _tokenize(query)

    if not query_tokens:
        return 0.0

    focus_terms = _query_focus_terms(query)

    if not focus_terms:
        return 0.0

    content = document.page_content.lower()

    document_tokens = _tokenize(content)

    matched_focus_terms = (
        focus_terms.intersection(document_tokens)
    )

    if not matched_focus_terms:
        return 0.0

    score = (
        len(matched_focus_terms)
        / len(focus_terms)
    )

    content_type = str(
        document.metadata.get(
            "content_type",
            "",
        )
    ).lower()

    if query_tokens.intersection(
        TIMING_QUERY_TERMS
    ):
        timing_matches = (
            document_tokens.intersection(
                TIMING_DOCUMENT_TERMS
            )
        )

        if timing_matches:
            score += 0.35

        if content_type == "faq":
            score += 0.20

        if (
            "darshan" in query_tokens
            and "darshan" in document_tokens
        ):
            score += 0.25

        if (
            "timing" in query_tokens
            or "timings" in query_tokens
            or "hours" in query_tokens
        ):
            timing_question_phrases = (
                "temple timings",
                "darshan timings",
                "darshan time",
                "opening hours",
                "visiting hours",
                "temple hours",
                "what are the temple timings",
            )

            if any(
                phrase in content
                for phrase in timing_question_phrases
            ):
                score += 0.50

    if query_tokens.intersection(
        FESTIVAL_QUERY_TERMS
    ):
        festival_matches = (
            document_tokens.intersection(
                FESTIVAL_QUERY_TERMS
            )
        )

        if festival_matches:
            score += 0.35

        if content_type in {
            "faq",
            "festivals",
            "best_time_to_visit",
        }:
            score += 0.15

    if query_tokens.intersection(
        HISTORY_QUERY_TERMS
    ):
        history_matches = (
            document_tokens.intersection(
                HISTORY_QUERY_TERMS
            )
        )

        if history_matches:
            score += 0.35

        if content_type == "history":
            score += 0.20

    if query_tokens.intersection(
        ACCESS_QUERY_TERMS
    ):
        access_matches = (
            document_tokens.intersection(
                ACCESS_QUERY_TERMS
            )
        )

        if access_matches:
            score += 0.35

        if content_type in {
            "travel",
            "travel_tips",
            "nearby_infrastructure",
            "faq",
        }:
            score += 0.15

    return min(score, 2.0)


def _content_type_score(
    document: Document,
) -> float:
    content_type = str(
        document.metadata.get(
            "content_type",
            "",
        )
    )

    return CONTENT_TYPE_PRIORITY.get(
        content_type,
        0.70,
    )


def _rerank_results(
    query: str,
    results: list[tuple[Document, float]],
) -> list[Document]:
    scored_results: list[tuple[float, Document]] = []

    for document, vector_score in results:
        lexical_score = _lexical_score(
            query,
            document,
        )

        query_focus_score = _query_focus_score(
            query,
            document,
        )

        content_type_score = _content_type_score(
            document,
        )

        final_score = (
            (vector_score * 0.55)
            + (lexical_score * 0.20)
            + (query_focus_score * 0.20)
            + (content_type_score * 0.05)
        )

        scored_results.append(
            (
                final_score,
                document,
            )
        )

    scored_results.sort(
        key=lambda item: item[0],
        reverse=True,
    )

    return [
        document
        for _, document in scored_results
    ]


def _point_id(document: Document) -> str:
    """Deterministic point id: re-ingesting the same content upserts the
    same point instead of creating duplicates."""
    import hashlib

    meta = document.metadata or {}
    basis = "|".join(
        [
            str(meta.get("temple_id") or ""),
            str(meta.get("field_name") or ""),
            str(meta.get("section") or ""),
            str(meta.get("chunk_index") or ""),
            document.page_content,
        ]
    )
    return hashlib.sha1(basis.encode("utf-8")).hexdigest()


def ingest_documents(
    documents: list[Document],
) -> int:
    """Full-ingest semantics: RECREATE the collection first so re-runs
    never duplicate points (a double-run previously left two copies of
    every chunk in the store), then upsert with deterministic ids."""
    if not documents:
        return 0

    client = get_qdrant_client()
    ensure_collection()
    if client.collection_exists(COLLECTION_NAME):
        client.delete_collection(COLLECTION_NAME)
    ensure_collection()

    # rebuild the cached vector store wrapper after recreation
    global _vector_store
    _vector_store = None

    vector_store = get_vector_store()

    vector_store.add_documents(
        documents,
        ids=[_point_id(document) for document in documents],
    )

    return len(documents)


def _build_temple_filter(
    temple_ids: list[str] | None,
) -> Filter | None:
    if not temple_ids:
        return None

    normalized_ids = sorted(
        {
            str(temple_id).strip()
            for temple_id in temple_ids
            if str(temple_id).strip()
        }
    )

    if not normalized_ids:
        return None

    return Filter(
        must=[
            FieldCondition(
                key="metadata.temple_id",
                match=MatchAny(
                    any=normalized_ids,
                ),
            )
        ]
    )


def similarity_search(
    query: str,
    *,
    k: int = 5,
    temple_ids: list[str] | None = None,
) -> list[Document]:
    vector_store = get_vector_store()

    query_filter = _build_temple_filter(
        temple_ids
    )

    candidates = (
        vector_store.similarity_search_with_score(
            query,
            k=max(
                k,
                RETRIEVAL_CANDIDATES,
            ),
            filter=query_filter,
        )
    )

    reranked = _rerank_results(
        query,
        candidates,
    )

    return reranked[:k]