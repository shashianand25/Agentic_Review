import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, Shield, DollarSign, Server, Boxes,
  ChevronRight, AlertTriangle, CheckCircle2, CodeXml,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import Shell from '../components/Shell.jsx'
import { getReport, getRecommendation } from '../lib/api.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

function riskColor(score) {
  if (score <= 3) return '#4ade80'
  if (score <= 6) return '#fbbf24'
  return '#ef4444'
}

function severityColor(s) {
  if (s === 'high') return { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' }
  if (s === 'medium') return { color: '#fbbf24', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.2)' }
  return { color: '#888898', bg: 'rgba(136,136,152,0.08)', border: 'rgba(136,136,152,0.2)' }
}

const PIE_COLORS = ['#4ade80', '#60a5fa', '#fbbf24', '#f87171', '#a78bfa', '#34d399', '#fb923c']

const SERVICE_LABELS = {
  ec2: 'EC2 Compute',
  rds_compute: 'RDS Compute',
  rds_storage: 'RDS Storage',
  rds_connections: 'RDS Connections',
  elasticache: 'ElastiCache',
  s3: 'S3 Storage',
  alb: 'Load Balancer',
}

// ─── sub-components ───────────────────────────────────────────────────────────

function KpiCard({ icon: Icon, label, value, sub, valueColor, delay = 0 }) {
  return (
    <div
      className="bg-card border border-border rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
          <Icon className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight leading-none mb-1.5" style={{ color: valueColor || 'var(--foreground)' }}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.fill || p.color }} className="font-semibold">
          {p.name}: ${Number(p.value).toFixed(2)}/mo
        </p>
      ))}
    </div>
  )
}

function SeverityPill({ severity }) {
  const c = severityColor(severity)
  return (
    <span
      className="text-xs rounded-full px-2 py-0.5 border font-medium shrink-0 capitalize"
      style={{ color: c.color, background: c.bg, borderColor: c.border }}
    >
      {severity}
    </span>
  )
}

// ─── skeleton ─────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl h-28 animate-pulse" />
        ))}
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 0.6fr' }}>
        <div className="bg-card border border-border rounded-xl h-64 animate-pulse" />
        <div className="bg-card border border-border rounded-xl h-64 animate-pulse" />
      </div>
    </div>
  )
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [report, setReport] = useState(null)
  const [recommendation, setRecommendation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([getReport(jobId), getRecommendation(jobId)])
      .then(([r, rec]) => { setReport(r); setRecommendation(rec); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [jobId])

  if (loading) return <Shell><Skeleton /></Shell>

  if (error) return (
    <Shell>
      <div className="flex items-center gap-2 p-5 rounded-xl bg-red-500/5 border border-red-500/20">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="text-sm text-red-400">{error}</span>
      </div>
    </Shell>
  )

  const { meta, structure, compute, database, security, pillar_scores = {} } = report
  const { services, total_monthly_usd, estimate_low_usd, estimate_high_usd } = recommendation
  const score = security.risk_score
  const resourceCount = Object.keys(services).length

  // Build pie data
  const pieData = Object.entries(services)
    .map(([key, svc]) => ({
      name: SERVICE_LABELS[key] || svc.name || key,
      value: Number(svc.monthly_usd) || 0,
    }))
    .filter(d => d.value > 0)
    .sort((a, b) => b.value - a.value)

  // Bar chart data
  const barData = [...pieData].slice(0, 6)

  const completeBadge = (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-green-500/20 bg-green-500/10 text-green-400">
      Analysis Complete
    </span>
  )

  return (
    <Shell statusBadge={completeBadge}>

      {/* Page header */}
      <div className="flex items-start justify-between mb-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Overview</h1>
          <p className="text-sm text-muted-foreground mt-1.5 font-mono">
            {meta.repo} · {meta.framework} · {meta.language}
          </p>
        </div>
        <button
          onClick={() => navigate(`/plan/${jobId}`)}
          className="flex items-center gap-1.5 bg-accent text-accent-foreground font-semibold text-sm px-4 py-2 rounded-lg border-0 cursor-pointer hover:opacity-90 transition-opacity duration-150"
        >
          Review plan <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KpiCard
          icon={Shield}
          label="Security Risk"
          value={`${score}/10`}
          sub={`${security.findings_count} finding${security.findings_count !== 1 ? 's' : ''}`}
          valueColor={riskColor(score)}
          delay={0}
        />
        <KpiCard
          icon={DollarSign}
          label="Est. Monthly Cost"
          value={`$${Number(total_monthly_usd).toFixed(0)}`}
          sub={`Range $${estimate_low_usd}–$${estimate_high_usd}`}
          delay={75}
        />
        <KpiCard
          icon={Boxes}
          label="AWS Resources"
          value={resourceCount}
          sub="services provisioned"
          delay={150}
        />
        <KpiCard
          icon={Server}
          label="API Routes"
          value={structure.total_routes}
          sub={`${structure.protected_routes} protected`}
          delay={225}
        />
      </div>

      {/* WAF Pillar Scores */}
      {Object.values(pillar_scores).some(v => v > 0) && (
        <div
          className="bg-card border border-border rounded-xl p-5 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{ animationDelay: '275ms', animationFillMode: 'both' }}
        >
          <p className="text-sm font-semibold text-foreground mb-4">AWS Well-Architected Pillar Scores</p>
          <div className="grid grid-cols-3 gap-x-8 gap-y-4">
            {[
              { key: 'operational_excellence', label: 'Operational Excellence', color: '#60a5fa' },
              { key: 'security',               label: 'Security',               color: '#f87171' },
              { key: 'reliability',            label: 'Reliability',            color: '#4ade80' },
              { key: 'performance_efficiency', label: 'Performance Efficiency', color: '#a78bfa' },
              { key: 'cost_optimization',      label: 'Cost Optimization',      color: '#fbbf24' },
              { key: 'sustainability',         label: 'Sustainability',         color: '#34d399' },
            ].map(({ key, label, color }) => {
              const val = pillar_scores[key] || 0
              return (
                <div key={key}>
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-xs font-bold" style={{ color }}>{val}</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--color-secondary)', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${Math.min(val, 100)}%`, background: color, borderRadius: 3, transition: 'width 1s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main grid */}
      <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: '1fr 0.6fr' }}>

        {/* Cost breakdown chart */}
        <div
          className="bg-card border border-border rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{ animationDelay: '300ms', animationFillMode: 'both' }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Cost breakdown</p>
              <p className="text-xs text-muted-foreground mt-0.5">Monthly estimate per service</p>
            </div>
            <button
              onClick={() => navigate(`/cost/${jobId}`)}
              className="text-xs text-accent flex items-center gap-1 hover:underline bg-transparent border-0 cursor-pointer"
            >
              Full analysis <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 20, left: 80, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} width={78} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="value" name="Cost" radius={[0, 4, 4, 0]}>
                {barData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Cost donut */}
        <div
          className="bg-card border border-border rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{ animationDelay: '350ms', animationFillMode: 'both' }}
        >
          <p className="text-sm font-semibold text-foreground mb-1">Cost share</p>
          <p className="text-xs text-muted-foreground mb-3">By AWS service</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                dataKey="value"
                paddingAngle={2}
              >
                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}/mo`]} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10, color: 'var(--color-muted-foreground)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom grid */}
      <div className="grid grid-cols-2 gap-4">

        {/* App fingerprint */}
        <div
          className="bg-card border border-border rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{ animationDelay: '400ms', animationFillMode: 'both' }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-foreground">Application fingerprint</p>
            <CodeXml className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-2.5">
            {[
              ['Runtime', meta.language],
              ['Framework', meta.framework],
              ['Compute profile', compute.profile.replace('_', '-')],
              ['Avg CPU / request', `${compute.avg_cpu_ms_per_request} ms`],
              ['Memory / request', `${compute.memory_mb_per_request} MB`],
              ['Database', `${database.type} · ${database.orm}`],
              ['DB calls / req', database.avg_calls_per_request.toFixed(1)],
              ['Background workers', structure.has_background_workers ? structure.worker_library : 'None'],
            ].map(([label, value], i, arr) => (
              <div key={label} className={`flex items-center justify-between py-2 ${i < arr.length - 1 ? 'border-b border-border' : ''}`}>
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs font-medium text-foreground font-mono">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Security top findings */}
        <div
          className="bg-card border border-border rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{ animationDelay: '450ms', animationFillMode: 'both' }}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-foreground">Security findings</p>
            <button
              onClick={() => navigate(`/security/${jobId}`)}
              className="text-xs text-accent flex items-center gap-1 hover:underline bg-transparent border-0 cursor-pointer"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Score big number */}
          <div className="flex items-baseline gap-1 mb-4 pb-4 border-b border-border">
            <span className="text-5xl font-black tracking-tight leading-none" style={{ color: riskColor(score) }}>{score}</span>
            <span className="text-lg text-muted-foreground">/10</span>
            <span className="ml-2 text-xs text-muted-foreground">risk score</span>
          </div>

          <div className="space-y-3">
            {security.top_risks.slice(0, 3).map((risk, i) => (
              <div key={i} className="flex items-start gap-2">
                <SeverityPill severity={risk.severity} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground leading-snug">{risk.issue}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{risk.fix}</p>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => navigate(`/services/${jobId}`)}
            className="w-full mt-4 flex items-center justify-center gap-1.5 border border-border text-muted-foreground text-xs rounded-lg py-2 hover:text-foreground hover:border-muted-foreground bg-transparent cursor-pointer transition-all duration-150"
          >
            <Boxes className="w-3.5 h-3.5" />
            View services map
          </button>
        </div>
      </div>
    </Shell>
  )
}
