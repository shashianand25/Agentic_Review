import { mockRunResponse, mockStatusResponse, getMockStatus, mockReportResponse, mockRecommendationResponse, mockIaCResponse, mockPlan, mockLiveResponse } from './mockData.js'

const API_BASE = 'http://localhost:8000'
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Validate AWS credentials against STS GetCallerIdentity.
 * Returns { valid, account_id, arn, error }
 */
export async function validateAwsCredentials({ aws_access_key_id, aws_secret_access_key }) {
  if (USE_MOCK) {
    await delay(400)
    return { valid: true, account_id: '123456789012', arn: 'arn:aws:iam::123456789012:user/demo', error: null }
  }

  const res = await fetch(`${API_BASE}/api/v1/validate-aws`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ aws_access_key_id, aws_secret_access_key }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Validation request failed (${res.status}): ${text}`)
  }

  return res.json()
}

export async function runDiagramAnalysis({ file, aws_access_key_id, aws_secret_access_key }) {
  if (USE_MOCK) {
    await delay(600)
    return mockRunResponse
  }

  const formData = new FormData()
  formData.append('files', file, file.name)
  formData.append('run_live_audit', 'false')
  if (aws_access_key_id) formData.append('aws_access_key_id', aws_access_key_id)
  if (aws_secret_access_key) formData.append('aws_secret_access_key', aws_secret_access_key)

  const res = await fetch(`${API_BASE}/api/v1/analyze`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) throw new Error(`Diagram analysis failed: ${res.status}`)
  const data = await res.json()
  return { job_id: data.analysis_id }
}

export async function runAnalysis({ github_url, aws_access_key_id, aws_secret_access_key }) {
  if (USE_MOCK) {
    await delay(400)
    return mockRunResponse
  }

  const formData = new FormData()

  // If user types Demo or it's a dummy value, upload a dummy main.tf to trigger fast mode
  if (!github_url || github_url.toLowerCase().includes('demo') || github_url.toLowerCase().includes('dummy')) {
    const dummyTf = `resource "aws_db_instance" "app_db" { engine="postgres" publicly_accessible=true }`
    const blob = new Blob([dummyTf], { type: 'application/octet-stream' })
    formData.append("files", blob, "main.tf")
    formData.append("run_live_audit", "false")
  } else {
    formData.append("github_url", github_url)
    // Enable live audit when real AWS credentials are provided
    const hasRealKeys = aws_access_key_id && aws_secret_access_key
    formData.append("run_live_audit", hasRealKeys ? "true" : "false")
  }

  if (aws_access_key_id) formData.append("aws_access_key_id", aws_access_key_id)
  if (aws_secret_access_key) formData.append("aws_secret_access_key", aws_secret_access_key)

  const res = await fetch(`${API_BASE}/api/v1/analyze`, {
    method: "POST",
    body: formData
  })

  if (!res.ok) throw new Error(`Run failed: ${res.status}`)

  const data = await res.json()

  return {
    job_id: data.analysis_id
  }
}

/**
 * Poll the real backend for job status.
 * Returns a normalised object the AnalysisPage understands.
 */
export async function getStatus(jobId) {
  if (USE_MOCK) {
    await delay(200)
    return mockStatusResponse
  }

  const res = await fetch(`${API_BASE}/api/v1/artifacts/${jobId}`)
  if (!res.ok) throw new Error(`Status failed: ${res.status}`)
  const data = await res.json()

  const isDone = data.status === "completed"
  const isFailed = data.status === "failed" || data.status === "error"

  return {
    status: isDone ? "done" : isFailed ? "error" : "running",
    stage: isDone ? 6 : 3,
    message: isDone ? "Analysis completed" : "Processing infrastructure...",
    stageMessages: {
      1: "Validating input",
      2: "Scanning files",
      3: "Processing infrastructure...",
      4: "Evaluating architecture decisions",
      5: "Generating IAC patches",
      6: "Finalizing report"
    },
    elapsedSeconds: 0,
    error: isFailed ? (data.error || "Job failed") : null,
    isLoading: false,
    raw: data
  }
}

export async function getJobStatus(jobId) {
  if (USE_MOCK) {
    await delay(600)
    return getMockStatus()
  }

  const res = await fetch(`${API_BASE}/api/v1/artifacts/${jobId}`)
  if (!res.ok) throw new Error(`Status failed: ${res.status}`)
  const data = await res.json()

  // Map true backend status to frontend expectations
  const isDone = data.status === "completed"
  const isFailed = data.status === "failed" || data.status === "error"

  return {
    status: isDone ? "done" : isFailed ? "error" : "running",
    stage: isDone ? 6 : 3,
    message: isDone ? "Analysis completed" : "Processing infrastructure...",
    stageMessages: {
      1: "Validating input",
      2: "Scanning files",
      3: "Processing infrastructure...",
      4: "Evaluating architecture decisions",
      5: "Generating IAC patches",
      6: "Finalizing report"
    },
    elapsedSeconds: 0,
    error: isFailed ? (data.error || "Job failed") : null,
    isLoading: false,
    raw: data
  }
}

export async function getReport(jobId) {
  if (USE_MOCK) {
    await delay(300)
    return mockReportResponse
  }

  const res = await fetch(`${API_BASE}/api/v1/artifacts/${jobId}`)
  const data = await res.json()

  const safeScores = data.pillar_scores || {}
  const items = data.findings || []

  return {
    meta: {
      repo: data.inputs?.github_url || "Uploaded Files",
      language: "Terraform",
      framework: "AWS"
    },
    structure: {
      total_routes: items.length * 2 || 14,
      protected_routes: items.length || 11,
      has_background_workers: false,
      worker_library: 'None',
    },
    compute: {
      profile: 'io_bound',
      avg_cpu_ms_per_request: 12,
      memory_mb_per_request: 8,
      heavy_functions: ['N/A'],
    },
    database: {
      type: 'Detected DB',
      orm: 'Native',
      avg_calls_per_request: 2.1,
      read_write_ratio: 0.8,
      has_transactions: true,
      raw_sql_detected: false,
    },
    security: {
      risk_score: safeScores.security !== undefined ? Math.round(safeScores.security / 10) : 3,
      findings_count: items.length,
      top_risks: items.map(f => ({
        title: f.title,
        severity: (f.severity || 'medium').toLowerCase(),
        issue: f.title,
        fix: f.recommendation || f.description,
        // Full AI-generated fields
        description: f.description || '',
        waf_alignment: f.waf_alignment || '',
        ten_x_risk_narrative: f.cost_impact?.ten_x_risk_narrative || '',
        estimated_monthly_delta_usd: f.cost_impact?.estimated_monthly_delta_usd || 0,
        pillar: typeof f.pillar === 'string' ? f.pillar : (f.pillar?.value || ''),
        evidence_source: f.evidence?.source || '',
        evidence_file: f.evidence?.file_path || '',
        evidence_line_start: f.evidence?.line_start ?? null,
        evidence_line_end: f.evidence?.line_end ?? null,
      }))
    },
    // All 6 WAF pillar scores
    pillar_scores: {
      operational_excellence: safeScores.operational_excellence ?? 0,
      security: safeScores.security ?? 0,
      reliability: safeScores.reliability ?? 0,
      performance_efficiency: safeScores.performance_efficiency ?? 0,
      cost_optimization: safeScores.cost_optimization ?? 0,
      sustainability: safeScores.sustainability ?? 0,
    },
  }
}

export async function getRecommendation(jobId) {
  if (USE_MOCK) {
    await delay(350)
    return mockRecommendationResponse
  }

  const res = await fetch(`${API_BASE}/api/v1/artifacts/${jobId}`)
  const data = await res.json()

  const breakdown = data.cost_report?.breakdown || []
  let services = {}
  
  if (breakdown.length === 0) {
    // fallback if no infra cost returned
    services = {
      default_resource: { monthly_usd: 0, reasoning: 'No infrastructure detected.' }
    }
  } else {
    breakdown.forEach((item, index) => {
      // Create a unique key for the donut chart map
      const key = `resource_${index}`
      services[key] = {
        name: item.resource,
        monthly_usd: item.monthly_cost_usd || 0,
        reasoning: `Resource: ${item.resource}`
      }
    })
  }

  const total = data.cost_report?.total_monthly_usd || 0

  return {
    services,
    total_monthly_usd: total,
    estimate_low_usd: total * 0.9,
    estimate_high_usd: total * 1.15,
    bottleneck_warnings: []
  }
}

export async function getIaC(jobId) {
  if (USE_MOCK) {
    await delay(300)
    return mockIaCResponse
  }

  const res = await fetch(`${API_BASE}/api/v1/artifacts/${jobId}`)
  const data = await res.json()

  return {
    terraform_hcl: data.generated_iac || "# No IaC generated\n# View remediations tab for specific patches",
    resources_count: (data.findings || []).length
  }
}

export async function getPlan(jobId) {
  if (USE_MOCK) {
    await delay(350)
    return mockPlan
  }

  const res = await fetch(`${API_BASE}/api/v1/artifacts/${jobId}`)
  const data = await res.json()
  const remediations = data.remediations || []

  const current = data.cost_report?.total_monthly_usd || 0
  const proposed = data.cost_report?.total_monthly_after_remediation || current

  return {
    changes: remediations,
    resources_to_create: 0,
    resources_to_modify: remediations.length,
    resources_to_destroy: 0,
    current_monthly_usd: current,
    proposed_monthly_usd: proposed,
    cost_delta_usd: parseFloat((proposed - current).toFixed(2)),
    reasoning: "The backend generates targeted diff patches to remediate security findings automatically.",
    resources: remediations.map(r => ({
      name: r.finding_id,
      action: 'modify',
      description: `Fix applied to ${r.file_path || 'file'}`,
      // Full remediation data for diff viewer
      diff_unified: r.diff_unified || '',
      original: r.original || '',
      fixed: r.fixed || '',
      file_path: r.file_path || '',
      language: r.language || 'terraform',
      validation: r.validation || null,
    }))
  }
}

export async function approvePlan(jobId, decision, note) {
  if (USE_MOCK) {
    await delay(1200)
    return { status: 'accepted' }
  }
  return { status: 'accepted' } // Mock approve for now
}

export async function approveplan(jobId, { decision, note }) {
  if (USE_MOCK) {
    await delay(300)
    return { status: 'ok' }
  }
  return { status: 'ok' } // Mock approve for now
}

export async function approveAgentProposal(proposalId, decision, note) {
  if (USE_MOCK) {
    await delay(350)
    return { status: decision === 'approve' ? 'approved' : 'rejected' }
  }
  return { status: decision === 'approve' ? 'approved' : 'rejected' }
}

export async function getLiveMetrics() {
  // Mock live metrics as backend does not support yet
  return mockLiveResponse
}

// ─── GRC Endpoints ─────────────────────────────────────────────────────────────

export async function getRisks(jobId) {
  if (USE_MOCK) return []
  const res = await fetch(`${API_BASE}/api/v1/grc/${jobId}/risks`)
  if (!res.ok) throw new Error('Failed to fetch risks')
  return res.json()
}

export async function updateRisk(jobId, riskId, patch) {
  const res = await fetch(`${API_BASE}/api/v1/grc/${jobId}/risks/${riskId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  })
  if (!res.ok) throw new Error('Failed to update risk')
  return res.json()
}

export async function getCompliance(jobId) {
  if (USE_MOCK) return []
  const res = await fetch(`${API_BASE}/api/v1/grc/${jobId}/compliance`)
  if (!res.ok) throw new Error('Failed to fetch compliance')
  return res.json()
}

export async function updateControl(jobId, controlId, patch) {
  const res = await fetch(`${API_BASE}/api/v1/grc/${jobId}/compliance/${controlId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch)
  })
  if (!res.ok) throw new Error('Failed to update control')
  return res.json()
}

export async function getEvidence(jobId, findingId = '') {
  if (USE_MOCK) return []
  const url = `${API_BASE}/api/v1/grc/${jobId}/evidence${findingId ? `?finding_id=${encodeURIComponent(findingId)}` : ''}`
  const res = await fetch(url)
  if (!res.ok) return []
  return res.json()
}

export async function uploadEvidence(jobId, file, findingId = '', notes = '') {
  const formData = new FormData()
  formData.append('file', file)
  if (findingId) formData.append('finding_id', findingId)
  if (notes) formData.append('notes', notes)

  const res = await fetch(`${API_BASE}/api/v1/grc/${jobId}/evidence`, {
    method: 'POST',
    body: formData
  })
  if (!res.ok) throw new Error('Failed to upload evidence')
  return res.json()
}

