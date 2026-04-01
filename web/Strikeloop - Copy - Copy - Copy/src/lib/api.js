import { mockRunResponse, mockStatusResponse, getMockStatus, mockReportResponse, mockRecommendationResponse, mockIaCResponse, mockPlan, mockLiveResponse } from './mockData.js'

const API_BASE = 'http://localhost:8000'
const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true'

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function runAnalysis({ github_url, branch, expected_users, requests_per_user_per_day, description }) {
  if (USE_MOCK) {
    await delay(400)
    return mockRunResponse
  }
  const res = await fetch(`${API_BASE}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ github_url, branch, expected_users, requests_per_user_per_day, description }),
  })
  if (!res.ok) throw new Error(`Run failed: ${res.status}`)
  return res.json()
}

export async function getStatus(jobId) {
  if (USE_MOCK) {
    await delay(200)
    return mockStatusResponse
  }
  const res = await fetch(`${API_BASE}/api/status/${jobId}`)
  if (!res.ok) throw new Error(`Status failed: ${res.status}`)
  return res.json()
}

export async function getJobStatus(jobId) {
  if (USE_MOCK) {
    await delay(600)
    return getMockStatus()
  }
  const res = await fetch(`${API_BASE}/api/status/${jobId}`)
  if (!res.ok) throw new Error(`Status failed: ${res.status}`)
  return res.json()
}

export async function getReport(jobId) {
  if (USE_MOCK) {
    await delay(300)
    return mockReportResponse
  }
  const res = await fetch(`${API_BASE}/api/report/${jobId}`)
  if (!res.ok) throw new Error(`Report failed: ${res.status}`)
  return res.json()
}

export async function getRecommendation(jobId) {
  if (USE_MOCK) {
    await delay(350)
    return mockRecommendationResponse
  }
  const res = await fetch(`${API_BASE}/api/recommendation/${jobId}`)
  if (!res.ok) throw new Error(`Recommendation failed: ${res.status}`)
  return res.json()
}

export async function getIaC(jobId) {
  if (USE_MOCK) {
    await delay(300)
    return mockIaCResponse
  }
  const res = await fetch(`${API_BASE}/api/iac/${jobId}`)
  if (!res.ok) throw new Error(`IaC failed: ${res.status}`)
  return res.json()
}

export async function getPlan(jobId) {
  if (USE_MOCK) {
    await delay(350)
    return mockPlan
  }
  const res = await fetch(`${API_BASE}/api/plan/${jobId}`)
  if (!res.ok) throw new Error(`Plan failed: ${res.status}`)
  return res.json()
}

export async function approvePlan(jobId, decision, note) {
  if (USE_MOCK) {
    await delay(1200)
    return { status: 'accepted' }
  }
  const res = await fetch(`${API_BASE}/api/approve/${jobId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, note }),
  })
  if (!res.ok) throw new Error(`Approve failed: ${res.status}`)
  return res.json()
}

export async function approveplan(jobId, { decision, note }) {
  if (USE_MOCK) {
    await delay(300)
    return { status: 'ok' }
  }
  const res = await fetch(`${API_BASE}/api/approve/${jobId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, note }),
  })
  if (!res.ok) throw new Error(`Approve failed: ${res.status}`)
  return res.json()
}

export async function approveAgentProposal(proposalId, decision, note) {
  if (USE_MOCK) {
    await delay(350)
    return { status: decision === 'approve' ? 'approved' : 'rejected' }
  }

  const res = await fetch(`${API_BASE}/api/approve/${proposalId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision, note }),
  })

  if (!res.ok) throw new Error(`Proposal decision failed: ${res.status}`)
  return res.json()
}

export async function getLiveMetrics() {
  if (USE_MOCK) {
    await delay(200)
    return mockLiveResponse
  }
  const res = await fetch(`${API_BASE}/api/live`)
  if (!res.ok) throw new Error(`Live metrics failed: ${res.status}`)
  return res.json()
}
