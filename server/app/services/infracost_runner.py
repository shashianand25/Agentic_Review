"""Run Infracost via subprocess and parse JSON output."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from app.core.config import get_settings
from app.models.schemas import CostBreakdownRow, CostReport

logger = logging.getLogger(__name__)


def run_infracost(scan_dir: Path) -> tuple[CostReport, str | None]:
    """
    Run `infracost breakdown --path <dir> --format json`.
    """
    settings = get_settings()
    scan_dir = scan_dir.resolve()
    if not scan_dir.is_dir():
        return CostReport(assumptions=[f"Invalid path: {scan_dir}"]), f"Not a directory: {scan_dir}"

    infracost_bin = shutil.which("infracost")
    if not infracost_bin:
        logger.warning("infracost not found on PATH")
        return CostReport(assumptions=["infracost not installed"]), "infracost executable not found"

    env = os.environ.copy()
    if settings.infracost_api_key:
        env["INFRACOST_API_KEY"] = settings.infracost_api_key

    cmd = [
        infracost_bin,
        "breakdown",
        "--path",
        str(scan_dir),
        "--format",
        "json",
    ]
    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=settings.infracost_timeout_sec,
            cwd=str(scan_dir),
            env=env,
        )
    except FileNotFoundError:
        logger.warning("infracost binary disappeared after which() check")
        return CostReport(assumptions=["infracost not installed"]), "infracost executable not found"
    except subprocess.TimeoutExpired:
        return CostReport(assumptions=["infracost timed out"]), "infracost timed out"

    if proc.returncode != 0:
        err = (proc.stderr or proc.stdout or "")[:4000]
        return CostReport(assumptions=[f"Infracost failed: {err[:500]}"]), err

    try:
        data = json.loads(proc.stdout)
    except json.JSONDecodeError as e:
        return CostReport(), f"infracost JSON parse error: {e}"

    return _to_cost_report(data), None


def _to_cost_report(data: dict[str, Any]) -> CostReport:
    currency = str(data.get("currency") or "USD")
    total = 0.0
    breakdown: list[CostBreakdownRow] = []

    projects = data.get("projects") or []
    for proj in projects:
        b = proj.get("breakdown") or {}
        t = b.get("totalMonthlyCost") or (proj.get("summary") or {}).get("totalMonthlyCost")
        if t is not None:
            total += float(t)
        resources = b.get("resources") or []
        for res in resources:
            name = str(res.get("name") or res.get("resourceType") or "resource")
            cost = res.get("monthlyCost") or res.get("hourlyCost")
            if cost is None:
                monthly = 0.0
            else:
                monthly = float(cost)
            breakdown.append(
                CostBreakdownRow(
                    resource=name,
                    monthly_cost_usd=monthly,
                    metadata={k: v for k, v in res.items() if k not in ("name", "monthlyCost")},
                )
            )

    if total == 0.0 and breakdown:
        total = sum(r.monthly_cost_usd for r in breakdown)

    assumptions = ["Infracost default usage; values are estimates."]
    return CostReport(
        currency=currency,
        total_monthly_usd=total,
        breakdown=breakdown,
        infracost_raw=data,
        assumptions=assumptions,
    )
