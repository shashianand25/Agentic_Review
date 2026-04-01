import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Lock, Server, Globe, FileCode, TrendingUp } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadialBarChart, RadialBar, PieChart, Pie, Cell,
} from 'recharts'
import Shell from '../components/Shell.jsx'
import { getReport } from '../lib/api.js'

function riskColor(score) {
  if (score <= 3) return '#4ade80'
  if (score <= 6) return '#fbbf24'
  return '#ef4444'
}

function severityMeta(s) {
  if (s === 'critical') return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', label: 'Critical' }
  if (s === 'high')     return { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)',  label: 'High' }
  if (s === 'medium')   return { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)', label: 'Medium' }
  if (s === 'info')     return { color: '#60a5fa', bg: 'rgba(96,165,250,0.08)', border: 'rgba(96,165,250,0.2)', label: 'Info' }
  return { color: '#888898', bg: 'rgba(136,136,152,0.08)', border: 'rgba(136,136,152,0.2)', label: 'Low' }
}

function SeverityPill({ severity }) {
  const m = severityMeta(severity)
  return (
    <span className="text-xs rounded-full px-2.5 py-1 border font-semibold capitalize shrink-0"
      style={{ color: m.color, background: m.bg, borderColor: m.border }}>
      {m.label}
    </span>
  )
}

function PillarBadge({ pillar }) {
  if (!pillar) return null
  const label = pillar.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  return (
    <span style={{
      background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)',
      color: '#93c5fd', borderRadius: 999, fontSize: 10, padding: '2px 8px', fontWeight: 500,
    }}>
      {label}
    </span>
  )
}

function FlagCard({ icon: Icon, title, description, delay = 0 }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 animate-in fade-in slide-in-from-bottom-4 duration-500"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}>
      <Icon className="w-4 h-4 text-warning shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-warning">{title}</p>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
      </div>
    </div>
  )
}

export default function SecurityPage() {
  const { jobId } = useParams()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    getReport(jobId).then(r => { setReport(r); setLoading(false) }).catch(() => setLoading(false))
  }, [jobId])

  function toggleExpand(i) {
    setExpanded(prev => ({ ...prev, [i]: !prev[i] }))
  }

  const badge = (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-yellow-500/20 bg-yellow-500/10 text-yellow-400">
      Static Analysis
    </span>
  )

  if (loading) return (
    <Shell statusBadge={badge}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-card border border-border rounded-xl h-32 animate-pulse" />)}
        </div>
        <div className="bg-card border border-border rounded-xl h-64 animate-pulse" />
      </div>
    </Shell>
  )

  if (!report) return null

  const { security, meta } = report
  const score = security.risk_score
  const highCount = security.top_risks.filter(r => r.severity === 'high' || r.severity === 'critical').length
  const medCount  = security.top_risks.filter(r => r.severity === 'medium').length
  const lowCount  = security.top_risks.filter(r => r.severity === 'low' || r.severity === 'info').length

  const barData = [
    { label: 'High',   count: highCount, fill: '#ef4444' },
    { label: 'Medium', count: medCount,  fill: '#fbbf24' },
    { label: 'Low',    count: lowCount,  fill: '#888898' },
  ]
  const pieData = barData.filter(d => d.count > 0)
  const gaugeData = [{ name: 'Score', value: score * 10, fill: riskColor(score) }]
  const riskLabel = score <= 3 ? 'Low Risk' : score <= 6 ? 'Moderate Risk' : 'High Risk'

  return (
    <Shell statusBadge={badge}>
      {/* Header */}
      <div className="flex items-start justify-between mb-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Security</h1>
          <p className="text-sm text-muted-foreground mt-1.5 font-mono">{meta.repo}</p>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: '0.7fr 1fr 0.7fr' }}>
        {/* Score gauge */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Risk Score</p>
          <div className="relative w-40 h-40">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart innerRadius="70%" outerRadius="100%" startAngle={90} endAngle={-270} data={gaugeData}>
                <RadialBar background={{ fill: 'var(--color-secondary)' }} dataKey="value" cornerRadius={8} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-black leading-none" style={{ color: riskColor(score) }}>{score}</span>
              <span className="text-sm text-muted-foreground">/10</span>
            </div>
          </div>
          <p className="mt-3 text-sm font-semibold" style={{ color: riskColor(score) }}>{riskLabel}</p>
          <p className="text-xs text-muted-foreground mt-1">{security.findings_count} total finding{security.findings_count !== 1 ? 's' : ''}</p>
        </div>

        {/* Bar chart */}
        <div className="bg-card border border-border rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '75ms', animationFillMode: 'both' }}>
          <p className="text-sm font-semibold text-foreground mb-1">Findings by severity</p>
          <p className="text-xs text-muted-foreground mb-4">Static analysis results</p>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="count" name="Findings" radius={[4, 4, 0, 0]}>
                {barData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Pie */}
        <div className="bg-card border border-border rounded-xl p-5 flex flex-col items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '150ms', animationFillMode: 'both' }}>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">Distribution</p>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="count" paddingAngle={3}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                </Pie>
                <Tooltip formatter={v => [v, 'findings']} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <CheckCircle2 className="w-16 h-16 text-green-400" />
          )}
          <div className="flex gap-3 mt-2">
            {barData.map(d => d.count > 0 && (
              <div key={d.label} className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="w-2 h-2 rounded-full" style={{ background: d.fill }} />
                {d.label}: {d.count}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Findings list — expandable */}
      <div className="bg-card border border-border rounded-xl overflow-hidden mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms', animationFillMode: 'both' }}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground">Security findings</p>
          <span className="text-xs text-muted-foreground">{security.top_risks.length} items · click to expand</span>
        </div>

        {security.top_risks.map((risk, i) => {
          const m = severityMeta(risk.severity)
          const isOpen = expanded[i]
          const hasDelta = risk.estimated_monthly_delta_usd > 0

          return (
            <div key={i} className="border-b border-border last:border-0 animate-in fade-in slide-in-from-left-2" style={{ animationDelay: `${220 + i * 40}ms`, animationFillMode: 'both' }}>

              {/* Always‑visible row */}
              <div className="flex items-start gap-4 px-5 py-4 hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => toggleExpand(i)}>
                <div className="mt-0.5 shrink-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: m.bg, border: `1px solid ${m.border}` }}>
                    <AlertTriangle className="w-3.5 h-3.5" style={{ color: m.color }} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <SeverityPill severity={risk.severity} />
                    {risk.pillar && <PillarBadge pillar={risk.pillar} />}
                    <p className="text-sm font-semibold text-foreground leading-snug">{risk.issue}</p>
                  </div>
                  {risk.description && risk.description !== risk.issue && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{risk.description}</p>
                  )}
                  {risk.waf_alignment && (
                    <p className="text-xs mt-1" style={{ color: '#93c5fd', opacity: 0.85 }}>📐 {risk.waf_alignment}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground shrink-0 mt-1 select-none">{isOpen ? '▲' : '▼'}</span>
              </div>

              {/* Expanded details */}
              {isOpen && (
                <div className="px-5 pb-5 pt-3 space-y-3 border-t border-border/40" style={{ background: 'rgba(255,255,255,0.015)' }}>

                  {/* Recommendation */}
                  {risk.fix && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Recommendation</p>
                      <p className="text-xs text-foreground leading-relaxed">{risk.fix}</p>
                    </div>
                  )}

                  {/* Evidence badges */}
                  {(risk.evidence_file || risk.evidence_source || hasDelta) && (
                    <div className="flex items-center gap-2 flex-wrap">
                      {risk.evidence_source && (
                        <span style={{ background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.2)', color: '#c084fc', borderRadius: 4, fontSize: 10, padding: '2px 7px', fontFamily: 'monospace' }}>
                          {risk.evidence_source}
                        </span>
                      )}
                      {risk.evidence_file && (
                        <span style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.2)', color: '#93c5fd', borderRadius: 4, fontSize: 10, padding: '2px 7px', fontFamily: 'monospace' }}>
                          <FileCode size={9} style={{ display: 'inline', marginRight: 3 }} />
                          {risk.evidence_file}
                          {risk.evidence_line_start != null && `:${risk.evidence_line_start}`}
                          {risk.evidence_line_end != null && risk.evidence_line_end !== risk.evidence_line_start && `-${risk.evidence_line_end}`}
                        </span>
                      )}
                      {hasDelta && (
                        <span style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', color: '#fbbf24', borderRadius: 4, fontSize: 10, padding: '2px 7px' }}>
                          +${risk.estimated_monthly_delta_usd.toFixed(2)}/mo risk
                        </span>
                      )}
                    </div>
                  )}

                  {/* 10× risk narrative */}
                  {risk.ten_x_risk_narrative && (
                    <div style={{ background: 'rgba(251,191,36,0.05)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: 8, padding: '8px 12px' }}>
                      <p className="text-xs font-semibold mb-1" style={{ color: '#fbbf24' }}>
                        <TrendingUp size={10} style={{ display: 'inline', marginRight: 4 }} />
                        10× Risk
                      </p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{risk.ten_x_risk_narrative}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Infrastructure flags */}
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">Infrastructure flags</p>
      <div className="grid grid-cols-1 gap-3">
        {security.needs_secrets_manager && (
          <FlagCard icon={Lock} title="AWS Secrets Manager required" description="Credentials detected in source code. Rotate all secrets and store them in AWS Secrets Manager before deployment." delay={300} />
        )}
        {security.needs_vpc_private_subnet && (
          <FlagCard icon={Server} title="Private subnet required" description="RDS and ElastiCache must be placed in private subnets — not accessible from the public internet." delay={350} />
        )}
        {security.needs_waf && (
          <FlagCard icon={Globe} title="WAF recommended" description="Attach AWS WAF to the Application Load Balancer to protect against common web exploits and bots." delay={400} />
        )}
        {!security.needs_secrets_manager && !security.needs_vpc_private_subnet && !security.needs_waf && (
          <div className="flex items-center gap-3 p-4 rounded-xl border border-green-500/20 bg-green-500/5">
            <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
            <p className="text-sm text-green-400">No critical infrastructure flags detected.</p>
          </div>
        )}
      </div>
    </Shell>
  )
}
