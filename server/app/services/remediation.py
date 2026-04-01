"""Auto-remediation: generate fixed Terraform snippets, validate, and produce diffs."""

from __future__ import annotations

import difflib
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings
from app.models.schemas import CostReport, Finding, Remediation, RemediationValidation

logger = logging.getLogger(__name__)


def _bedrock_client():
    settings = get_settings()
    bearer = settings.aws_bearer_token_bedrock or settings.aws_bedrock_api
    if bearer:
        os.environ["AWS_BEARER_TOKEN_BEDROCK"] = bearer
    kwargs: dict[str, Any] = {"region_name": settings.aws_region}
    if settings.aws_access_key_id and settings.aws_secret_access_key:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    return boto3.client("bedrock-runtime", **kwargs)


def _invoke_llm(system: str, user: str) -> str:
    """Call Bedrock with the configured model, adapting payload to model family."""
    settings = get_settings()
    mid = (settings.bedrock_model_id or "").lower()
    client = _bedrock_client()

    if "amazon.nova" in mid:
        body = {
            "inferenceConfig": {"max_new_tokens": 8192},
            "system": [{"text": system}],
            "messages": [{"role": "user", "content": [{"text": user}]}],
        }
    else:
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 8192,
            "system": system,
            "messages": [{"role": "user", "content": [{"type": "text", "text": user}]}],
        }

    resp = client.invoke_model(
        modelId=settings.bedrock_model_id,
        body=json.dumps(body),
        contentType="application/json",
        accept="application/json",
    )
    raw = json.loads(resp["body"].read())
    return _extract_response_text(mid, raw)


def _extract_response_text(model_id: str, payload: dict) -> str:
    if "amazon.nova" in model_id:
        output = payload.get("output") or {}
        message = output.get("message") or {}
        parts = message.get("content") or []
    else:
        parts = payload.get("content") or []
    return "".join(p.get("text", "") for p in parts if isinstance(p, dict))


def _extract_code_block(text: str) -> str:
    m = re.search(r"```(?:hcl|terraform)?\s*([\s\S]*?)```", text)
    if m:
        return m.group(1).strip()
    return text.strip()


def generate_remediations(
    findings: list[Finding],
    work_dir: Path,
    file_contents: dict[str, str],
    max_items: int | None = None,
) -> list[Remediation]:
    """Produce remediations per finding; map to best-matching file by evidence path."""
    settings = get_settings()
    cap = max_items if max_items is not None else settings.remediation_max_items
    out: list[Remediation] = []
    for f in findings[:cap]:
        path_key = f.evidence.file_path
        if path_key and path_key in file_contents:
            fp = path_key
        elif file_contents:
            fp = next(iter(file_contents.keys()))
        else:
            fp = "main.tf"
        original = file_contents.get(fp, "# (no matching file content)\n")
        fixed, diff_u, notes = _fix_for_finding(f, fp, original)
        fmt_ok, fmt_notes = _validate_terraform_fmt(fixed, fp)
        ckv_ok, ckv_notes = _validate_checkov(fixed, fp)
        all_notes = " | ".join(filter(None, [notes, fmt_notes, ckv_notes]))
        out.append(
            Remediation(
                finding_id=f.id,
                language="terraform",
                file_path=fp,
                original=original[:50000],
                fixed=fixed[:50000],
                diff_unified=diff_u[:50000],
                validation=RemediationValidation(
                    terraform_fmt_ok=fmt_ok,
                    checkov_passed=ckv_ok,
                    notes=all_notes or None,
                ),
            )
        )
    return out


def _fix_for_finding(finding: Finding, file_path: str, original: str) -> tuple[str, str, str | None]:
    system = """You are an expert Terraform engineer. Fix the infrastructure code to address the finding.
Return ONLY the full remediated file content for this single file inside a ```hcl code fence.
Do not add commentary outside the fence."""

    user = f"""File: {file_path}
Finding title: {finding.title}
Severity: {finding.severity}
Description: {finding.description}
Recommendation: {finding.recommendation}

--- ORIGINAL FILE ---
{original}
--- END ---
"""

    try:
        raw = _invoke_llm(system, user)
        fixed = _extract_code_block(raw)
        if len(fixed) < 10:
            fixed = original
            notes = "bedrock returned empty fix"
        else:
            notes = None
    except (ClientError, BotoCoreError, json.JSONDecodeError, KeyError) as e:
        logger.warning("Remediation bedrock failed: %s", e)
        fixed = original
        notes = f"fallback: {e!s}"

    diff_u = "".join(
        difflib.unified_diff(
            original.splitlines(True),
            fixed.splitlines(True),
            fromfile=f"a/{file_path}",
            tofile=f"b/{file_path}",
        )
    )
    return fixed, diff_u, notes


def _validate_terraform_fmt(code: str, file_name: str) -> tuple[bool, str | None]:
    """Write code to a temp file and run `terraform fmt -check`.

    Returns (passed, note_or_none).  Gracefully returns (True, note) when
    the terraform CLI is not installed so we don't block the pipeline.
    """
    if not shutil.which("terraform"):
        return True, "terraform not on PATH; fmt check skipped"

    tmp = Path(tempfile.mkdtemp(prefix="wara-fmt-"))
    try:
        tf_file = tmp / (Path(file_name).name or "check.tf")
        tf_file.write_text(code, encoding="utf-8")
        proc = subprocess.run(
            ["terraform", "fmt", "-check", "-diff", str(tf_file)],
            capture_output=True,
            text=True,
            timeout=15,
            cwd=str(tmp),
        )
        if proc.returncode == 0:
            return True, None
        diff_hint = (proc.stdout or "")[:500]
        return False, f"terraform fmt failed: {diff_hint}"
    except (subprocess.TimeoutExpired, OSError) as e:
        return False, f"terraform fmt error: {e!s}"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _validate_checkov(code: str, file_name: str) -> tuple[bool, str | None]:
    """Run Checkov on the fixed snippet. Returns (all_passed, note_or_none)."""
    if not shutil.which("checkov"):
        return False, "checkov not on PATH; re-scan skipped"

    tmp = Path(tempfile.mkdtemp(prefix="wara-ckv-"))
    try:
        tf_file = tmp / (Path(file_name).name or "check.tf")
        tf_file.write_text(code, encoding="utf-8")
        proc = subprocess.run(
            ["checkov", "-d", str(tmp), "-o", "json", "--quiet", "--soft-fail"],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(tmp),
        )
        if proc.returncode not in (0, 1):
            return False, f"checkov re-scan exit {proc.returncode}"
        text = proc.stdout.strip()
        if not text:
            return True, "checkov produced no output (no checks matched)"
        data = json.loads(text)
        failed = _count_failed(data)
        if failed == 0:
            return True, None
        return False, f"checkov re-scan: {failed} check(s) still failing"
    except (subprocess.TimeoutExpired, OSError, json.JSONDecodeError) as e:
        return False, f"checkov re-scan error: {e!s}"
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _count_failed(data: Any) -> int:
    """Count failed checks in Checkov JSON output (handles list or dict)."""
    total = 0
    items = data if isinstance(data, list) else [data]
    for item in items:
        if not isinstance(item, dict):
            continue
        failed = item.get("results", {}).get("failed_checks") or []
        total += len(failed)
    return total


def estimate_post_remediation_cost(
    remediations: list[Remediation],
    cost_report: CostReport,
) -> CostReport:
    """Re-run Infracost on remediated .tf files to compute cost delta.

    Writes the fixed content into a temp directory, runs ``infracost breakdown``,
    and populates ``total_monthly_after_remediation`` on *cost_report* (mutated
    in place for convenience; the same object is also returned).
    """
    from app.services.infracost_runner import run_infracost

    tf_remediations = [r for r in remediations if r.file_path.endswith((".tf", ".tfvars"))]
    if not tf_remediations:
        return cost_report

    tmp = Path(tempfile.mkdtemp(prefix="wara-costdiff-"))
    try:
        for r in tf_remediations:
            safe_name = Path(r.file_path).name or "main.tf"
            dest = tmp / safe_name
            dest.write_text(r.fixed, encoding="utf-8")

        post_report, err = run_infracost(tmp)
        if err:
            logger.warning("Post-remediation infracost failed: %s", err)
        else:
            cost_report.total_monthly_after_remediation = post_report.total_monthly_usd
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    return cost_report
