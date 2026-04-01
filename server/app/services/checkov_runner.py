"""Run Checkov via subprocess and parse JSON output."""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class CheckovRawFinding:
    check_id: str
    check_name: str
    file_path: str
    line_start: int | None
    line_end: int | None
    guideline: str | None
    raw: dict[str, Any]


def run_checkov(scan_dir: Path) -> tuple[list[CheckovRawFinding], str | None]:
    """
    Run `checkov -d <dir> -o json --soft-fail`.
    Returns (findings, stderr_if_error).
    """
    settings = get_settings()
    scan_dir = scan_dir.resolve()
    if not scan_dir.is_dir():
        return [], f"Not a directory: {scan_dir}"

    checkov_bin = shutil.which("checkov")
    if not checkov_bin:
        logger.warning("checkov not found on PATH")
        return [], "checkov executable not found"

    cmd = [
        checkov_bin,
        "-d",
        str(scan_dir),
        "-o",
        "json",
        "--soft-fail",
        "--quiet",
        "--framework",
        "terraform",
        "cloudformation",
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=settings.checkov_timeout_sec,
            cwd=str(scan_dir),
        )
    except FileNotFoundError:
        logger.warning("checkov binary disappeared after which() check")
        return [], "checkov executable not found"
    except subprocess.TimeoutExpired:
        return [], "checkov timed out"

    if proc.returncode not in (0, 1):
        err = (proc.stderr or proc.stdout or "")[:4000]
        logger.warning("checkov exit %s: %s", proc.returncode, err)
        return [], err or f"checkov failed with code {proc.returncode}"

    text = proc.stdout.strip()
    if not text:
        return [], None

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        return [], f"checkov JSON parse error: {e}"

    findings: list[CheckovRawFinding] = []
    if isinstance(data, list):
        for item in data:
            findings.extend(_parse_record(item))
    elif isinstance(data, dict):
        if "results" in data:
            failed = data.get("results", {}).get("failed_checks") or []
            for fc in failed:
                findings.extend(_parse_failed_check(fc))
        else:
            findings.extend(_parse_record(data))

    return findings, None


def _parse_record(item: dict[str, Any]) -> list[CheckovRawFinding]:
    out: list[CheckovRawFinding] = []
    failed = item.get("results", {}).get("failed_checks") or item.get("failed_checks") or []
    for fc in failed:
        out.extend(_parse_failed_check(fc))
    return out


def _parse_failed_check(fc: dict[str, Any]) -> list[CheckovRawFinding]:
    check_id = str(fc.get("check_id") or fc.get("check") or "unknown")
    name = str(fc.get("check_name") or check_id)
    file_path = str(fc.get("file_path") or fc.get("file_abs_path") or ".")
    line_range = fc.get("file_line_range") or fc.get("file_line_range") or []
    line_start = line_end = None
    if isinstance(line_range, list) and len(line_range) >= 2:
        line_start, line_end = int(line_range[0]), int(line_range[1])
    elif isinstance(line_range, list) and len(line_range) == 1:
        line_start = line_end = int(line_range[0])

    guideline = fc.get("guideline")
    if isinstance(guideline, str):
        pass
    else:
        guideline = None

    return [
        CheckovRawFinding(
            check_id=check_id,
            check_name=name,
            file_path=file_path,
            line_start=line_start,
            line_end=line_end,
            guideline=guideline,
            raw=fc,
        )
    ]
