from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from app.models.enums import AnalysisStatus, FileKind, PillarKey, Severity


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"


class ToolAvailability(BaseModel):
    git: bool = False
    checkov: bool = False
    infracost: bool = False
    prowler: bool = False


class KeyAvailability(BaseModel):
    bedrock: bool = False
    gemini: bool = False
    github: bool = False
    infracost: bool = False


class PreflightResponse(BaseModel):
    status: str = "ok"
    version: str
    tools: ToolAvailability
    keys: KeyAvailability


class Progress(BaseModel):
    stage: str
    percent: int = Field(ge=0, le=100)


class ErrorDetail(BaseModel):
    code: str
    message: str
    detail: str | None = None


class FileInputMeta(BaseModel):
    name: str
    kind: FileKind
    sha256: str


class DiagramSummary(BaseModel):
    extracted: bool = False
    components: list[str] = Field(default_factory=list)
    notes: str | None = None


class InputsMeta(BaseModel):
    files: list[FileInputMeta] = Field(default_factory=list)
    diagram_summary: DiagramSummary = Field(default_factory=DiagramSummary)


class PillarScores(BaseModel):
    operational_excellence: int = Field(ge=0, le=100)
    security: int = Field(ge=0, le=100)
    reliability: int = Field(ge=0, le=100)
    performance_efficiency: int = Field(ge=0, le=100)
    cost_optimization: int = Field(ge=0, le=100)
    sustainability: int = Field(ge=0, le=100)


class PillarRadar(BaseModel):
    labels: list[str]
    values: list[int]


class CostImpact(BaseModel):
    estimated_monthly_delta_usd: float = 0.0
    ten_x_risk_narrative: str = ""
    currency: str = "USD"


class Evidence(BaseModel):
    source: str
    reference: str | None = None
    file_path: str | None = None
    line_start: int | None = None
    line_end: int | None = None


class Finding(BaseModel):
    id: str
    pillar: PillarKey | str
    title: str
    description: str
    severity: Severity
    waf_alignment: str = ""
    cost_impact: CostImpact = Field(default_factory=CostImpact)
    evidence: Evidence
    recommendation: str = ""


class CostBreakdownRow(BaseModel):
    resource: str
    monthly_cost_usd: float
    metadata: dict[str, Any] = Field(default_factory=dict)


class CostReport(BaseModel):
    currency: str = "USD"
    total_monthly_usd: float = 0.0
    total_monthly_before: float | None = None
    total_monthly_after_remediation: float | None = None
    breakdown: list[CostBreakdownRow] = Field(default_factory=list)
    infracost_raw: dict[str, Any] = Field(default_factory=dict)
    assumptions: list[str] = Field(default_factory=list)


class RemediationValidation(BaseModel):
    terraform_fmt_ok: bool = False
    checkov_passed: bool = False
    notes: str | None = None


class Remediation(BaseModel):
    finding_id: str
    language: str = "terraform"
    file_path: str
    original: str
    fixed: str
    diff_unified: str = ""
    validation: RemediationValidation = Field(default_factory=RemediationValidation)


class ArtifactResponse(BaseModel):
    analysis_id: str
    status: AnalysisStatus
    created_at: datetime | None = None
    completed_at: datetime | None = None
    inputs: InputsMeta = Field(default_factory=InputsMeta)
    pillar_scores: PillarScores | None = None
    pillar_radar: PillarRadar | None = None
    findings: list[Finding] = Field(default_factory=list)
    cost_report: CostReport | None = None
    remediations: list[Remediation] = Field(default_factory=list)
    generated_iac: str | None = None
    errors: list[ErrorDetail] = Field(default_factory=list)
    progress: Progress | None = None
    message: str | None = None
    poll_url: str | None = None


class AnalysisAccepted(BaseModel):
    analysis_id: str
    status: AnalysisStatus = AnalysisStatus.QUEUED
    message: str = "Analysis started"
    poll_url: str
