from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_docs_path() -> Path:
    return Path(__file__).resolve().parent.parent.parent / "docs"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Well-Architected Review Agent"
    app_version: str = "0.1.0"
    cors_origins: str = "*"

    aws_region: str = "us-east-1"
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    # Optional Bedrock API key / bearer token path (no access key/secret required).
    aws_bedrock_api: str | None = None
    aws_bearer_token_bedrock: str | None = None
    bedrock_model_id: str = "anthropic.claude-3-5-sonnet-20240620-v1:0"

    gemini_api_key: str | None = None
    gemini_vision_model: str = "gemini-2.0-flash"

    infracost_api_key: str | None = None

    docs_path: Path = _default_docs_path()

    analysis_timeout_sec: int = 600
    checkov_timeout_sec: int = 120
    infracost_timeout_sec: int = 120
    run_cost_diff: bool = True
    remediation_max_items: int = 3
    demo_fast_mode: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
