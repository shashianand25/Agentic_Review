import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.models.enums import AnalysisStatus
from app.models.schemas import ArtifactResponse, ErrorDetail, Progress


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class AnalysisJob:
    analysis_id: str
    status: AnalysisStatus
    created_at: datetime
    work_dir: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)
    result: ArtifactResponse | None = None
    errors: list[ErrorDetail] = field(default_factory=list)
    progress: Progress | None = None
    completed_at: datetime | None = None


class AnalysisStore:
    def __init__(self) -> None:
        self._jobs: dict[str, AnalysisJob] = {}
        self._lock = threading.Lock()

    def create_job(self, work_dir: str | None = None, metadata: dict[str, Any] | None = None) -> AnalysisJob:
        with self._lock:
            aid = str(uuid4())
            job = AnalysisJob(
                analysis_id=aid,
                status=AnalysisStatus.QUEUED,
                created_at=utcnow(),
                work_dir=work_dir,
                metadata=metadata or {},
            )
            self._jobs[aid] = job
            return job

    def get(self, analysis_id: str) -> AnalysisJob | None:
        with self._lock:
            return self._jobs.get(analysis_id)

    def update(
        self,
        analysis_id: str,
        *,
        status: AnalysisStatus | None = None,
        result: ArtifactResponse | None = None,
        errors: list[ErrorDetail] | None = None,
        progress: Progress | None = None,
        work_dir: str | None = None,
    ) -> None:
        with self._lock:
            job = self._jobs.get(analysis_id)
            if not job:
                return
            if status is not None:
                job.status = status
            if result is not None:
                job.result = result
            if errors is not None:
                job.errors = errors
            if progress is not None:
                job.progress = progress
            if work_dir is not None:
                job.work_dir = work_dir
            if status in (AnalysisStatus.COMPLETED, AnalysisStatus.FAILED):
                job.completed_at = utcnow()


store = AnalysisStore()


# ─── GRC store (risk register + compliance overrides + evidence) ───────────────

class GRCStore:
    """In-memory GRC data keyed by analysis_id."""

    def __init__(self) -> None:
        self._risks: dict[str, dict[str, dict]] = {}       # job_id -> {risk_id -> risk}
        self._compliance: dict[str, dict[str, dict]] = {}  # job_id -> {control_id -> control}
        self._evidence: dict[str, list[dict]] = {}         # job_id -> [evidence]
        self._lock = threading.Lock()

    # ── Risk Register ──────────────────────────────────────────────────────────

    def set_risks(self, job_id: str, risks: list[dict]) -> None:
        with self._lock:
            self._risks[job_id] = {r["id"]: r for r in risks}

    def get_risks(self, job_id: str) -> list[dict]:
        with self._lock:
            return list((self._risks.get(job_id) or {}).values())

    def update_risk(self, job_id: str, risk_id: str, patch: dict) -> dict | None:
        with self._lock:
            bucket = self._risks.setdefault(job_id, {})
            if risk_id not in bucket:
                return None
            bucket[risk_id].update(patch)
            return bucket[risk_id]

    # ── Compliance Controls ────────────────────────────────────────────────────

    def set_controls(self, job_id: str, controls: list[dict]) -> None:
        with self._lock:
            self._compliance[job_id] = {c["id"]: c for c in controls}

    def get_controls(self, job_id: str) -> list[dict]:
        with self._lock:
            return list((self._compliance.get(job_id) or {}).values())

    def update_control(self, job_id: str, control_id: str, patch: dict) -> dict | None:
        with self._lock:
            bucket = self._compliance.setdefault(job_id, {})
            if control_id not in bucket:
                return None
            bucket[control_id].update(patch)
            return bucket[control_id]

    # ── Evidence ───────────────────────────────────────────────────────────────

    def add_evidence(self, job_id: str, evidence: dict) -> None:
        with self._lock:
            self._evidence.setdefault(job_id, []).append(evidence)

    def get_evidence(self, job_id: str, finding_id: str | None = None) -> list[dict]:
        with self._lock:
            items = self._evidence.get(job_id) or []
            if finding_id:
                items = [e for e in items if e.get("finding_id") == finding_id]
            return items


grc_store = GRCStore()

