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
