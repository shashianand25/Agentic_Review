"""Optional: extend with S3/Bedrock Knowledge Base sync."""

from app.rag.retrieval import load_all_docs_text


def preview_docs_chars(limit: int = 2000) -> str:
    t = load_all_docs_text()
    return t[:limit]
