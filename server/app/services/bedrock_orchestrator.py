"""Amazon Bedrock (Claude 3.5 Sonnet) orchestration with RAG context."""

from __future__ import annotations

import json
import logging
import os
import re
from typing import Any

import boto3
from botocore.exceptions import BotoCoreError, ClientError

from app.core.config import get_settings
from app.models.enums import PillarKey, Severity
from app.models.schemas import CostImpact, Evidence, Finding, PillarRadar, PillarScores
from app.rag.retrieval import retrieve_context
from app.services.checkov_runner import CheckovRawFinding

logger = logging.getLogger(__name__)

PILLAR_LABELS = [
    "Operational Excellence",
    "Security",
    "Reliability",
    "Performance Efficiency",
    "Cost Optimization",
    "Sustainability",
]

# Deterministic mapping: top Checkov check IDs → WAF pillar.
# Checks not listed default to SECURITY (the most common category).
CHECKOV_PILLAR_MAP: dict[str, PillarKey] = {
    # --- Reliability ---
    "CKV_AWS_144": PillarKey.RELIABILITY,      # S3 cross-region replication
    "CKV_AWS_149": PillarKey.RELIABILITY,       # RDS multi-AZ
    "CKV_AWS_16":  PillarKey.RELIABILITY,       # RDS multi-AZ (alias)
    "CKV_AWS_157": PillarKey.RELIABILITY,       # RDS multi-AZ cluster
    "CKV_AWS_76":  PillarKey.RELIABILITY,       # API GW access logging (ops+rel)
    "CKV_AWS_152": PillarKey.RELIABILITY,       # ALB cross-zone load balancing
    "CKV_AWS_116": PillarKey.RELIABILITY,       # Lambda DLQ configured
    # --- Cost Optimization ---
    "CKV_AWS_68":  PillarKey.COST_OPTIMIZATION, # CloudFront price class
    "CKV_AWS_65":  PillarKey.COST_OPTIMIZATION, # ECS Fargate latest platform
    "CKV_AWS_338": PillarKey.COST_OPTIMIZATION, # GP3 over GP2 volumes
    "CKV_AWS_153": PillarKey.COST_OPTIMIZATION, # DynamoDB autoscaling
    # --- Operational Excellence ---
    "CKV_AWS_158": PillarKey.OPERATIONAL_EXCELLENCE, # CloudWatch log group retention
    "CKV_AWS_66":  PillarKey.OPERATIONAL_EXCELLENCE, # CloudWatch Logs on ECS
    "CKV_AWS_129": PillarKey.OPERATIONAL_EXCELLENCE, # X-Ray tracing on API GW
    "CKV_AWS_50":  PillarKey.OPERATIONAL_EXCELLENCE, # Lambda X-Ray tracing
    "CKV_AWS_73":  PillarKey.OPERATIONAL_EXCELLENCE, # CloudTrail log file validation
    # --- Performance Efficiency ---
    "CKV_AWS_117": PillarKey.PERFORMANCE_EFFICIENCY, # Lambda in VPC
    "CKV_AWS_97":  PillarKey.PERFORMANCE_EFFICIENCY, # ECS task CPU/memory limits
    "CKV_AWS_26":  PillarKey.PERFORMANCE_EFFICIENCY, # SNS encryption (perf+sec)
    # --- Sustainability ---
    "CKV_AWS_364": PillarKey.SUSTAINABILITY,    # Lambda Graviton/ARM64
    # --- Security (explicit entries for documentation) ---
    "CKV_AWS_79":  PillarKey.SECURITY,          # IMDSv2
    "CKV_AWS_18":  PillarKey.SECURITY,          # S3 access logging
    "CKV_AWS_19":  PillarKey.SECURITY,          # S3 SSE
    "CKV_AWS_145": PillarKey.SECURITY,          # RDS encryption at rest
    "CKV_AWS_23":  PillarKey.SECURITY,          # Security group open to world
    "CKV_AWS_24":  PillarKey.SECURITY,          # SG unrestricted SSH
}


def _bedrock_client(aws_keys: dict[str, str] | None = None):
    settings = get_settings()
    bearer = settings.aws_bearer_token_bedrock or settings.aws_bedrock_api
    if bearer:
        # AWS Bedrock API key flow for SDKs uses AWS_BEARER_TOKEN_BEDROCK.
        os.environ["AWS_BEARER_TOKEN_BEDROCK"] = bearer
    kwargs: dict[str, Any] = {"region_name": settings.aws_region}
    
    if aws_keys and aws_keys.get("aws_access_key_id") and aws_keys.get("aws_secret_access_key"):
        kwargs["aws_access_key_id"] = aws_keys["aws_access_key_id"]
        kwargs["aws_secret_access_key"] = aws_keys["aws_secret_access_key"]
    elif settings.aws_access_key_id and settings.aws_secret_access_key:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    return boto3.client("bedrock-runtime", **kwargs)


def _invoke_llm(system: str, user: str, aws_keys: dict[str, str] | None = None) -> str:
    """Call Bedrock with the configured model, adapting payload to model family."""
    settings = get_settings()
    mid = (settings.bedrock_model_id or "").lower()
    client = _bedrock_client(aws_keys)

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


def _extract_json(text: str) -> dict[str, Any] | None:
    text = text.strip()
    m = re.search(r"\{[\s\S]*\}", text)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def synthesize_review(
    iac_snippet: str,
    checkov: list[CheckovRawFinding],
    infracost_summary: str,
    diagram_notes: str | None,
    proposed_findings: list[str] | None = None,
    actual_findings: list[str] | None = None,
    aws_keys: dict[str, str] | None = None,
) -> tuple[PillarScores, PillarRadar, list[Finding], list[str]]:
    """
    Returns pillar scores, radar, LLM findings, and warnings (e.g. bedrock unavailable).
    """
    warnings: list[str] = []
    query = " ".join(
        [c.check_name for c in checkov[:20]]
        + ([diagram_notes or ""][:500])
    )
    rag = retrieve_context(query or "AWS Well-Architected Framework pillars")

    checkov_lines = "\n".join(
        f"- {c.check_id} ({c.file_path}:{c.line_start}-{c.line_end}): {c.check_name}"
        for c in checkov[:50]
    )

    system = """You are an Expert AWS Solutions Architect. Evaluate infrastructure against the AWS Well-Architected Framework.
Output ONLY valid JSON with this exact shape (no markdown fences):
{
  "pillar_scores": {
    "operational_excellence": 0-100,
    "security": 0-100,
    "reliability": 0-100,
    "performance_efficiency": 0-100,
    "cost_optimization": 0-100,
    "sustainability": 0-100
  },
  "findings": [
    {
      "id": "f-001",
      "pillar": "security|operational_excellence|reliability|performance_efficiency|cost_optimization|sustainability",
      "title": "short",
      "description": "detailed",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW|INFO",
      "waf_alignment": "which WAF idea",
      "cost_impact": {
        "estimated_monthly_delta_usd": 0,
        "ten_x_risk_narrative": "10x cost / risk framing",
        "currency": "USD"
      },
      "recommendation": "action"
    }
  ]
}
Merge static analysis (Checkov) with your reasoning. Include at least 5 findings when issues exist; fewer if the config is trivial.
If both PROPOSED and ACTUAL findings are supplied, explicitly detect DRIFT (discrepancies between code/intended state and live state).
When drift is detected, include one or more findings under pillar "operational_excellence" that clearly explain the drift and action needed."""

    proposed_lines = "\n".join(f"- {x}" for x in (proposed_findings or [])[:80])
    actual_lines = "\n".join(f"- {x}" for x in (actual_findings or [])[:80])

    user = f"""## RAG context (AWS WAF excerpts)
{rag[:8000]}

## IaC excerpt
{iac_snippet[:12000]}

## Checkov failed checks
{checkov_lines or "(none)"}

## Infracost summary
{infracost_summary[:4000]}

## Diagram / vision notes
{diagram_notes or "(none)"}

## Proposed findings (code/intended state)
{proposed_lines or "(none)"}

## Actual findings (live state)
{actual_lines or "(none)"}
"""

    total_chars = len(system) + len(user)
    approx_tokens = total_chars // 4
    logger.info(
        "LLM context budget: system=%d chars, user=%d chars, total~%d tokens | "
        "iac_snippet=%d, checkov_lines=%d, rag=%d, proposed=%d, actual=%d",
        len(system), len(user), approx_tokens,
        len(iac_snippet), len(checkov_lines), len(rag),
        len(proposed_lines), len(actual_lines),
    )

    try:
        raw = _invoke_llm(system, user, aws_keys)
    except (ClientError, BotoCoreError, json.JSONDecodeError, KeyError) as e:
        logger.exception("Bedrock invoke failed: %s", e)
        warnings.append(f"bedrock_unavailable: {e!s}")
        return _fallback_from_checkov(checkov), _fallback_radar(), [], warnings

    data = _extract_json(raw)
    if not data:
        warnings.append("bedrock_parse_failed")
        return _fallback_from_checkov(checkov), _fallback_radar(), [], warnings

    ps = data.get("pillar_scores") or {}
    try:
        scores = PillarScores(
            operational_excellence=int(ps.get("operational_excellence", 70)),
            security=int(ps.get("security", 70)),
            reliability=int(ps.get("reliability", 70)),
            performance_efficiency=int(ps.get("performance_efficiency", 70)),
            cost_optimization=int(ps.get("cost_optimization", 70)),
            sustainability=int(ps.get("sustainability", 70)),
        )
    except (TypeError, ValueError):
        scores = _fallback_from_checkov(checkov)
        warnings.append("invalid_pillar_scores")

    vals = [
        scores.operational_excellence,
        scores.security,
        scores.reliability,
        scores.performance_efficiency,
        scores.cost_optimization,
        scores.sustainability,
    ]
    radar = PillarRadar(labels=PILLAR_LABELS, values=vals)

    findings_out: list[Finding] = []
    for i, f in enumerate(data.get("findings") or []):
        try:
            sev = Severity(str(f.get("severity", "MEDIUM")).upper())
        except ValueError:
            sev = Severity.MEDIUM
        pillar_raw = str(f.get("pillar", "security")).lower().replace(" ", "_").replace("-", "_")
        pillar = _coerce_pillar(pillar_raw)

        ci = f.get("cost_impact") or {}
        findings_out.append(
            Finding(
                id=str(f.get("id") or f"f-{i+1:03d}"),
                pillar=pillar,
                title=str(f.get("title", "Finding")),
                description=str(f.get("description", "")),
                severity=sev,
                waf_alignment=str(f.get("waf_alignment", "")),
                cost_impact=CostImpact(
                    estimated_monthly_delta_usd=float(ci.get("estimated_monthly_delta_usd", 0) or 0),
                    ten_x_risk_narrative=str(ci.get("ten_x_risk_narrative", "")),
                    currency=str(ci.get("currency", "USD")),
                ),
                evidence=Evidence(
                    source="bedrock",
                    reference=None,
                    file_path=None,
                    line_start=None,
                    line_end=None,
                ),
                recommendation=str(f.get("recommendation", "")),
            )
        )

    merged = _merge_checkov_findings(findings_out, checkov)
    return scores, radar, merged, warnings


def _checkov_pillar(check_id: str) -> PillarKey:
    """Resolve a Checkov check ID to its WAF pillar via deterministic map."""
    return CHECKOV_PILLAR_MAP.get(check_id, PillarKey.SECURITY)


_PILLAR_RISK_NARRATIVE: dict[PillarKey, str] = {
    PillarKey.SECURITY: "Unresolved security debt can drive disproportionate incident and rework cost.",
    PillarKey.RELIABILITY: "Missing redundancy can cause extended downtime, SLA penalties, and customer churn.",
    PillarKey.COST_OPTIMIZATION: "Sub-optimal resource choices compound into significant overspend at scale.",
    PillarKey.OPERATIONAL_EXCELLENCE: "Gaps in observability delay incident detection and inflate mean-time-to-recover.",
    PillarKey.PERFORMANCE_EFFICIENCY: "Under-configured compute increases latency, hurting user experience and revenue.",
    PillarKey.SUSTAINABILITY: "Inefficient resource usage increases carbon footprint without business benefit.",
}


def _merge_checkov_findings(llm: list[Finding], checkov: list[CheckovRawFinding]) -> list[Finding]:
    """Prepend explicit Checkov-backed findings so evidence is grounded."""
    seen: set[str] = set()
    out: list[Finding] = []
    for i, c in enumerate(checkov[:30]):
        fid = f"ckv-{c.check_id}-{i}"
        if fid in seen:
            continue
        seen.add(fid)
        pillar = _checkov_pillar(c.check_id)
        out.append(
            Finding(
                id=fid,
                pillar=pillar,
                title=c.check_name[:200],
                description=f"Checkov: {c.check_id}",
                severity=Severity.HIGH,
                waf_alignment=f"{pillar.value.replace('_', ' ').title()} pillar — static analysis (Checkov)",
                cost_impact=CostImpact(
                    estimated_monthly_delta_usd=0.0,
                    ten_x_risk_narrative=_PILLAR_RISK_NARRATIVE.get(
                        pillar, _PILLAR_RISK_NARRATIVE[PillarKey.SECURITY]
                    ),
                    currency="USD",
                ),
                evidence=Evidence(
                    source="checkov",
                    reference=c.check_id,
                    file_path=c.file_path,
                    line_start=c.line_start,
                    line_end=c.line_end,
                ),
                recommendation=c.guideline or "Remediate per Checkov guidance and AWS best practices.",
            )
        )
    for f in llm:
        out.append(f)
    return out


def _fallback_from_checkov(checkov: list[CheckovRawFinding]) -> PillarScores:
    base = 85
    penalty = min(40, len(checkov) * 3)
    sec = max(20, base - penalty)
    return PillarScores(
        operational_excellence=78,
        security=sec,
        reliability=75,
        performance_efficiency=72,
        cost_optimization=70,
        sustainability=68,
    )


def _coerce_pillar(raw: str) -> PillarKey | str:
    for p in PillarKey:
        if p.value == raw:
            return p
    return PillarKey.SECURITY


def _fallback_radar() -> PillarRadar:
    s = _fallback_from_checkov([])
    v = [
        s.operational_excellence,
        s.security,
        s.reliability,
        s.performance_efficiency,
        s.cost_optimization,
        s.sustainability,
    ]
    return PillarRadar(labels=PILLAR_LABELS, values=v)


# ---------------------------------------------------------------------------
# Diagram-to-Terraform: generate draft IaC from vision-extracted components
# ---------------------------------------------------------------------------

def generate_iac_from_vision(components: list[str], notes: str, aws_keys: dict[str, str] | None = None) -> tuple[str, str | None]:
    """Generate a single-file Terraform config from architecture diagram analysis.

    Returns (terraform_source, error_or_none).
    """
    system = """You are an expert Terraform engineer. Generate a single-file, production-quality
Terraform configuration for the AWS components listed below.
Rules:
- Use best-practice defaults (encryption at rest, private subnets, least-privilege IAM).
- Include a comment header: # Generated by Well-Architected Review Agent — draft from architecture diagram.
- Output ONLY valid HCL inside a ```hcl code fence. No commentary outside the fence."""

    user = f"""AWS components identified from architecture diagram:
{', '.join(components)}

Additional context / data-flow notes:
{notes or '(none)'}

Generate the Terraform now."""

    try:
        raw = _invoke_llm(system, user, aws_keys)
    except (ClientError, BotoCoreError, json.JSONDecodeError, KeyError) as e:
        logger.exception("IaC generation from vision failed: %s", e)
        return "", f"bedrock_iac_gen_failed: {e!s}"

    code = _extract_code_block(raw)
    if len(code) < 20:
        return "", "bedrock returned empty or trivial IaC"
    return code, None


def _extract_code_block(text: str) -> str:
    """Pull the first fenced code block out of an LLM response."""
    m = re.search(r"```(?:hcl|terraform)?\s*([\s\S]*?)```", text)
    if m:
        return m.group(1).strip()
    return text.strip()
