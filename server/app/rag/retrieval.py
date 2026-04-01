"""WAF context loader: inject full framework reference into every LLM call.

For small knowledge bases (< ~30 KB) we return the entire text rather than
chunking + keyword-scoring.  When the docs grow beyond MAX_FULL_INJECT_CHARS
(e.g. after ingesting the full WAF whitepapers or a Bedrock Knowledge Base
export), the chunked retrieval path activates automatically.
"""

from __future__ import annotations

import re
from pathlib import Path

from app.core.config import get_settings

MAX_FULL_INJECT_CHARS = 30_000
_CHUNK_CHARS = 1200
_MAX_CHUNKS = 10


def load_all_docs_text(base: Path | None = None) -> str:
    settings = get_settings()
    root = base or settings.docs_path
    if not root.exists():
        return ""
    texts: list[str] = []
    for pattern in ("**/*.md", "**/*.txt", "**/*.markdown"):
        for path in root.glob(pattern):
            try:
                texts.append(path.read_text(encoding="utf-8", errors="replace"))
            except OSError:
                continue
    return "\n\n".join(texts)


def retrieve_context(query: str, max_chars: int = 12000) -> str:
    """Return WAF reference text for the LLM system prompt.

    Strategy:
      - If the total docs fit inside MAX_FULL_INJECT_CHARS, inject everything.
        No keyword scoring needed for a compact knowledge base.
      - If the docs have grown (future: full whitepapers), fall back to
        chunk-and-rank so we stay within the context budget.
    """
    full = load_all_docs_text()
    if not full.strip():
        return ""

    if len(full) <= MAX_FULL_INJECT_CHARS:
        return full[:max_chars]

    # Future path: chunked retrieval for larger knowledge bases.
    chunks = _split_chunks(full)
    if not chunks:
        return full[:max_chars]

    ranked = sorted(chunks, key=lambda c: _score_chunk(query, c), reverse=True)
    out: list[str] = []
    total = 0
    for ch in ranked[:_MAX_CHUNKS]:
        if total + len(ch) > max_chars:
            break
        out.append(ch)
        total += len(ch)
    return "\n\n---\n\n".join(out) if out else full[:max_chars]


def _split_chunks(text: str) -> list[str]:
    parts = re.split(r"\n\s*\n+", text)
    chunks: list[str] = []
    buf = ""
    for p in parts:
        p = p.strip()
        if not p:
            continue
        if len(buf) + len(p) + 2 <= _CHUNK_CHARS:
            buf = f"{buf}\n\n{p}" if buf else p
        else:
            if buf:
                chunks.append(buf)
            buf = p
    if buf:
        chunks.append(buf)
    return chunks


def _score_chunk(query: str, chunk: str) -> float:
    q_terms = set(re.findall(r"[a-zA-Z]{3,}", query.lower()))
    c_terms = set(re.findall(r"[a-zA-Z]{3,}", chunk.lower()))
    if not q_terms:
        return 0.0
    return len(q_terms & c_terms) / max(1, len(q_terms))


def ingest_placeholder() -> None:
    """Reserved for future Bedrock KB sync / chunk persistence."""
    return None
