"""Gemini 1.5 Pro Vision for architecture diagram OCR and component extraction."""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def analyze_diagram(image_path: Path) -> tuple[dict[str, Any], str | None]:
    """
    Returns structured dict: { "components": [...], "notes": "..." }
    and optional error string.
    """
    settings = get_settings()
    if not settings.gemini_api_key:
        return _heuristic_fallback(image_path), "GEMINI_API_KEY not set"

    try:
        import google.generativeai as genai  # type: ignore[import-untyped]

        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel(settings.gemini_vision_model)
        from io import BytesIO

        from PIL import Image

        img_data = image_path.read_bytes()
        pil_image = Image.open(BytesIO(img_data))
        prompt = """Analyze this cloud architecture diagram. Return ONLY valid JSON:
{
  "components": ["list of AWS or cloud components you recognize"],
  "notes": "1-3 sentences on data flows, risks, or gaps relevant to a Well-Architected review"
}
No markdown."""
        resp = model.generate_content([pil_image, prompt])
        text = (resp.text or "").strip()
        data = _extract_json(text)
        if data:
            return data, None
        return {"components": [], "notes": text[:2000]}, None
    except Exception as e:
        logger.exception("Gemini vision failed: %s", e)
        return _heuristic_fallback(image_path), str(e)


def _extract_json(text: str) -> dict[str, Any] | None:
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _heuristic_fallback(image_path: Path) -> dict[str, Any]:
    """When Gemini is unavailable, still return a minimal placeholder."""
    return {
        "components": [],
        "notes": f"Diagram uploaded ({image_path.name}). Enable GEMINI_API_KEY for vision analysis.",
    }
