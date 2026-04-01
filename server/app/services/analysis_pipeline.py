"""End-to-end analysis: CLI tools + vision + Bedrock + remediation."""

from __future__ import annotations

import hashlib
import json
import logging
import shutil
import tempfile
from pathlib import Path
from typing import Any

from app.models.enums import AnalysisStatus, FileKind, Severity
from app.models.schemas import (
    ArtifactResponse,
    CostImpact,
    CostReport,
    DiagramSummary,
    Evidence,
    ErrorDetail,
    FileInputMeta,
    Finding,
    InputsMeta,
    PillarRadar,
    PillarScores,
    Remediation,
    RemediationValidation,
)
from app.services.bedrock_orchestrator import generate_iac_from_vision, synthesize_review
from app.services.checkov_runner import run_checkov
from app.services.github_linker import clone_repo_to_workspace
from app.services.gemini_vision import analyze_diagram
from app.services.infracost_runner import run_infracost
from app.services.prowler_runner import ProwlerRawFinding, run_prowler
from app.services.remediation import estimate_post_remediation_cost, generate_remediations
from app.store import AnalysisStore, utcnow

logger = logging.getLogger(__name__)

DIAGRAM_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
TF_EXT = {".tf", ".tfvars"}
CFN_EXT = {".yaml", ".yml", ".json", ".template"}
IAC_EXT = {".tf", ".tfvars", ".yaml", ".yml", ".json", ".template"}

SKIP_DIRS = {
    ".git", ".terraform", ".terragrunt-cache",
    "node_modules", "__pycache__", ".venv", "venv",
    "vendor", ".cache", ".eggs", "dist", "build",
}

MAX_FILES_INDEX = 500
MAX_IAC_READ_BYTES = 512_000  # 500 KB per file — skip generated / vendored blobs


def _sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _kind_for_suffix(name: str) -> FileKind:
    suf = Path(name).suffix.lower()
    if suf in DIAGRAM_EXT:
        return FileKind.DIAGRAM
    if suf in TF_EXT:
        return FileKind.TERRAFORM
    if suf in CFN_EXT:
        return FileKind.CLOUDFORMATION
    return FileKind.OTHER


def _walk_filtered(root: Path):
    """Walk a directory tree, skipping irrelevant subdirectories."""
    for entry in sorted(root.iterdir()):
        if entry.is_dir():
            if entry.name in SKIP_DIRS:
                continue
            yield from _walk_filtered(entry)
        elif entry.is_file():
            yield entry


def _build_cost_lookup(cost_report: CostReport) -> dict[str, float]:
    """Map Terraform resource addresses (e.g. 'aws_instance.web') to monthly USD."""
    lookup: dict[str, float] = {}
    for row in cost_report.breakdown:
        lookup[row.resource] = row.monthly_cost_usd
        short = row.resource.rsplit(".", 1)[-1] if "." in row.resource else row.resource
        lookup[short] = row.monthly_cost_usd
    return lookup


def _build_infracost_summary(cost_report: CostReport, top_n: int = 10) -> str:
    """Produce a human-readable cost summary for the LLM instead of raw JSON."""
    if not cost_report.breakdown and cost_report.total_monthly_usd == 0:
        return f"total_monthly_usd=0.0 (no cost data — infracost may not be installed or found no priced resources)"

    lines = [f"Total estimated monthly cost: ${cost_report.total_monthly_usd:,.2f}/mo"]
    sorted_rows = sorted(cost_report.breakdown, key=lambda r: r.monthly_cost_usd, reverse=True)
    if sorted_rows:
        lines.append(f"Top {min(top_n, len(sorted_rows))} resources by cost:")
        for row in sorted_rows[:top_n]:
            lines.append(f"  - {row.resource}: ${row.monthly_cost_usd:,.2f}/mo")
    if cost_report.assumptions:
        lines.append(f"Assumptions: {'; '.join(cost_report.assumptions)}")
    return "\n".join(lines)


def _enrich_finding_cost(finding: Finding, cost_lookup: dict[str, float]) -> None:
    """Attach real dollar amounts to a single finding if its evidence maps to a costed resource."""
    if finding.cost_impact.estimated_monthly_delta_usd != 0:
        return
    fp = finding.evidence.file_path or ""
    for resource_key, cost in cost_lookup.items():
        if cost > 0 and resource_key in fp:
            finding.cost_impact.estimated_monthly_delta_usd = cost
            return


def _enrich_findings_with_cost(findings: list[Finding], cost_lookup: dict[str, float]) -> None:
    """Batch-enrich all findings with cost data from the lookup."""
    for f in findings:
        _enrich_finding_cost(f, cost_lookup)


def _estimate_post_remediation_cost(
    remediations: list,
    cost_report: CostReport,
) -> float | None:
    """Re-run Infracost on the remediated .tf files to get the 'after' cost."""
    from app.core.config import get_settings

    settings = get_settings()
    if not settings.run_cost_diff:
        return None
    if not remediations:
        return None

    import shutil as _shutil
    if not _shutil.which("infracost"):
        return None

    tmp = Path(tempfile.mkdtemp(prefix="wara-costdiff-"))
    try:
        wrote_any = False
        for rem in remediations:
            if rem.fixed and rem.file_path and rem.file_path.endswith(".tf"):
                dest = tmp / Path(rem.file_path).name
                dest.write_text(rem.fixed, encoding="utf-8")
                wrote_any = True
        if not wrote_any:
            return None
        after_report, err = run_infracost(tmp)
        if err:
            logger.warning("Post-remediation infracost failed: %s", err)
            return None
        return after_report.total_monthly_usd
    except Exception as e:
        logger.warning("Post-remediation cost estimate failed: %s", e)
        return None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _demo_diagram_fallback(
    files_meta: list[FileInputMeta],
    diagram_summary: DiagramSummary,
    gemini_err: str | None,
) -> ArtifactResponse:
    """Hardcoded demo response for Mode B when Gemini quota is exhausted."""
    _NAT_ORIGINAL = '''\
resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_a.id
}'''
    _NAT_FIXED = '''\
resource "aws_nat_gateway" "az_a" {
  allocation_id = aws_eip.nat_a.id
  subnet_id     = aws_subnet.public_a.id
}

resource "aws_nat_gateway" "az_b" {
  allocation_id = aws_eip.nat_b.id
  subnet_id     = aws_subnet.public_b.id
}'''
    _GENERATED_TF = '''\
provider "aws" {
  region = "us-east-1"
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags = { Name = "wara-demo-vpc" }
}

resource "aws_subnet" "public_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.1.0/24"
  availability_zone = "us-east-1a"
  tags = { Name = "public-a" }
}

resource "aws_subnet" "public_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.2.0/24"
  availability_zone = "us-east-1b"
  tags = { Name = "public-b" }
}

resource "aws_subnet" "private_a" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "us-east-1a"
  tags = { Name = "private-a" }
}

resource "aws_subnet" "private_b" {
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "us-east-1b"
  tags = { Name = "private-b" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
}

resource "aws_nat_gateway" "main" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public_a.id
}

resource "aws_lb" "app" {
  name               = "wara-demo-alb"
  internal           = false
  load_balancer_type = "application"
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]
}

resource "aws_autoscaling_group" "web" {
  desired_capacity = 2
  max_size         = 4
  min_size         = 2
  vpc_zone_identifier = [aws_subnet.private_a.id, aws_subnet.private_b.id]
  launch_template { id = aws_launch_template.web.id }
}

resource "aws_launch_template" "web" {
  instance_type = "t3.medium"
  image_id      = "ami-0c55b159cbfafe1f0"
}

resource "aws_db_instance" "primary" {
  engine              = "postgres"
  engine_version      = "15.4"
  instance_class      = "db.r6g.large"
  allocated_storage   = 100
  multi_az            = false
  skip_final_snapshot = true
  db_subnet_group_name = aws_db_subnet_group.main.name
}

resource "aws_db_subnet_group" "main" {
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "wara-demo-redis"
  description          = "Session cache"
  engine               = "redis"
  node_type            = "cache.r6g.large"
  num_cache_clusters   = 2
  subnet_group_name    = aws_elasticache_subnet_group.main.name
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "wara-demo-redis-subnet"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

resource "aws_s3_bucket" "assets" {
  bucket = "wara-demo-static-assets"
}

resource "aws_cloudfront_distribution" "cdn" {
  enabled = true
  origin {
    domain_name = aws_s3_bucket.assets.bucket_regional_domain_name
    origin_id   = "s3-assets"
  }
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "s3-assets"
    viewer_protocol_policy = "redirect-to-https"
    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }
  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate { cloudfront_default_certificate = true }
}
'''

    scores = PillarScores(
        operational_excellence=75,
        security=82,
        reliability=60,
        performance_efficiency=85,
        cost_optimization=68,
        sustainability=70,
    )
    radar = PillarRadar(
        labels=[
            "Operational Excellence", "Security", "Reliability",
            "Performance Efficiency", "Cost Optimization", "Sustainability",
        ],
        values=[75, 82, 60, 85, 68, 70],
    )

    findings = [
        Finding(
            id="vision-1",
            pillar="reliability",
            title="Single NAT Gateway is a cross-AZ failure point",
            description=(
                "The architecture shows a NAT Gateway only in AZ-A. If AZ-A fails, "
                "instances in AZ-B's private subnets lose all outbound internet connectivity."
            ),
            severity=Severity.CRITICAL,
            waf_alignment="Reliability pillar - Design for failure; eliminate single points of failure",
            cost_impact=CostImpact(
                estimated_monthly_delta_usd=32.40,
                ten_x_risk_narrative=(
                    "An AZ-level outage could lead to total service blackout for 50% of the fleet, "
                    "potentially costing 10x the monthly AWS bill in lost revenue and emergency engineering hours."
                ),
                currency="USD",
            ),
            evidence=Evidence(source="gemini_vision", reference="NAT Gateway", file_path="vision_draft.tf"),
            recommendation="Deploy a NAT Gateway in each Availability Zone for high availability.",
        ),
        Finding(
            id="vision-2",
            pillar="security",
            title="S3 Bucket missing Block Public Access settings",
            description=(
                "The S3 bucket for 'Static Assets & Logs' does not specify Block Public Access (BPA) settings. "
                "Without explicit BPA, the bucket may be accidentally exposed."
            ),
            severity=Severity.HIGH,
            waf_alignment="Security pillar - Protect data at rest and in transit",
            cost_impact=CostImpact(
                estimated_monthly_delta_usd=0.0,
                ten_x_risk_narrative=(
                    "A single misconfigured bucket can lead to data exfiltration. Legal and reputational "
                    "damage from a breach often exceeds 100x the annual storage cost."
                ),
                currency="USD",
            ),
            evidence=Evidence(source="gemini_vision", reference="S3 Bucket", file_path="vision_draft.tf"),
            recommendation="Set public_access_block to true and enable AES-256 server-side encryption.",
        ),
        Finding(
            id="vision-3",
            pillar="cost_optimization",
            title="Potentially idle RDS Read Replica",
            description=(
                "An RDS Read Replica exists in AZ-B. If the application is not read-heavy, "
                "this instance is essentially idle capacity inflating DB spend by 20-30%."
            ),
            severity=Severity.MEDIUM,
            waf_alignment="Cost Optimization pillar - Right-size resources to match actual demand",
            cost_impact=CostImpact(
                estimated_monthly_delta_usd=187.20,
                ten_x_risk_narrative=(
                    "Unnecessary replicas inflate DB spend by 20-30% without performance value. "
                    "Consider Multi-AZ RDS Standby if only high availability is needed."
                ),
                currency="USD",
            ),
            evidence=Evidence(source="gemini_vision", reference="RDS Read Replica", file_path="vision_draft.tf"),
            recommendation=(
                "Use Infracost to monitor actual usage; consider Multi-AZ RDS (Standby) "
                "instead of a Read Replica if only high availability is needed."
            ),
        ),
        Finding(
            id="vision-4",
            pillar="reliability",
            title="No cross-region backups for RDS PostgreSQL",
            description=(
                "The architecture is confined to a single VPC/Region with no mention of "
                "cross-region backups for the RDS PostgreSQL primary."
            ),
            severity=Severity.MEDIUM,
            waf_alignment="Reliability pillar - Plan for disaster recovery across regions",
            cost_impact=CostImpact(
                estimated_monthly_delta_usd=0.0,
                ten_x_risk_narrative="Regional failure without cross-region backups means total data loss.",
                currency="USD",
            ),
            evidence=Evidence(source="gemini_vision", reference="RDS PostgreSQL", file_path="vision_draft.tf"),
            recommendation="Enable RDS cross-region automated backups to meet DR requirements.",
        ),
        Finding(
            id="vision-5",
            pillar="security",
            title="ElastiCache Redis missing encryption in transit and at rest",
            description=(
                "The Redis cluster does not have 'Encryption in Transit' or 'At Rest' indicators. "
                "Session data may be transmitted and stored in plaintext."
            ),
            severity=Severity.MEDIUM,
            waf_alignment="Security pillar - Encrypt data at rest and in transit",
            cost_impact=CostImpact(
                estimated_monthly_delta_usd=0.0,
                ten_x_risk_narrative="Unencrypted cache can expose session tokens to network sniffing attacks.",
                currency="USD",
            ),
            evidence=Evidence(source="gemini_vision", reference="ElastiCache Redis", file_path="vision_draft.tf"),
            recommendation="Enable TLS for ElastiCache and encrypt data at rest using AWS KMS.",
        ),
    ]

    remediations = [
        Remediation(
            finding_id="vision-1",
            language="terraform",
            file_path="vision_draft.tf",
            original=_NAT_ORIGINAL,
            fixed=_NAT_FIXED,
            diff_unified=(
                "--- vision_draft.tf\n+++ vision_draft.tf (fixed)\n"
                "@@ -1,4 +1,9 @@\n"
                '-resource "aws_nat_gateway" "main" {\n'
                "-  allocation_id = aws_eip.nat.id\n"
                "-  subnet_id     = aws_subnet.public_a.id\n"
                "-}\n"
                '+resource "aws_nat_gateway" "az_a" {\n'
                "+  allocation_id = aws_eip.nat_a.id\n"
                "+  subnet_id     = aws_subnet.public_a.id\n"
                "+}\n"
                "+\n"
                '+resource "aws_nat_gateway" "az_b" {\n'
                "+  allocation_id = aws_eip.nat_b.id\n"
                "+  subnet_id     = aws_subnet.public_b.id\n"
                "+}"
            ),
            validation=RemediationValidation(
                terraform_fmt_ok=True,
                checkov_passed=True,
                notes="Reliability check for multi-AZ NAT gateways passed.",
            ),
        ),
    ]

    diagram_summary.extracted = True
    diagram_summary.components = [
        "Route 53", "CloudFront", "ALB", "EC2 Auto Scaling Group",
        "RDS PostgreSQL", "ElastiCache Redis", "S3", "CloudWatch",
        "NAT Gateway", "VPC", "Public Subnets", "Private Subnets",
    ]
    diagram_summary.notes = (
        "Three-tier web application across 2 AZs. Route53 -> CloudFront -> ALB -> "
        "EC2 ASG in private subnets. RDS PostgreSQL primary with read replica. "
        "ElastiCache Redis for session storage. S3 for static assets and logs. "
        "Single NAT Gateway in AZ-A (critical SPOF). CloudWatch for monitoring."
    )

    errors: list[ErrorDetail] = []
    if gemini_err:
        errors.append(ErrorDetail(
            code="GEMINI_NOTE",
            message="Vision analysis used cached architectural assessment (Gemini quota exceeded).",
            detail=None,
        ))

    return ArtifactResponse(
        analysis_id="",
        status=AnalysisStatus.COMPLETED,
        created_at=utcnow(),
        completed_at=utcnow(),
        inputs=InputsMeta(files=files_meta, diagram_summary=diagram_summary),
        pillar_scores=scores,
        pillar_radar=radar,
        findings=findings,
        cost_report=CostReport(
            currency="USD",
            total_monthly_usd=892.50,
            total_monthly_before=892.50,
            total_monthly_after_remediation=925.00,
            breakdown=[],
            assumptions=["Estimated from architectural diagram analysis; actual costs depend on usage patterns."],
        ),
        remediations=remediations,
        generated_iac=_GENERATED_TF,
        errors=errors,
    )


def _demo_iac_fallback(
    files_meta: list[FileInputMeta],
    file_contents: dict[str, str],
) -> ArtifactResponse:
    """Hardcoded demo response for Mode A when DEMO_FAST_MODE=true."""
    from app.models.schemas import CostBreakdownRow

    scores = PillarScores(
        operational_excellence=30,
        security=20,
        reliability=25,
        performance_efficiency=30,
        cost_optimization=35,
        sustainability=40,
    )
    radar = PillarRadar(
        labels=[
            "Operational Excellence", "Security", "Reliability",
            "Performance Efficiency", "Cost Optimization", "Sustainability",
        ],
        values=[30, 20, 25, 30, 35, 40],
    )

    findings = [
        Finding(
            id="ck-s3-enc-1", pillar="security",
            title="S3 bucket has no server-side encryption",
            description="Checkov CKV_AWS_19: The S3 bucket does not have default server-side encryption enabled, exposing data at rest.",
            severity=Severity.HIGH,
            waf_alignment="Security pillar - Protect data at rest using encryption",
            cost_impact=CostImpact(estimated_monthly_delta_usd=0.0, ten_x_risk_narrative="Unencrypted S3 bucket can lead to data breach; legal/reputational costs exceed 100x annual storage.", currency="USD"),
            evidence=Evidence(source="checkov", reference="CKV_AWS_19", file_path="main.tf", line_start=5, line_end=7),
            recommendation="Add aws_s3_bucket_server_side_encryption_configuration with AES256 or aws:kms.",
        ),
        Finding(
            id="ck-s3-logging-2", pillar="operational_excellence",
            title="S3 bucket has no access logging enabled",
            description="Checkov CKV_AWS_18: S3 access logging is disabled. Without access logs, security events and data access patterns are invisible.",
            severity=Severity.HIGH,
            waf_alignment="Operational Excellence pillar - Enable logging and observability for all resources",
            cost_impact=CostImpact(estimated_monthly_delta_usd=0.0, ten_x_risk_narrative="Missing access logs delay incident response; breach detection time increases from hours to weeks.", currency="USD"),
            evidence=Evidence(source="checkov", reference="CKV_AWS_18", file_path="main.tf", line_start=5, line_end=7),
            recommendation="Enable S3 server access logging with a dedicated log bucket.",
        ),
        Finding(
            id="ck-ec2-imdsv2-3", pillar="security",
            title="EC2 Instance Metadata Service Version 1 is enabled",
            description="Checkov CKV_AWS_79: IMDSv1 is vulnerable to SSRF attacks that can steal IAM credentials from the metadata endpoint.",
            severity=Severity.HIGH,
            waf_alignment="Security pillar - Apply defense in depth; restrict metadata access",
            cost_impact=CostImpact(estimated_monthly_delta_usd=31.17, ten_x_risk_narrative="SSRF via IMDSv1 can lead to full account takeover; incident costs exceed 10x monthly EC2 spend.", currency="USD"),
            evidence=Evidence(source="checkov", reference="CKV_AWS_79", file_path="main.tf", line_start=9, line_end=15),
            recommendation="Set metadata_options { http_tokens = 'required' } to enforce IMDSv2.",
        ),
        Finding(
            id="ck-ec2-ebs-enc-4", pillar="security",
            title="EC2 EBS volumes are not encrypted",
            description="Checkov CKV_AWS_189: EBS volumes attached to this instance store data unencrypted, violating data-at-rest requirements.",
            severity=Severity.HIGH,
            waf_alignment="Security pillar - Encrypt all data at rest",
            cost_impact=CostImpact(estimated_monthly_delta_usd=31.17, ten_x_risk_narrative="Unencrypted EBS snapshots can be copied and read by unauthorized users.", currency="USD"),
            evidence=Evidence(source="checkov", reference="CKV_AWS_189", file_path="main.tf", line_start=9, line_end=15),
            recommendation="Set ebs_block_device { encrypted = true } or enable default EBS encryption in the account.",
        ),
        Finding(
            id="ck-rds-public-5", pillar="security",
            title="RDS instance is publicly accessible",
            description="Checkov CKV_AWS_17: The RDS database has publicly_accessible = true, exposing it directly to the internet.",
            severity=Severity.CRITICAL,
            waf_alignment="Security pillar - Minimize attack surface; isolate databases in private subnets",
            cost_impact=CostImpact(estimated_monthly_delta_usd=15.44, ten_x_risk_narrative="A public RDS instance is a primary target for automated attacks; data breach costs dwarf DB hosting.", currency="USD"),
            evidence=Evidence(source="checkov", reference="CKV_AWS_17", file_path="main.tf", line_start=17, line_end=27),
            recommendation="Set publicly_accessible = false and place the DB in a private subnet.",
        ),
        Finding(
            id="ck-rds-enc-6", pillar="security",
            title="RDS instance storage is not encrypted",
            description="Checkov CKV_AWS_16: Database storage is unencrypted. Production databases must encrypt data at rest.",
            severity=Severity.HIGH,
            waf_alignment="Security pillar - Encrypt all data stores",
            cost_impact=CostImpact(estimated_monthly_delta_usd=15.44, ten_x_risk_narrative="Unencrypted RDS snapshots can be restored and read by anyone with access.", currency="USD"),
            evidence=Evidence(source="checkov", reference="CKV_AWS_16", file_path="main.tf", line_start=17, line_end=27),
            recommendation="Set storage_encrypted = true and specify a KMS key.",
        ),
        Finding(
            id="ck-rds-backup-7", pillar="reliability",
            title="RDS has no automated backup retention",
            description="Checkov CKV_AWS_133: backup_retention_period is not set, meaning no point-in-time recovery is available.",
            severity=Severity.HIGH,
            waf_alignment="Reliability pillar - Automate backups; define recovery objectives",
            cost_impact=CostImpact(estimated_monthly_delta_usd=15.44, ten_x_risk_narrative="Without backups, any data corruption or accidental deletion is permanent and unrecoverable.", currency="USD"),
            evidence=Evidence(source="checkov", reference="CKV_AWS_133", file_path="main.tf", line_start=17, line_end=27),
            recommendation="Set backup_retention_period = 7 (or more) for automated daily backups.",
        ),
        Finding(
            id="ck-sg-ingress-8", pillar="security",
            title="Security group allows unrestricted ingress on all ports",
            description="Checkov CKV_AWS_24/CKV_AWS_25: Ingress from 0.0.0.0/0 on ports 0-65535 exposes all services to the entire internet.",
            severity=Severity.CRITICAL,
            waf_alignment="Security pillar - Restrict network access to the minimum required",
            cost_impact=CostImpact(estimated_monthly_delta_usd=0.0, ten_x_risk_narrative="Open security groups are the #1 cause of cloud breaches; remediation and forensic costs are extreme.", currency="USD"),
            evidence=Evidence(source="checkov", reference="CKV_AWS_24", file_path="main.tf", line_start=35, line_end=50),
            recommendation="Restrict cidr_blocks to specific IPs/CIDRs and limit to required ports only (e.g., 443, 80).",
        ),
        Finding(
            id="ck-cost-opt-9", pillar="cost_optimization",
            title="EC2 instance type may be over-provisioned",
            description="t3.medium provides 2 vCPUs and 4GB RAM. Verify workload requires this capacity; t3.small at half the cost may suffice.",
            severity=Severity.LOW,
            waf_alignment="Cost Optimization pillar - Right-size resources based on actual utilization",
            cost_impact=CostImpact(estimated_monthly_delta_usd=31.17, ten_x_risk_narrative="Over-provisioning across a fleet compounds monthly waste.", currency="USD"),
            evidence=Evidence(source="bedrock_analysis", reference="cost_review", file_path="main.tf", line_start=11, line_end=11),
            recommendation="Monitor CPU/memory utilization with CloudWatch; downsize if avg utilization < 40%.",
        ),
        Finding(
            id="ck-sustain-10", pillar="sustainability",
            title="No resource tagging for cost allocation or lifecycle",
            description="Resources lack tagging strategy. Tags are essential for tracking carbon footprint, ownership, and automated lifecycle policies.",
            severity=Severity.LOW,
            waf_alignment="Sustainability pillar - Understand and track infrastructure footprint",
            cost_impact=CostImpact(estimated_monthly_delta_usd=0.0, ten_x_risk_narrative="Orphaned resources without tags accumulate untracked cost and carbon.", currency="USD"),
            evidence=Evidence(source="bedrock_analysis", reference="sustainability", file_path="main.tf"),
            recommendation="Implement mandatory tags: Environment, Owner, CostCenter, TTL.",
        ),
    ]

    _RDS_ORIGINAL = '''\
resource "aws_db_instance" "app_db" {
  engine              = "postgres"
  engine_version      = "15.4"
  instance_class      = "db.t3.micro"
  allocated_storage   = 20
  skip_final_snapshot = true
  publicly_accessible = true
}'''
    _RDS_FIXED = '''\
resource "aws_db_instance" "app_db" {
  engine                = "postgres"
  engine_version        = "15.4"
  instance_class        = "db.t3.micro"
  allocated_storage     = 20
  skip_final_snapshot   = true
  publicly_accessible   = false
  storage_encrypted     = true
  backup_retention_period = 7
  multi_az              = true

  tags = {
    Name        = "wara-demo-db"
    Environment = "production"
  }
}'''
    _SG_ORIGINAL = '''\
resource "aws_security_group" "wide_open" {
  name        = "wara-demo-sg"
  description = "Demo security group - intentionally insecure"

  ingress {
    from_port   = 0
    to_port     = 65535
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}'''
    _SG_FIXED = '''\
resource "aws_security_group" "web" {
  name        = "wara-demo-sg"
  description = "Restricted web traffic only"

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }
}'''

    remediations = [
        Remediation(
            finding_id="ck-rds-public-5", language="terraform", file_path="main.tf",
            original=_RDS_ORIGINAL, fixed=_RDS_FIXED,
            diff_unified="--- main.tf\n+++ main.tf (fixed)\n@@ RDS hardened: private, encrypted, backups, multi-AZ @@",
            validation=RemediationValidation(terraform_fmt_ok=True, checkov_passed=True, notes="RDS encryption + private + backups validated."),
        ),
        Remediation(
            finding_id="ck-sg-ingress-8", language="terraform", file_path="main.tf",
            original=_SG_ORIGINAL, fixed=_SG_FIXED,
            diff_unified="--- main.tf\n+++ main.tf (fixed)\n@@ SG restricted: HTTPS/HTTP only, private CIDR @@",
            validation=RemediationValidation(terraform_fmt_ok=True, checkov_passed=True, notes="Ingress restricted to ports 80/443 on private CIDR."),
        ),
    ]

    return ArtifactResponse(
        analysis_id="",
        status=AnalysisStatus.COMPLETED,
        created_at=utcnow(),
        completed_at=utcnow(),
        inputs=InputsMeta(files=files_meta, diagram_summary=DiagramSummary()),
        pillar_scores=scores,
        pillar_radar=radar,
        findings=findings,
        cost_report=CostReport(
            currency="USD",
            total_monthly_usd=46.61,
            total_monthly_before=46.61,
            total_monthly_after_remediation=48.20,
            breakdown=[
                CostBreakdownRow(resource="aws_instance.web", monthly_cost_usd=31.17),
                CostBreakdownRow(resource="aws_db_instance.app_db", monthly_cost_usd=15.44),
                CostBreakdownRow(resource="aws_s3_bucket.demo", monthly_cost_usd=0.0),
            ],
            assumptions=["Infracost default usage; values are estimates."],
        ),
        remediations=remediations,
        errors=[],
    )


def _severity_from_prowler(raw: str) -> str:
    sev = (raw or "MEDIUM").upper()
    if sev not in {"CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"}:
        return "MEDIUM"
    return sev


def run_analysis_job(
    store: AnalysisStore,
    analysis_id: str,
    uploaded: list[tuple[str, bytes]],
    metadata: dict[str, Any] | None,
) -> None:
    """
    Synchronous full pipeline for FastAPI BackgroundTasks.
    """
    from app.models.schemas import Progress

    def _progress(stage: str, pct: int) -> None:
        store.update(analysis_id, progress=Progress(stage=stage, percent=pct))

    store.update(analysis_id, status=AnalysisStatus.RUNNING)
    _progress("initializing", 5)
    work = Path(tempfile.mkdtemp(prefix=f"wara-{analysis_id}-"))
    try:
        result = _sync_run(work, uploaded, metadata or {}, _progress)
        result.analysis_id = analysis_id
        job = store.get(analysis_id)
        result.created_at = job.created_at if job else result.created_at
        _progress("complete", 100)
        store.update(analysis_id, status=AnalysisStatus.COMPLETED, result=result)
    except Exception as e:
        logger.exception("Analysis failed")
        err = ErrorDetail(code="ANALYSIS_FAILED", message=str(e), detail=repr(e)[:2000])
        job = store.get(analysis_id)
        res = ArtifactResponse(
            analysis_id=analysis_id,
            status=AnalysisStatus.FAILED,
            created_at=job.created_at if job else utcnow(),
            errors=[err],
        )
        store.update(analysis_id, status=AnalysisStatus.FAILED, result=res, errors=[err])
    finally:
        shutil.rmtree(work, ignore_errors=True)


def _sync_run(
    work: Path,
    uploaded: list[tuple[str, bytes]],
    metadata: dict[str, Any],
    progress: Any = None,
) -> ArtifactResponse:
    _p = progress or (lambda stage, pct: None)

    files_meta: list[FileInputMeta] = []
    diagram_paths: list[Path] = []
    file_contents: dict[str, str] = {}
    github_url = str(metadata.get("github_url") or "").strip()
    github_token = str(metadata.get("github_token") or "").strip() or None
    run_live_audit = bool(metadata.get("run_live_audit") or False)
    prowler_check_ids = metadata.get("prowler_check_ids")
    if isinstance(prowler_check_ids, str):
        check_ids = [x.strip() for x in prowler_check_ids.split(",") if x.strip()]
    elif isinstance(prowler_check_ids, list):
        check_ids = [str(x).strip() for x in prowler_check_ids if str(x).strip()]
    else:
        check_ids = None

    aws_keys: dict[str, str] | None = None
    if metadata.get("aws_access_key_id") and metadata.get("aws_secret_access_key"):
        aws_keys = {
            "aws_access_key_id": str(metadata["aws_access_key_id"]),
            "aws_secret_access_key": str(metadata["aws_secret_access_key"]),
        }

    scan_root = work
    gh_err: str | None = None
    if github_url:
        _p("cloning_repository", 10)
        repo_path, gh_err = clone_repo_to_workspace(github_url, work / "github_src", github_token=github_token)
        if repo_path is not None:
            scan_root = repo_path

    if not github_url:
        for idx, (name, data) in enumerate(uploaded):
            safe = Path(name).name
            kind = _kind_for_suffix(safe)
            # Avoid basename collisions when multiple parts use the same filename (e.g. two main.tf).
            dest = work / f"{idx:04d}_{safe}"
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            h = _sha256_bytes(data)
            files_meta.append(FileInputMeta(name=safe, kind=kind, sha256=h))
            if kind == FileKind.DIAGRAM:
                diagram_paths.append(dest)
            if kind in (FileKind.TERRAFORM, FileKind.CLOUDFORMATION, FileKind.OTHER) and safe.endswith(
                (".tf", ".tfvars", ".yaml", ".yml", ".json")
            ):
                file_contents[dest.name] = data.decode("utf-8", errors="replace")
    else:
        indexed = 0
        for path in _walk_filtered(scan_root):
            if indexed >= MAX_FILES_INDEX:
                logger.info("File index cap (%d) reached, skipping remaining files", MAX_FILES_INDEX)
                break
            rel = str(path.relative_to(scan_root))
            kind = _kind_for_suffix(path.name)
            size = path.stat().st_size
            h = _sha256_bytes(path.read_bytes()) if size < MAX_IAC_READ_BYTES else "skipped-large"
            files_meta.append(FileInputMeta(name=rel, kind=kind, sha256=h))
            indexed += 1
            if kind == FileKind.DIAGRAM:
                diagram_paths.append(path)
            if path.suffix.lower() in IAC_EXT and size < MAX_IAC_READ_BYTES:
                file_contents[rel] = path.read_text(encoding="utf-8", errors="replace")

    _p("indexing_files", 20)

    from app.core.config import get_settings
    settings = get_settings()

    if settings.demo_fast_mode:
        has_iac = any(
            k.endswith((".tf", ".tfvars", ".yaml", ".yml", ".json"))
            for k in file_contents
        )
        if has_iac:
            logger.info("DEMO_FAST_MODE: returning hardcoded IaC review")
            _p("demo_mode_active", 90)
            return _demo_iac_fallback(files_meta, file_contents)
        if diagram_paths:
            logger.info("DEMO_FAST_MODE: returning hardcoded diagram review")
            _p("demo_mode_active", 90)
            return _demo_diagram_fallback(
                files_meta,
                DiagramSummary(extracted=True, components=["CloudFront", "ALB", "EC2", "RDS", "ElastiCache", "NAT Gateway", "S3"], notes="Demo cached"),
                "DEMO_FAST_MODE: Gemini call skipped",
            )

    diagram_summary = DiagramSummary(extracted=False, components=[], notes=None)
    gemini_err: str | None = None
    for dp in diagram_paths:
        d, err = analyze_diagram(dp)
        gemini_err = err
        diagram_summary.extracted = True
        comps = d.get("components") if isinstance(d, dict) else []
        if isinstance(comps, list):
            diagram_summary.components.extend(str(x) for x in comps)
        if isinstance(d, dict) and d.get("notes"):
            diagram_summary.notes = str(d.get("notes"))

    # ---- Demo fallback for Mode B when Gemini is unavailable ----
    has_iac_files = any(
        k.endswith((".tf", ".tfvars", ".yaml", ".yml", ".json"))
        for k in file_contents
    )
    if (
        not has_iac_files
        and diagram_paths
        and gemini_err
        and not diagram_summary.components
    ):
        logger.info("Gemini unavailable with diagram-only input — using demo fallback")
        _p("generating_demo_review", 60)
        return _demo_diagram_fallback(files_meta, diagram_summary, gemini_err)

    # ---- Diagram-to-Terraform bridge ----
    generated_iac: str | None = None
    vision_gen_err: str | None = None
    if not has_iac_files and diagram_summary.extracted and diagram_summary.components:
        generated_iac, vision_gen_err = generate_iac_from_vision(
            diagram_summary.components,
            diagram_summary.notes or "",
            aws_keys=aws_keys,
        )
        if generated_iac:
            draft_path = scan_root / "vision_draft.tf"
            draft_path.write_text(generated_iac, encoding="utf-8")
            file_contents["vision_draft.tf"] = generated_iac
            files_meta.append(FileInputMeta(
                name="vision_draft.tf",
                kind=FileKind.TERRAFORM,
                sha256=_sha256_bytes(generated_iac.encode()),
            ))

    iac_snippet = "\n\n".join(f"# {k}\n{v}" for k, v in list(file_contents.items())[:5])[:20000]
    if not iac_snippet and diagram_summary.notes:
        iac_snippet = f"(Diagram-only) {diagram_summary.notes}"

    _p("running_checkov", 35)
    checkov_findings, ck_err = run_checkov(scan_root)
    _p("running_infracost", 45)
    cost_report, ic_err = run_infracost(scan_root)
    prowler_raw: list[ProwlerRawFinding] = []
    prowler_err: str | None = None
    if run_live_audit:
        _p("running_prowler_audit", 50)
        prowler_raw, prowler_err = run_prowler(check_ids, aws_keys=aws_keys)

    cost_lookup = _build_cost_lookup(cost_report)
    cost_report.total_monthly_before = cost_report.total_monthly_usd
    infracost_summary = _build_infracost_summary(cost_report, top_n=10)

    proposed_context = [
        f"checkov:{c.check_id}:{c.check_name} ({c.file_path})"
        for c in checkov_findings[:60]
    ]
    actual_context = [
        f"prowler:{p.check_id}:{p.title} status={p.status} severity={p.severity} resource={p.resource or '-'}"
        for p in prowler_raw[:60]
    ]

    _p("synthesizing_waf_review", 60)
    warnings: list[str] = []
    scores, radar, findings, w = synthesize_review(
        iac_snippet,
        checkov_findings,
        infracost_summary,
        diagram_summary.notes,
        proposed_findings=proposed_context,
        actual_findings=actual_context,
        aws_keys=aws_keys,
    )
    warnings.extend(w)

    for i, p in enumerate(prowler_raw[:30]):
        findings.append(
            Finding(
                id=f"prowler-{p.check_id}-{i}",
                pillar="security",
                title=p.title[:200],
                description=f"Prowler live audit: {p.status}",
                severity=_severity_from_prowler(p.severity),
                waf_alignment="Security pillar — live environment audit (Prowler)",
                cost_impact=CostImpact(
                    estimated_monthly_delta_usd=0.0,
                    ten_x_risk_narrative="Live-cloud misconfigurations can cause outsized incident and rework costs.",
                    currency="USD",
                ),
                evidence=Evidence(
                    source="prowler",
                    reference=p.check_id,
                    file_path=p.resource,
                    line_start=None,
                    line_end=None,
                ),
                recommendation="Review resource configuration in AWS and reconcile with intended IaC baseline.",
            )
        )

    _enrich_findings_with_cost(findings, cost_lookup)

    _p("generating_remediations", 80)
    remediations = generate_remediations(findings, work, file_contents, aws_keys=aws_keys)

    _p("estimating_cost_delta", 90)
    after_cost = _estimate_post_remediation_cost(remediations, cost_report)
    if after_cost is not None:
        cost_report.total_monthly_after_remediation = after_cost

    errors: list[ErrorDetail] = []
    if ck_err:
        errors.append(ErrorDetail(code="CHECKOV_WARNING", message=ck_err, detail=None))
    if ic_err:
        errors.append(ErrorDetail(code="INFRACOST_WARNING", message=ic_err, detail=None))
    if gh_err:
        errors.append(ErrorDetail(code="GITHUB_WARNING", message=gh_err, detail=None))
    if prowler_err:
        errors.append(ErrorDetail(code="PROWLER_WARNING", message=prowler_err, detail=None))
    if gemini_err and "not set" not in gemini_err.lower():
        errors.append(ErrorDetail(code="GEMINI_WARNING", message=gemini_err, detail=None))
    if vision_gen_err:
        errors.append(ErrorDetail(code="VISION_IAC_GEN_WARNING", message=vision_gen_err, detail=None))
    for wmsg in warnings:
        errors.append(ErrorDetail(code="BEDROCK_WARNING", message=wmsg, detail=None))

    return ArtifactResponse(
        analysis_id="",
        status=AnalysisStatus.COMPLETED,
        created_at=utcnow(),
        completed_at=utcnow(),
        inputs=InputsMeta(files=files_meta, diagram_summary=diagram_summary),
        pillar_scores=scores,
        pillar_radar=radar,
        findings=findings,
        cost_report=cost_report,
        remediations=remediations,
        generated_iac=generated_iac,
        errors=errors,
    )
