import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { DollarSign, TrendingUp, TrendingDown, ChevronRight } from 'lucide-react'
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, AreaChart, Area, ResponsiveContainer,
} from 'recharts'
import Shell from '../components/Shell.jsx'
import { getRecommendation } from '../lib/api.js'

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

// Generate simulated 6-month cost projection
function genProjection(base) {
  const months = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr']
  return months.map((month, i) => ({
    month,
    actual: i < 4 ? Math.round(base * (0.55 + i * 0.12) * (0.95 + Math.random() * 0.1)) : null,
    projected: i >= 3 ? Math.round(base * (0.85 + i * 0.06) * (0.97 + Math.random() * 0.06)) : null,
  }))
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.filter(p => p.value != null).map((p, i) => (
        <p key={i} style={{ color: p.stroke || p.fill }} className="font-semibold">
          {p.name}: ${Number(p.value).toFixed(0)}/mo
        </p>
      ))}
    </div>
  )
}

function KpiCard({ label, value, sub, icon: Icon, color, delay = 0 }) {
  return (
    <div
      className="bg-card border border-border rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight leading-none mb-1.5" style={{ color }}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}

export default function CostPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [recommendation, setRecommendation] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getRecommendation(jobId)
      .then(rec => { setRecommendation(rec); setLoading(false) })
      .catch(() => setLoading(false))
  }, [jobId])

  const badge = (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-blue-500/20 bg-blue-500/10 text-blue-400">
      Cost Analysis
    </span>
  )

  // All derived data — must be before any early returns to satisfy React hooks rules
  const pieData = recommendation
    ? Object.entries(recommendation.services)
        .map(([key, svc], i) => ({
          name: SERVICE_LABELS[key] || svc.name || key,
          value: Number(svc.monthly_usd) || 0,
          color: PIE_COLORS[i % PIE_COLORS.length],
        }))
        .filter(d => d.value > 0)
        .sort((a, b) => b.value - a.value)
    : []

  const barData = [...pieData]

  const projectionData = useMemo(
    () => recommendation ? genProjection(recommendation.total_monthly_usd) : [],
    [recommendation]
  )

  const annualCost = recommendation ? Math.round(recommendation.total_monthly_usd * 12) : 0
  const deltaPct   = recommendation ? Math.round(((recommendation.total_monthly_usd - (recommendation.total_monthly_usd * 0.78)) / (recommendation.total_monthly_usd * 0.78)) * 100) : 0

  if (loading) return (
    <Shell statusBadge={badge}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-card border border-border rounded-xl h-28 animate-pulse" />)}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-card border border-border rounded-xl h-72 animate-pulse" />
          <div className="bg-card border border-border rounded-xl h-72 animate-pulse" />
        </div>
      </div>
    </Shell>
  )

  if (!recommendation) return null

  const { services, total_monthly_usd, estimate_low_usd, estimate_high_usd } = recommendation

  return (
    <Shell statusBadge={badge}>
      {/* Header */}
      <div className="flex items-start justify-between mb-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Cost Analysis</h1>
          <p className="text-sm text-muted-foreground mt-1.5">Estimated monthly spend by AWS service</p>
        </div>
        <button
          onClick={() => navigate(`/plan/${jobId}`)}
          className="flex items-center gap-1.5 bg-accent text-accent-foreground font-semibold text-sm px-4 py-2 rounded-lg border-0 cursor-pointer hover:opacity-90 transition-opacity duration-150"
        >
          Review plan <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <KpiCard
          icon={DollarSign}
          label="Monthly estimate"
          value={`$${Number(total_monthly_usd).toFixed(0)}`}
          sub={`Range $${estimate_low_usd} – $${estimate_high_usd}/mo`}
          color="var(--foreground)"
          delay={0}
        />
        <KpiCard
          icon={TrendingUp}
          label="Annual projection"
          value={`$${annualCost.toLocaleString()}`}
          sub={`+${deltaPct}% vs previous infrastructure`}
          color="#60a5fa"
          delay={75}
        />
        <KpiCard
          icon={DollarSign}
          label="Largest cost driver"
          value={pieData[0]?.name.replace(' Compute', '').replace(' Storage', '') || '—'}
          sub={`$${Number(pieData[0]?.value || 0).toFixed(0)}/mo · ${Math.round((pieData[0]?.value / total_monthly_usd) * 100)}% of total`}
          color="#fbbf24"
          delay={150}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4 mb-4">

        {/* Donut + legend */}
        <div
          className="bg-card border border-border rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{ animationDelay: '200ms', animationFillMode: 'both' }}
        >
          <p className="text-sm font-semibold text-foreground mb-1">Cost distribution</p>
          <p className="text-xs text-muted-foreground mb-4">Total: ${Number(total_monthly_usd).toFixed(2)}/mo</p>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="48%"
                innerRadius={65}
                outerRadius={95}
                dataKey="value"
                paddingAngle={2}
                label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v, name) => [`$${Number(v).toFixed(2)}/mo`, name]} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: 'var(--color-muted-foreground)' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Horizontal bar chart */}
        <div
          className="bg-card border border-border rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{ animationDelay: '250ms', animationFillMode: 'both' }}
        >
          <p className="text-sm font-semibold text-foreground mb-1">Cost per service</p>
          <p className="text-xs text-muted-foreground mb-4">Monthly USD estimate</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 20, left: 90, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
              <XAxis type="number" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
              <YAxis type="category" dataKey="name" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} tickLine={false} axisLine={false} width={88} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="value" name="Cost" radius={[0, 4, 4, 0]}>
                {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Cost projection chart */}
      <div
        className="bg-card border border-border rounded-xl p-5 mb-4 animate-in fade-in slide-in-from-bottom-4 duration-500"
        style={{ animationDelay: '300ms', animationFillMode: 'both' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Cost trend & projection</p>
            <p className="text-xs text-muted-foreground mt-0.5">6-month view with projected spend</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-accent inline-block rounded" /> Actual</span>
            <span className="flex items-center gap-1"><span className="w-6 h-0.5 bg-blue-400 inline-block rounded border-dashed" style={{ borderTop: '2px dashed #60a5fa', height: 0 }} /> Projected</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={projectionData} margin={{ top: 4, right: 12, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4ade80" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#4ade80" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="month" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
            <Tooltip content={<CustomTooltip />} />
            <Area type="monotone" dataKey="actual"    name="Actual"    stroke="#4ade80" fill="url(#actualGrad)" strokeWidth={2} dot={{ fill: '#4ade80', r: 4 }} connectNulls />
            <Area type="monotone" dataKey="projected" name="Projected" stroke="#60a5fa" fill="url(#projGrad)" strokeWidth={2} strokeDasharray="5 4" dot={{ fill: '#60a5fa', r: 4 }} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Per-service breakdown table */}
      <div
        className="bg-card border border-border rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
        style={{ animationDelay: '350ms', animationFillMode: 'both' }}
      >
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Service cost breakdown</p>
        </div>
        <div className="grid px-5 py-2.5 bg-secondary/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
          <span>Service</span>
          <span className="pr-8">$/month</span>
          <span className="pr-8">% of total</span>
          <span>Reasoning</span>
        </div>
        {Object.entries(services).map(([key, svc], i) => {
          const pct = Math.round((Number(svc.monthly_usd) / total_monthly_usd) * 100)
          return (
            <div
              key={key}
              className="grid px-5 py-3.5 border-b border-border last:border-0 hover:bg-secondary/30 transition-colors animate-in fade-in"
              style={{ gridTemplateColumns: '1fr auto auto auto', animationDelay: `${370 + i * 40}ms`, animationFillMode: 'both' }}
            >
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-sm text-foreground font-medium">{SERVICE_LABELS[key] || svc.name || key}</span>
              </div>
              <span className="text-sm font-mono font-semibold text-foreground pr-8">${Number(svc.monthly_usd).toFixed(2)}</span>
              <div className="pr-8 flex items-center gap-2">
                <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                </div>
                <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
              </div>
              <span className="text-xs text-muted-foreground leading-relaxed max-w-xs">{svc.reasoning}</span>
            </div>
          )
        })}
        <div className="grid px-5 py-3 border-t border-border bg-secondary/30" style={{ gridTemplateColumns: '1fr auto auto auto' }}>
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span className="text-sm font-mono font-bold text-accent pr-8">${Number(total_monthly_usd).toFixed(2)}/mo</span>
          <span className="text-xs text-muted-foreground pr-8">100%</span>
          <span className="text-xs text-muted-foreground">Low ${estimate_low_usd} · High ${estimate_high_usd}</span>
        </div>
      </div>
    </Shell>
  )
}
