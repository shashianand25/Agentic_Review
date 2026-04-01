from fastapi import APIRouter, HTTPException
import os
import shutil

from pydantic import BaseModel

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


class AwsValidateRequest(BaseModel):
    aws_access_key_id: str
    aws_secret_access_key: str
    aws_region: str | None = None


@router.post("/validate-aws")
def validate_aws(body: AwsValidateRequest) -> dict:
    """
    Validate AWS credentials by calling STS GetCallerIdentity.
    Accepts { aws_access_key_id, aws_secret_access_key, aws_region (optional) }.
    Returns { valid: bool, account_id, arn, error }.
    """
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError

    access_key = (body.aws_access_key_id or "").strip()
    secret_key = (body.aws_secret_access_key or "").strip()

    if not access_key or not secret_key:
        raise HTTPException(status_code=400, detail="aws_access_key_id and aws_secret_access_key are required")

    s = get_settings()
    region = (body.aws_region or s.aws_region or "us-east-1").strip()

    try:
        sts = boto3.client(
            "sts",
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region,
        )
        identity = sts.get_caller_identity()
        return {
            "valid": True,
            "account_id": identity.get("Account"),
            "arn": identity.get("Arn"),
            "user_id": identity.get("UserId"),
            "error": None,
        }
    except ClientError as e:
        code = e.response.get("Error", {}).get("Code", "Unknown")
        msg = e.response.get("Error", {}).get("Message", str(e))
        return {"valid": False, "account_id": None, "arn": None, "user_id": None, "error": f"{code}: {msg}"}
    except BotoCoreError as e:
        return {"valid": False, "account_id": None, "arn": None, "user_id": None, "error": str(e)}
    except Exception as e:
        return {"valid": False, "account_id": None, "arn": None, "user_id": None, "error": str(e)}
