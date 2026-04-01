"""GRC endpoints: Risk Register, Compliance Tracker, Evidence Upload."""

from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse

from app.store import grc_store, store

router = APIRouter(prefix="/api/v1/grc", tags=["grc"])

EVIDENCE_DIR = Path(tempfile.gettempdir()) / "waf_agent_evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)

# ─── WAF control catalogue (all 6 pillars, key questions) ─────────────────────

WAF_CONTROLS: list[dict] = [
    # Operational Excellence
    {"id": "OPS-1",  "pillar": "Operational Excellence", "ref": "OPS 1",  "question": "Workload priorities and business outcomes must be explicitly defined and tracked."},
    {"id": "OPS-2",  "pillar": "Operational Excellence", "ref": "OPS 2",  "question": "Organization structure must actively support business outcomes and operations."},
    {"id": "OPS-3",  "pillar": "Operational Excellence", "ref": "OPS 3",  "question": "Organizational culture must promote operational excellence and continuous improvement."},
    {"id": "OPS-4",  "pillar": "Operational Excellence", "ref": "OPS 4",  "question": "Workloads must be designed to expose their internal health and operational state."},
    {"id": "OPS-5",  "pillar": "Operational Excellence", "ref": "OPS 5",  "question": "Automated processes must exist to detect defects, ease remediation, and deploy safely."},
    {"id": "OPS-6",  "pillar": "Operational Excellence", "ref": "OPS 6",  "question": "Deployment risks must be mitigated through progressive delivery or rollback mechanisms."},
    {"id": "OPS-7",  "pillar": "Operational Excellence", "ref": "OPS 7",  "question": "Workload readiness must be evaluated continuously through defined operational metrics."},
    {"id": "OPS-8",  "pillar": "Operational Excellence", "ref": "OPS 8",  "question": "Workload health monitoring must cover all critical system components and dependencies."},
    {"id": "OPS-9",  "pillar": "Operational Excellence", "ref": "OPS 9",  "question": "Operational health and performance must be routinely reviewed against business outcomes."},
    {"id": "OPS-10", "pillar": "Operational Excellence", "ref": "OPS 10", "question": "Workload and operation events must logically map to automated incident response procedures."},
    {"id": "OPS-11", "pillar": "Operational Excellence", "ref": "OPS 11", "question": "Operations must evolve through regular post-incident reviews and architectural updates."},
    # Security
    {"id": "SEC-1",  "pillar": "Security", "ref": "SEC 1",  "question": "Workload boundaries and operating practices must be enforced securely via code."},
    {"id": "SEC-2",  "pillar": "Security", "ref": "SEC 2",  "question": "Identity management for people and active machines must be centralized and strongly authenticated."},
    {"id": "SEC-3",  "pillar": "Security", "ref": "SEC 3",  "question": "Least privilege permissions must be strictly enforced for all human and machine actors."},
    {"id": "SEC-4",  "pillar": "Security", "ref": "SEC 4",  "question": "Security events and anomalies must be actively detected and automatically investigated."},
    {"id": "SEC-5",  "pillar": "Security", "ref": "SEC 5",  "question": "Network resources must be strictly protected at all routing and boundary layers (e.g. WAF, Security Groups)."},
    {"id": "SEC-6",  "pillar": "Security", "ref": "SEC 6",  "question": "Compute resources must be isolated, protected, and regularly patched against vulnerabilities."},
    {"id": "SEC-7",  "pillar": "Security", "ref": "SEC 7",  "question": "Data must be classified based on sensitivity levels to apply appropriate access controls."},
    {"id": "SEC-8",  "pillar": "Security", "ref": "SEC 8",  "question": "Data at rest must be strictly protected via native encryption mechanisms (e.g. KMS, SSE)."},
    {"id": "SEC-9",  "pillar": "Security", "ref": "SEC 9",  "question": "Data in transit must be strictly protected using secure protocols (e.g. TLS, HTTPS)."},
    {"id": "SEC-10", "pillar": "Security", "ref": "SEC 10", "question": "Incident response plans must exist to quickly anticipate, isolate, and recover from security breaches."},
    # Reliability
    {"id": "REL-1",  "pillar": "Reliability", "ref": "REL 1",  "question": "Service limits, quotas, and baseline thresholds must be continually monitored."},
    {"id": "REL-2",  "pillar": "Reliability", "ref": "REL 2",  "question": "Network topology must be designed to withstand regional and zonal network isolation failures."},
    {"id": "REL-3",  "pillar": "Reliability", "ref": "REL 3",  "question": "Service architecture workloads must scale dynamically without degradation under load."},
    {"id": "REL-4",  "pillar": "Reliability", "ref": "REL 4",  "question": "Distributed interactions and API dependencies must be designed to fail gracefully (circuit breakers/retries)."},
    {"id": "REL-5",  "pillar": "Reliability", "ref": "REL 5",  "question": "Workloads must be designed to seamlessly withstand upstream or downstream component failures."},
    {"id": "REL-6",  "pillar": "Reliability", "ref": "REL 6",  "question": "Workload resources must be deeply monitored for performance utilization anomalies."},
    {"id": "REL-7",  "pillar": "Reliability", "ref": "REL 7",  "question": "Stateful and stateless demand adaptation systems (auto-scaling) must be configured."},
    {"id": "REL-8",  "pillar": "Reliability", "ref": "REL 8",  "question": "Infrastructure changes must be enacted safely through CI/CD without causing downtime."},
    {"id": "REL-9",  "pillar": "Reliability", "ref": "REL 9",  "question": "Data must be backed up securely with proven, routine recovery strategies tested regularly."},
    {"id": "REL-10", "pillar": "Reliability", "ref": "REL 10", "question": "Fault isolation boundaries (cellular architectures) must be defined to contain blast radii."},
    {"id": "REL-11", "pillar": "Reliability", "ref": "REL 11", "question": "Single points of failure (SPOFs) must be eliminated to withstand hard component failures."},
    {"id": "REL-12", "pillar": "Reliability", "ref": "REL 12", "question": "Reliability operations (e.g. Chaos Engineering or disaster drills) must be routinely tested."},
    {"id": "REL-13", "pillar": "Reliability", "ref": "REL 13", "question": "Disaster Recovery (DR) strategies (RTO/RPO) must be planned and systematically verified."},
    # Performance Efficiency
    {"id": "PERF-1", "pillar": "Performance Efficiency", "ref": "PERF 1", "question": "The optimal architecture and abstraction models must be consistently evaluated against workload variants."},
    {"id": "PERF-2", "pillar": "Performance Efficiency", "ref": "PERF 2", "question": "Compute solutions must be dynamically selected and sized appropriately (e.g. rightsizing/Graviton)."},
    {"id": "PERF-3", "pillar": "Performance Efficiency", "ref": "PERF 3", "question": "Storage solutions must align natively with read/write access patterns and throughput targets."},
    {"id": "PERF-4", "pillar": "Performance Efficiency", "ref": "PERF 4", "question": "Database paradigms (relational, NoSQL) must strictly map to application concurrency requirements."},
    {"id": "PERF-5", "pillar": "Performance Efficiency", "ref": "PERF 5", "question": "Networking infrastructure must be optimized statically and dynamically to reduce transit latency."},
    {"id": "PERF-6", "pillar": "Performance Efficiency", "ref": "PERF 6", "question": "Workloads must evolve organically with new cloud provider releases to improve efficiency."},
    {"id": "PERF-7", "pillar": "Performance Efficiency", "ref": "PERF 7", "question": "System resources must be aggressively monitored to proactively ensure expected performance levels."},
    {"id": "PERF-8", "pillar": "Performance Efficiency", "ref": "PERF 8", "question": "Cost tradeoffs and caching layers (e.g., CDN, ElastiCache) must be explicitly used to improve load times."},
    # Cost Optimization
    {"id": "COST-1", "pillar": "Cost Optimization", "ref": "COST 1", "question": "Cloud Financial Management (FinOps) models must be deployed to govern team-level spending."},
    {"id": "COST-2", "pillar": "Cost Optimization", "ref": "COST 2", "question": "Resource consumption constraints and lifecycle policing must govern active usage."},
    {"id": "COST-3", "pillar": "Cost Optimization", "ref": "COST 3", "question": "Cost and granular active usage telemetry must be transparently monitored system-wide."},
    {"id": "COST-4", "pillar": "Cost Optimization", "ref": "COST 4", "question": "Automated processes must routinely detect and decommission orphaned or unused resources."},
    {"id": "COST-5", "pillar": "Cost Optimization", "ref": "COST 5", "question": "Managed services and SaaS equivalents must be evaluated to reduce operational footprint costs."},
    {"id": "COST-6", "pillar": "Cost Optimization", "ref": "COST 6", "question": "Resource instances and scale parameters must strictly match desired performance targets without bloat."},
    {"id": "COST-7", "pillar": "Cost Optimization", "ref": "COST 7", "question": "Purchasing models (Reserved Instances, Spot) must be dynamically optimized to lower base costs."},
    {"id": "COST-8", "pillar": "Cost Optimization", "ref": "COST 8", "question": "Data transfer architectural pathways must be modeled extensively to minimize egress charges."},
    {"id": "COST-9", "pillar": "Cost Optimization", "ref": "COST 9", "question": "Architectural cost footprints must be continuously modernized with new hardware/instance types."},
    # Sustainability
    {"id": "SUS-1", "pillar": "Sustainability", "ref": "SUS 1", "question": "Cloud regions with localized green energy metrics must be prioritized for workload deployments."},
    {"id": "SUS-2", "pillar": "Sustainability", "ref": "SUS 2", "question": "Provisioned cloud resources must dynamically map identically to real-time end-user demand patterns."},
    {"id": "SUS-3", "pillar": "Sustainability", "ref": "SUS 3", "question": "Software and microservices must run highly efficient, carbon-optimized design patterns."},
    {"id": "SUS-4", "pillar": "Sustainability", "ref": "SUS 4", "question": "Data lifecycles must be designed to natively minimize unnecessary transit and cold storage footprints."},
    {"id": "SUS-5", "pillar": "Sustainability", "ref": "SUS 5", "question": "Operational practices must actively reduce long-running wasted hardware cycles in lower environments."},
    {"id": "SUS-6", "pillar": "Sustainability", "ref": "SUS 6", "question": "Development build lines and continuous integration sequences must be optimized to reduce energy signatures."},
]

_PILLAR_TO_PREFIX = {
    "Operational Excellence": "OPS",
    "Security": "SEC",
    "Reliability": "REL",
    "Performance Efficiency": "PERF",
    "Cost Optimization": "COST",
    "Sustainability": "SUS",
}


def _build_controls_for_job(job_id: str) -> list[dict]:
    """Seed compliance controls from the job's findings."""
    job = store.get(job_id)
    findings = []
    if job and job.result:
        findings = job.result.findings or []

    finding_pillars: set[str] = set()
    for f in findings:
        pillar_val = f.pillar if isinstance(f.pillar, str) else (f.pillar.value if hasattr(f.pillar, "value") else str(f.pillar))
        # normalize to display name
        for display, prefix in _PILLAR_TO_PREFIX.items():
            if pillar_val.lower().replace(" ", "_") == display.lower().replace(" ", "_") or \
               pillar_val.lower() == display.lower():
                finding_pillars.add(display)
                break
        else:
            finding_pillars.add(pillar_val)

    controls = []
    for ctrl in WAF_CONTROLS:
        pillar = ctrl["pillar"]
        # auto-detect: if findings touch this pillar → flag as "needs_review"
        auto_status = "needs_review" if pillar in finding_pillars else "compliant"
        controls.append({
            **ctrl,
            "status": auto_status,         # compliant | needs_review | not_applicable
            "notes": "",
            "evidence_count": 0,
        })
    return controls


# ─── Risk Register ─────────────────────────────────────────────────────────────

@router.get("/{job_id}/risks")
def get_risks(job_id: str) -> list[dict]:
    job = store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    existing = grc_store.get_risks(job_id)
    if existing:
        return existing

    # Seed from findings
    findings = []
    if job.result:
        findings = job.result.findings or []

    risks = []
    for i, f in enumerate(findings):
        sev = f.severity if isinstance(f.severity, str) else (f.severity.value if hasattr(f.severity, "value") else str(f.severity))
        pillar = f.pillar if isinstance(f.pillar, str) else (f.pillar.value if hasattr(f.pillar, "value") else str(f.pillar))
        risks.append({
            "id": f.id if hasattr(f, "id") else f"risk-{i}",
            "title": f.title if hasattr(f, "title") else "Finding",
            "description": f.description if hasattr(f, "description") else "",
            "pillar": pillar,
            "severity": sev,
            "status": "open",        # open | in_progress | accepted | remediated
            "owner": "",
            "notes": "",
            "recommendation": f.recommendation if hasattr(f, "recommendation") else "",
            "created_at": job.created_at.isoformat(),
        })

    grc_store.set_risks(job_id, risks)
    return risks


@router.put("/{job_id}/risks/{risk_id}")
def update_risk(job_id: str, risk_id: str, body: dict) -> dict:
    if not store.get(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    allowed = {"status", "owner", "notes"}
    patch = {k: v for k, v in body.items() if k in allowed}
    result = grc_store.update_risk(job_id, risk_id, patch)
    if result is None:
        raise HTTPException(status_code=404, detail="Risk not found")
    return result


# ─── Compliance Tracker ────────────────────────────────────────────────────────

@router.get("/{job_id}/compliance")
def get_compliance(job_id: str) -> list[dict]:
    if not store.get(job_id):
        raise HTTPException(status_code=404, detail="Job not found")

    existing = grc_store.get_controls(job_id)
    if existing:
        return existing

    controls = _build_controls_for_job(job_id)
    grc_store.set_controls(job_id, controls)
    return controls


@router.put("/{job_id}/compliance/{control_id}")
def update_control(job_id: str, control_id: str, body: dict) -> dict:
    if not store.get(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    allowed = {"status", "notes"}
    patch = {k: v for k, v in body.items() if k in allowed}
    result = grc_store.update_control(job_id, control_id, patch)
    if result is None:
        raise HTTPException(status_code=404, detail="Control not found")
    return result


# ─── Evidence ──────────────────────────────────────────────────────────────────

@router.post("/{job_id}/evidence")
async def upload_evidence(
    job_id: str,
    file: UploadFile = File(...),
    finding_id: str = Form(""),
    notes: str = Form(""),
) -> dict:
    if not store.get(job_id):
        raise HTTPException(status_code=404, detail="Job not found")

    dest_dir = EVIDENCE_DIR / job_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    ev_id = str(uuid4())
    suffix = Path(file.filename or "file").suffix
    dest = dest_dir / f"{ev_id}{suffix}"

    with dest.open("wb") as fh:
        shutil.copyfileobj(file.file, fh)

    evidence = {
        "id": ev_id,
        "finding_id": finding_id,
        "filename": file.filename,
        "content_type": file.content_type,
        "size_bytes": dest.stat().st_size,
        "notes": notes,
        "path": str(dest),
        "uploaded_at": __import__("datetime").datetime.utcnow().isoformat(),
    }
    grc_store.add_evidence(job_id, evidence)

    # Update evidence_count on matching compliance controls
    for ctrl in grc_store.get_controls(job_id):
        if ctrl.get("pillar"):
            pass  # optionally link evidence to control

    return evidence


@router.get("/{job_id}/evidence")
def list_evidence(job_id: str, finding_id: str = "") -> list[dict]:
    if not store.get(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return grc_store.get_evidence(job_id, finding_id or None)


@router.get("/{job_id}/evidence/{ev_id}/download")
def download_evidence(job_id: str, ev_id: str) -> FileResponse:
    items = grc_store.get_evidence(job_id)
    ev = next((e for e in items if e["id"] == ev_id), None)
    if not ev:
        raise HTTPException(status_code=404, detail="Evidence not found")
    path = Path(ev["path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")
    return FileResponse(str(path), filename=ev["filename"], media_type=ev["content_type"])
