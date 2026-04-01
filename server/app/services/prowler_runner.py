"""Run Prowler via subprocess and normalize JSON findings."""

from __future__ import annotations

import json
import logging
import shutil
import subprocess
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

DEFAULT_PROWLER_CHECKS = [
    "iam_user_mfa_enabled",
    "s3_bucket_public_access_block",
    "cloudtrail_multi_region_enabled",
    "guardduty_enabled",
    "securityhub_enabled",
]


@dataclass
class ProwlerRawFinding:
    check_id: str
    title: str
    severity: str
    status: str
    resource: str | None
    region: str | None
    raw: dict[str, Any]


def run_prowler(check_ids: list[str] | None = None) -> tuple[list[ProwlerRawFinding], str | None]:
    prowler_bin = shutil.which("prowler")
    if not prowler_bin:
        logger.warning("prowler not found on PATH")
        return [], "prowler executable not found"

    checks = check_ids or DEFAULT_PROWLER_CHECKS
    check_csv = ",".join(checks)
    cmd = [
        prowler_bin,
        "aws",
        "--check",
        check_csv,
        "--output",
        "json",
    ]

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    except FileNotFoundError:
        logger.warning("prowler binary disappeared after which() check")
        return [], "prowler executable not found"
    except subprocess.TimeoutExpired:
        return [], "prowler timed out"

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "")[:4000]
        return [], err or f"prowler failed with code {proc.returncode}"

    text = proc.stdout.strip()
    if not text:
        return [], None

    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        return [], f"prowler JSON parse error: {e}"

    findings = _parse_prowler(data)
    return findings, None


def _parse_prowler(data: Any) -> list[ProwlerRawFinding]:
    items: list[dict[str, Any]] = []
    if isinstance(data, list):
        items = [x for x in data if isinstance(x, dict)]
    elif isinstance(data, dict):
        if "findings" in data and isinstance(data["findings"], list):
            items = [x for x in data["findings"] if isinstance(x, dict)]
        else:
            items = [data]

    out: list[ProwlerRawFinding] = []
    for it in items:
        check_id = str(it.get("CheckID") or it.get("check_id") or it.get("checkid") or "prowler_check")
        title = str(it.get("CheckTitle") or it.get("check_title") or check_id)
        sev = str(it.get("Severity") or it.get("severity") or "MEDIUM").upper()
        status = str(it.get("Status") or it.get("status") or "UNKNOWN").upper()
        resource = it.get("ResourceId") or it.get("resource_id") or it.get("ResourceArn") or it.get("resource")
        region = it.get("Region") or it.get("region")
        out.append(
            ProwlerRawFinding(
                check_id=check_id,
                title=title,
                severity=sev,
                status=status,
                resource=str(resource) if resource else None,
                region=str(region) if region else None,
                raw=it,
            )
        )
    return out
