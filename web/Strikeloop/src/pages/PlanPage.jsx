import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Plus, Edit2, Trash2, CheckCircle2, XCircle, MessageSquare,
  ChevronRight, DollarSign, AlertTriangle, AlertCircle, Loader2,
} from 'lucide-react'
import Shell from '../components/Shell.jsx'
import { getPlan, approvePlan } from '../lib/api.js'

// ── helpers ───────────────────────────────────────────────────────────────────

const ACTION_META = {
  create:  { icon: Plus,   color: '#22C55E', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)' },
  modify:  { icon: Edit2,  color: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.2)' },
  destroy: { icon: Trash2, color: '#EF4444', bg: 'rgba(239,68,68,0.08)',   border: 'rgba(239,68,68,0.2)' },
}

function DiffViewer({ diff }) {
  if (!diff || !diff.trim()) return (
    <p style={{ fontSize: 11, color: '#52525B', fontStyle: 'italic', padding: '4px 12px' }}>No diff available for this remediation.</p>
  )
  const lines = diff.split('\n')
  return (
    <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, lineHeight: 1.6, overflowX: 'auto', borderRadius: 6, background: '#0A0A0A', border: '1px solid #1c1c1c' }}>
      {lines.map((line, i) => {
        let color = '#71717A'
        let bg = 'transparent'
        if (line.startsWith('+++') || line.startsWith('---')) { color = '#A1A1AA' }
        else if (line.startsWith('+')) { color = '#4ade80'; bg = 'rgba(74,222,128,0.07)' }
        else if (line.startsWith('-')) { color = '#f87171'; bg = 'rgba(248,113,113,0.07)' }
        else if (line.startsWith('@@')) { color = '#60a5fa'; bg = 'rgba(96,165,250,0.07)' }
        return (
          <div key={i} style={{ color, background: bg, padding: '1px 12px', whiteSpace: 'pre' }}>
            {line || ' '}
          </div>
        )
      })}
    </div>
  )
}

function ActionPill({ action }) {
  const m = ACTION_META[action] || ACTION_META.create
  return (
    <span style={{
      background: m.bg, border: `1px solid ${m.border}`, color: m.color,
      borderRadius: 999, fontSize: 11, padding: '2px 8px', flexShrink: 0,
    }}>
      {action}
    </span>
  )
}

// ── skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  const block = (w, h, mb = 8) => (
    <div style={{
      width: w, height: h, marginBottom: mb,
      background: '#111111', borderRadius: 6,
    }} className="animate-pulse" />
  )
  return (
    <div>
      {block('50%', 32, 8)}
      {block('70%', 16, 32)}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={{ background: '#111111', borderRadius: 12, height: 80 }} className="animate-pulse" />
        <div style={{ background: '#111111', borderRadius: 12, height: 80 }} className="animate-pulse" />
        <div style={{ background: '#111111', borderRadius: 12, height: 80 }} className="animate-pulse" />
      </div>
      {block('100%', 88, 12)}
      {block('100%', 120, 12)}
      {block('100%', 280, 0)}
    </div>
  )
}

// ── diff stat card ────────────────────────────────────────────────────────────

function StatCard({ count, label, color, Icon }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className="text-2xl font-bold tracking-tight leading-none" style={{ color }}>
          {count}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

const statusBadge = (
  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-yellow-500/20 bg-yellow-500/10 text-yellow-400">
    Ready to apply
  </span>
)

export default function PlanPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()

  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(null)
  const [expandedDiffs, setExpandedDiffs] = useState({})

  function toggleDiff(i) {
    setExpandedDiffs(prev => ({ ...prev, [i]: !prev[i] }))
  }

  const [approving, setApproving] = useState(false)
  const [suggestion, setSuggestion] = useState('')
  const [suggestionSent, setSuggestionSent] = useState(false)

  useEffect(() => {
    getPlan(jobId)
      .then(data => { setPlan(data); setLoading(false) })
      .catch(err => { setFetchError(err.message || 'Failed to load plan'); setLoading(false) })
  }, [jobId])

  async function handleApprove() {
    if (approving) return
    setApproving(true)
    try {
      await approvePlan(jobId, 'approve')
      navigate('/monitor')
    } catch {
      setApproving(false)
    }
  }

  async function handleSendSuggestion() {
    if (!suggestion.trim()) return
    await approvePlan(jobId, 'reject', suggestion.trim())
    setSuggestionSent(true)
  }

  const deltaCost = plan?.cost_delta_usd ?? 0
  const deltaPositive = deltaCost >= 0

  return (
    <Shell statusBadge={statusBadge}>
      {/* Error */}
      {fetchError && (
        <div style={{
          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 12, padding: 20, marginBottom: 24,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <AlertCircle size={16} color="#EF4444" />
          <span style={{ fontSize: 14, color: '#EF4444' }}>{fetchError}</span>
        </div>
      )}

      {loading && <Skeleton />}

      {!loading && plan && (
        <>
          {/* Heading */}
          <div className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-3xl font-semibold text-foreground tracking-tight leading-tight">
              Infrastructure plan
            </h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              Review every change before anything is applied to your AWS account.
            </p>
          </div>

          {/* Diff summary strip */}
          <div className="grid grid-cols-3 gap-3 mb-3">
            <StatCard count={plan.resources_to_create}  label="resources to create"  color="#22C55E" Icon={Plus} />
            <StatCard count={plan.resources_to_modify}  label="resources to modify"  color="#F59E0B" Icon={Edit2} />
            <StatCard count={plan.resources_to_destroy} label="resources to destroy" color="#EF4444" Icon={Trash2} />
          </div>

          {/* Cost delta card */}
          <div className="bg-card border border-border rounded-xl p-5 mb-3 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
            <div className="flex items-center justify-center gap-6">
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">Current</p>
                <span className="text-xl font-semibold text-muted-foreground">${plan.current_monthly_usd}/mo</span>
              </div>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
              <div className="text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-widest mb-1">After</p>
                <span className="text-2xl font-bold text-foreground">${plan.proposed_monthly_usd}/mo</span>
              </div>
            </div>

            {/* Delta badge */}
            <div className="flex justify-center mt-4">
              <span
                className="flex items-center gap-1 text-xs rounded-full px-3 py-1 border font-medium"
                style={{
                  background: deltaPositive ? 'rgba(251,191,36,0.08)' : 'rgba(74,222,128,0.08)',
                  borderColor: deltaPositive ? 'rgba(251,191,36,0.2)' : 'rgba(74,222,128,0.2)',
                  color: deltaPositive ? '#fbbf24' : '#4ade80',
                }}
              >
                <DollarSign className="w-3 h-3" />
                {deltaPositive ? '+' : '-'}${Math.abs(deltaCost)}/mo
              </span>
            </div>
          </div>

          {/* AI reasoning card */}
          <div className="bg-card border border-border rounded-xl p-5 mb-3 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2">AI reasoning</p>
            <p className="text-sm text-muted-foreground leading-relaxed">{plan.reasoning}</p>
          </div>

          {/* Resource list */}
          <div className="bg-card border border-border rounded-xl overflow-hidden mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
            {/* List header */}
            <div className="px-5 py-4 border-b border-border">
              <span className="text-sm font-semibold text-foreground">Resources in this plan</span>
            </div>

            {/* Rows */}
            {plan.resources.map((res, i) => {
              const resMeta = ACTION_META[res.action] || ACTION_META.create
              const ActionIcon = resMeta.icon
              const isLast = i === plan.resources.length - 1
              const hasDiff = res.diff_unified && res.diff_unified.trim()
              const isExpanded = expandedDiffs[i]
              const isValidated = res.validation?.checkov_passed || res.validation?.terraform_fmt_ok
              return (
                <div
                  key={res.name}
                  className={isLast ? '' : 'border-b border-border'}
                >
                  <div
                    className={`flex items-center gap-3 px-5 py-3 transition-colors duration-100 hover:bg-secondary/30 ${hasDiff ? 'cursor-pointer' : ''}`}
                    onClick={() => hasDiff && toggleDiff(i)}
                  >
                    <ActionIcon className="w-4 h-4 shrink-0" style={{ color: resMeta.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-sm text-foreground truncate">{res.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground">{res.description}</p>
                        {isValidated && (
                          <span style={{ fontSize: 10, color: '#4ade80', fontWeight: 600 }}>✓ validated</span>
                        )}
                      </div>
                    </div>
                    <ActionPill action={res.action} />
                    {hasDiff && (
                      <span className="text-xs text-muted-foreground ml-1 select-none">{isExpanded ? '▲' : '▼'}</span>
                    )}
                  </div>
                  {hasDiff && isExpanded && (
                    <div className="px-5 pb-4 pt-2 border-t border-border/40" style={{ background: 'rgba(0,0,0,0.2)' }}>
                      <p className="text-xs text-muted-foreground mb-2 font-mono">{res.file_path || 'patch'}</p>
                      <DiffViewer diff={res.diff_unified} />
                      {res.validation?.notes && (
                        <p className="text-xs text-muted-foreground mt-2 italic">{res.validation.notes}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Approval controls */}
          <div className="flex flex-col gap-2">
            {/* Approve */}
            <button
              onClick={handleApprove}
              disabled={approving}
              className="w-full flex items-center justify-center gap-1.5 bg-primary text-primary-foreground border-0 rounded-xl py-3 px-6 text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity duration-150 min-h-[48px]"
              style={{ opacity: approving ? 0.7 : 1 }}
            >
              {approving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Applying…
                </>
              ) : (
                <>
                  Approve and apply
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Reject */}
            <button
              onClick={() => navigate(`/report/${jobId}`)}
              className="w-full text-muted-foreground border border-border rounded-xl py-3 px-6 text-sm font-medium cursor-pointer hover:text-foreground hover:border-muted-foreground bg-transparent transition-all duration-150 min-h-[48px]"
            >
              Go back to report
            </button>

            {/* Suggest alternative */}
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-1.5">Have a different approach in mind?</p>

              {suggestionSent ? (
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                  <span className="text-xs text-muted-foreground">Suggestion sent — the AI will revise the plan.</span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. Can we reduce cost using spot instances?"
                    value={suggestion}
                    onChange={e => setSuggestion(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSendSuggestion()}
                    className="flex-1 bg-transparent border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all duration-200"
                  />
                  <button
                    onClick={handleSendSuggestion}
                    disabled={!suggestion.trim()}
                    className="flex items-center gap-1.5 border border-border rounded-lg px-4 py-2 text-sm bg-transparent transition-all duration-150"
                    style={{
                      color: suggestion.trim() ? 'var(--foreground)' : 'var(--muted-foreground)',
                      cursor: suggestion.trim() ? 'pointer' : 'not-allowed',
                      opacity: suggestion.trim() ? 1 : 0.5,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Send
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Shell>
  )
}
