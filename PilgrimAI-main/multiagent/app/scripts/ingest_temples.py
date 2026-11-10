from app.services.temple_document_loader import (
    load_all_temple_documents,
)
from app.services.temple_text_splitter import (
    split_temple_documents,
)
from app.services.temple_vector_store import (
    ingest_documents,
)


def main() -> None:
    print("Loading temple documents...")

    documents = load_all_temple_documents()

    print(f"Semantic documents: {len(documents)}")

    print("Splitting documents...")

    chunks = split_temple_documents(documents)

    print(f"Chunks: {len(chunks)}")

    print("Embedding and indexing into Qdrant...")

    try:
        count = ingest_documents(chunks)
    except RuntimeError as exc:
        if "already accessed" in str(exc).lower() or "Qdrant" in str(exc):
            # local Qdrant allows ONE process: the running uvicorn server
            # holds the lock. Stop it, ingest, then start it again.
            raise SystemExit(
                "\nThe local vector store is in use by another process - "
                "almost always the running uvicorn server.\n\n"
                "  1) Stop uvicorn (Ctrl+C in its terminal)\n"
                "  2) Re-run:  python -m app.scripts.ingest_temples\n"
                "  3) Start it again:  python -m uvicorn app.main:app "
                "--host 127.0.0.1 --port 8000\n"
                "\n(The store keeps exactly one copy of every chunk: "
                "re-running is always safe.)"
            )
        raise

    print(f"Indexed: {count}")


if __name__ == "__main__":
    main()