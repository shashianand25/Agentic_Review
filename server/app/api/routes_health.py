from fastapi import APIRouter
import os
import shutil

from app.core.config import get_settings
from app.models.schemas import HealthResponse, KeyAvailability, PreflightResponse, ToolAvailability

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    s = get_settings()
    return HealthResponse(status="ok", version=s.app_version)


@router.get("/preflight", response_model=PreflightResponse)
def preflight() -> PreflightResponse:
    s = get_settings()
    tools = ToolAvailability(
        git=shutil.which("git") is not None,
        checkov=shutil.which("checkov") is not None,
        infracost=shutil.which("infracost") is not None,
        prowler=shutil.which("prowler") is not None,
    )
    keys = KeyAvailability(
        bedrock=bool(
            (s.aws_bearer_token_bedrock and s.aws_bearer_token_bedrock.strip())
            or (s.aws_bedrock_api and s.aws_bedrock_api.strip())
            or (
                (s.aws_access_key_id and s.aws_access_key_id.strip())
                and (s.aws_secret_access_key and s.aws_secret_access_key.strip())
            )
        ),
        gemini=bool(s.gemini_api_key and s.gemini_api_key.strip()),
        github=bool(os.getenv("GITHUB_TOKEN")),
        infracost=bool(s.infracost_api_key and s.infracost_api_key.strip()),
    )
    return PreflightResponse(status="ok", version=s.app_version, tools=tools, keys=keys)
