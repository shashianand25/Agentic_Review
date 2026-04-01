import json
import logging
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile

from app.models.enums import AnalysisStatus
from app.models.schemas import AnalysisAccepted, ArtifactResponse
from app.services.analysis_pipeline import run_analysis_job
from app.store import store

logger = logging.getLogger(__name__)

router = APIRouter(tags=["analyze"])


def _artifact_from_job(analysis_id: str) -> ArtifactResponse:
    job = store.get(analysis_id)
    if not job:
        raise HTTPException(status_code=404, detail="analysis_id not found")

    base = f"/api/v1/artifacts/{analysis_id}"
    if job.status == AnalysisStatus.COMPLETED and job.result:
        r = job.result.model_copy()
        r.poll_url = base
        return r
    if job.status == AnalysisStatus.FAILED and job.result:
        r = job.result.model_copy()
        r.poll_url = base
        return r

    return ArtifactResponse(
        analysis_id=analysis_id,
        status=job.status,
        created_at=job.created_at,
        progress=job.progress,
        errors=job.errors,
        poll_url=base,
    )


@router.post("/analyze", status_code=202)
async def analyze(
    background_tasks: BackgroundTasks,
    files: list[UploadFile] | None = File(default=None),
    metadata: Annotated[str | None, Form()] = None,
    github_url: Annotated[str | None, Form()] = None,
    github_token: Annotated[str | None, Form()] = None,
    run_live_audit: Annotated[bool, Form()] = False,
    prowler_check_ids: Annotated[str | None, Form()] = None,
    aws_access_key_id: Annotated[str | None, Form()] = None,
    aws_secret_access_key: Annotated[str | None, Form()] = None,
) -> AnalysisAccepted:
    files = files or []
    if not files and not (github_url and github_url.strip()):
        raise HTTPException(status_code=400, detail="Provide files or github_url")

    meta: dict[str, Any] = {}
    if metadata:
        try:
            meta = json.loads(metadata)
        except json.JSONDecodeError as e:
            raise HTTPException(status_code=400, detail=f"Invalid metadata JSON: {e}") from e

    uploaded: list[tuple[str, bytes]] = []
    for uf in files:
        data = await uf.read()
        name = uf.filename or "upload.bin"
        uploaded.append((name, data))

    total_bytes = sum(len(b) for _, b in uploaded)
    if files and total_bytes == 0:
        raise HTTPException(status_code=400, detail="All uploaded files are empty")

    if github_url:
        meta["github_url"] = github_url.strip()
    if github_token:
        meta["github_token"] = github_token
    meta["run_live_audit"] = run_live_audit
    if prowler_check_ids:
        meta["prowler_check_ids"] = prowler_check_ids
    if aws_access_key_id:
        meta["aws_access_key_id"] = aws_access_key_id
    if aws_secret_access_key:
        meta["aws_secret_access_key"] = aws_secret_access_key

    job = store.create_job(metadata=meta)
    analysis_id = job.analysis_id

    background_tasks.add_task(run_analysis_job, store, analysis_id, uploaded, meta)

    poll_url = f"/api/v1/artifacts/{analysis_id}"
    return AnalysisAccepted(
        analysis_id=analysis_id,
        status=AnalysisStatus.QUEUED,
        message="Analysis started",
        poll_url=poll_url,
    )


@router.get("/artifacts/{analysis_id}", response_model=ArtifactResponse)
def get_artifact(analysis_id: str) -> ArtifactResponse:
    return _artifact_from_job(analysis_id)
