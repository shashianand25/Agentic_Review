import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import Shell from '../components/Shell.jsx'
import AgentProposalCard from '../components/AgentProposalCard.jsx'
import { useLiveMetrics } from '../hooks/useLiveMetrics.js'
import { approveAgentProposal } from '../lib/api.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

function toneColor(tone) {
  if (tone === 'healthy') return '#22C55E'
  if (tone === 'degraded') return '#F59E0B'
  if (tone === 'critical') return '#EF4444'
  return '#52525B'
}

function thresholdTone(value, warnAt, critAt, invert = false) {
  const n = Number(value) || 0
  if (!invert) {
    if (n >= critAt) return 'critical'
    if (n >= warnAt) return 'degraded'
    return 'healthy'
  }
  if (n <= critAt) return 'critical'
  if (n <= warnAt) return 'degraded'
  return 'healthy'
}

function healthLabel(h) {
  if (!h) return 'Unknown'
  return h.charAt(0).toUpperCase() + h.slice(1)
}

function fmt$(v, d = 2) { return `$${Number(v || 0).toFixed(d)}` }

// ─── custom tooltip components ────────────────────────────────────────────────

function TrafficTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#111111', border: '1px solid #2E2E2E', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ margin: 0, fontSize: 11, color: '#52525B', marginBottom: 6 }}>{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ margin: '2px 0', fontSize: 12, color: p.color }}>
          {p.name}: <span style={{ color: '#F5F5F5', fontWeight: 500 }}>{p.value}{p.dataKey === 'rps' ? ' rps' : ' ms'}</span>
        </p>
      ))}
    </div>
  )
}

function CostBarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#111111', border: '1px solid #2E2E2E', borderRadius: 8, padding: '8px 12px' }}>
      <p style={{ margin: 0, fontSize: 11, color: '#52525B' }}>{payload[0]?.payload?.date}</p>
      <p style={{ margin: '4px 0 0', fontSize: 13, color: '#F5F5F5', fontWeight: 500 }}>{fmt$(payload[0]?.value)}</p>
    </div>
  )
}

function DonutTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#111111', border: '1px solid #2E2E2E', borderRadius: 8, padding: '8px 12px' }}>
      <p style={{ margin: 0, fontSize: 12, color: '#A1A1AA' }}>{payload[0].name}</p>
      <p style={{ margin: '3px 0 0', fontSize: 13, color: '#F5F5F5', fontWeight: 500 }}>{fmt$(payload[0].value)}/mo</p>
    </div>
  )
}

function SparkTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#111111', border: '1px solid #2E2E2E', borderRadius: 6, padding: '5px 9px' }}>
      <p style={{ margin: 0, fontSize: 11, color: '#F5F5F5' }}>{payload[0].value}</p>
    </div>
  )
}

// ─── sub-components ───────────────────────────────────────────────────────────

function KpiTile({ label, value, sub, tone }) {
  const color = toneColor(tone)
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">{label}</p>
      <p className="text-2xl font-bold text-foreground tracking-tight leading-none my-2">{value}</p>
      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-xs" style={{ color }}>{sub}</span>
      </div>
    </div>
  )
}

function ServiceHealthCard({ name, primaryLabel, primaryValue, secondaryLabel, secondaryValue, points, tone }) {
  const color = toneColor(tone)
  const sparkData = (points || []).map((v, i) => ({ i, v }))

  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground font-semibold">{name}</span>
        <span
          className="text-xs rounded-full px-2 py-0.5 border capitalize"
          style={{
            color,
            background: tone === 'healthy' ? 'rgba(74,222,128,0.1)' : tone === 'degraded' ? 'rgba(251,191,36,0.1)' : 'rgba(239,68,68,0.1)',
            borderColor: tone === 'healthy' ? 'rgba(74,222,128,0.2)' : tone === 'degraded' ? 'rgba(251,191,36,0.2)' : 'rgba(239,68,68,0.2)',
          }}
        >
          {healthLabel(tone)}
        </span>
      </div>

      <p className="text-2xl font-bold text-foreground tracking-tight leading-tight mb-2.5">{primaryValue}</p>

      <div style={{ height: 48 }}>
        {sparkData.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
              <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              <Tooltip content={<SparkTooltip />} cursor={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full bg-secondary rounded-md" />
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-2">
        {secondaryLabel}: <span className="text-foreground/70">{secondaryValue}</span>
      </p>
    </div>
  )
}

function SectionHeader({ title, description }) {
  return (
    <div className="mb-3.5">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
    </div>
  )
}

const PIE_COLORS = ['#F5F5F5', '#A1A1AA', '#52525B', '#3F3F46', '#27272A']

// ─── main page ────────────────────────────────────────────────────────────────

export default function MonitorPage() {
  const { data, isLoading, error, lastUpdated, refresh } = useLiveMetrics()
  const [proposalDecisions, setProposalDecisions] = useState({})
  const [actionError, setActionError] = useState(null)

  // ── derived tones ───
  const health = data?.health || 'healthy'
  const healthTone = health === 'healthy' ? 'healthy' : health === 'degraded' ? 'degraded' : 'critical'
  const rpsTone     = thresholdTone(data?.rps, 100, 1, true)
  const latencyTone = thresholdTone(data?.p99_latency_ms, 250, 500)
  const errorTone   = thresholdTone(data?.error_rate_pct, 0.5, 2)
  const instTone    = thresholdTone(data?.active_instances, 2, 1, true)
  const ec2Tone     = thresholdTone(data?.services?.ec2?.cpu_pct, 70, 85)
  const rdsTone     = thresholdTone(data?.services?.rds?.connections, 90, 130)
  const cacheTone   = thresholdTone(data?.services?.elasticache?.hit_rate_pct, 90, 75, true)
  const albTone     = thresholdTone(data?.services?.alb?.['5xx_count'], 4, 10)
  const sqsTone     = thresholdTone(data?.services?.sqs?.queue_depth, 30, 80)

  // ── traffic chart data ───
  const trafficData = useMemo(() => {
    return (data?.traffic?.by_hour || []).map(h => ({
      label: h.label,
      rps: h.rps,
      latency: h.latency,
    }))
  }, [data])

  // ── cost bar chart ───
  const costBars = useMemo(() => {
    return (data?.cost?.daily_last_30 || []).map((e, i) => ({
      date: e.date,
      usd: Number(e.usd ?? e.amount ?? 0),
      isToday: i === (data?.cost?.daily_last_30?.length ?? 0) - 1,
    }))
  }, [data])

  // ── cost donut ───
  const costDonutData = useMemo(() => {
    const by = data?.cost?.by_service || {}
    return Object.entries(by).map(([name, value]) => ({ name, value: Number(value) }))
  }, [data])

  // ── service sparkline series ───
  const ec2Series    = data?.services?.ec2?.series        || []
  const rdsSeries    = data?.services?.rds?.series         || []
  const cacheSeries  = data?.services?.elasticache?.series || []
  const albSeries    = data?.services?.alb?.series         || []
  const sqsSeries    = data?.services?.sqs?.series         || []

  // ── proposals ───
  const proposals = data?.agent_proposals || []

  async function handleDecision(proposalId, decision) {
    setActionError(null)
    try {
      await approveAgentProposal(proposalId, decision)
      setProposalDecisions(prev => ({ ...prev, [proposalId]: decision === 'approve' ? 'approved' : 'rejected' }))
    } catch (err) {
      const msg = err.message || 'Failed to update proposal'
      setActionError(msg)
      throw new Error(msg)
    }
  }

  const statusBadge = (
    <span style={{
      border: `1px solid ${healthTone === 'healthy' ? 'rgba(34,197,94,0.25)' : healthTone === 'degraded' ? 'rgba(245,158,11,0.25)' : 'rgba(239,68,68,0.25)'}`,
      background: healthTone === 'healthy' ? 'rgba(34,197,94,0.08)' : healthTone === 'degraded' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)',
      color: toneColor(healthTone),
      borderRadius: 999, fontSize: 11, padding: '2px 10px',
    }}>
      {healthLabel(health)}
    </span>
  )

  return (
    <Shell statusBadge={statusBadge}>
      <div className="max-w-6xl mx-auto">

        {/* ── Page header ─── */}
        <div className="flex items-start justify-between mb-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div>
            <h1 className="text-3xl font-semibold text-foreground tracking-tight leading-tight">
              Live monitoring
            </h1>
            <p className="text-xs text-muted-foreground mt-1.5">
              CloudWatch metrics refreshed every 30 s
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-xs font-mono text-muted-foreground">
              {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
            </span>
            <button
              onClick={refresh}
              className="border border-border text-muted-foreground rounded-lg text-xs px-3 py-1.5 bg-transparent cursor-pointer hover:border-muted-foreground hover:text-foreground transition-all duration-150"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* ── Error banner ─── */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <p style={{ margin: 0, color: '#EF4444', fontSize: 13 }}>{error}</p>
            <button onClick={refresh} style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: '#EF4444', borderRadius: 8, fontSize: 12, padding: '5px 10px', cursor: 'pointer' }}>Retry</button>
          </div>
        )}

        {/* ── KPI tiles ─── */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <KpiTile label="Requests / sec" value={`${data?.rps ?? 0}`} sub={healthLabel(rpsTone)} tone={rpsTone} />
          <KpiTile label="P99 Latency" value={`${data?.p99_latency_ms ?? 0} ms`} sub={healthLabel(latencyTone)} tone={latencyTone} />
          <KpiTile label="Error rate" value={`${Number(data?.error_rate_pct ?? 0).toFixed(2)}%`} sub={healthLabel(errorTone)} tone={errorTone} />
          <KpiTile label="Active instances" value={`${data?.active_instances ?? 0}`} sub={healthLabel(instTone)} tone={instTone} />
        </div>

        {/* ── Traffic area chart + cost donut ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 24 }}>

          {/* Traffic area chart */}
          <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: 12, padding: '20px 20px 12px' }}>
            <SectionHeader title="24-hour traffic" description="Requests per second and P99 latency by hour" />
            {trafficData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={trafficData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="gradRps" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22C55E" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradLatency" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#52525B', fontSize: 10 }}
                    interval={3}
                  />
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#52525B', fontSize: 10 }}
                    width={34}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#52525B', fontSize: 10 }}
                    width={40}
                  />
                  <Tooltip content={<TrafficTooltip />} cursor={{ stroke: '#2E2E2E', strokeWidth: 1 }} />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="rps"
                    name="RPS"
                    stroke="#22C55E"
                    strokeWidth={1.5}
                    fill="url(#gradRps)"
                    dot={false}
                    isAnimationActive={false}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="latency"
                    name="Latency"
                    stroke="#F59E0B"
                    strokeWidth={1.5}
                    fill="url(#gradLatency)"
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ margin: 0, fontSize: 12, color: '#52525B' }}>Waiting for traffic data…</p>
              </div>
            )}
            <div style={{ display: 'flex', gap: 16, marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 16, height: 2, background: '#22C55E', display: 'inline-block', borderRadius: 1 }} />
                <span style={{ fontSize: 11, color: '#52525B' }}>RPS (left axis)</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 16, height: 2, background: '#F59E0B', display: 'inline-block', borderRadius: 1 }} />
                <span style={{ fontSize: 11, color: '#52525B' }}>Latency ms (right axis)</span>
              </div>
            </div>
          </div>

          {/* Cost donut */}
          <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: 12, padding: '20px 20px 12px', display: 'flex', flexDirection: 'column' }}>
            <SectionHeader title="Cost by service" description="Monthly estimate" />

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {costDonutData.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={costDonutData}
                      cx="50%"
                      cy="50%"
                      innerRadius={44}
                      outerRadius={68}
                      paddingAngle={2}
                      dataKey="value"
                      isAnimationActive={false}
                    >
                      {costDonutData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<DonutTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <p style={{ margin: 0, fontSize: 12, color: '#52525B' }}>No cost data</p>
                </div>
              )}

              {/* legend */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                {costDonutData.map((item, i) => (
                  <div key={item.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: PIE_COLORS[i % PIE_COLORS.length], display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, color: '#A1A1AA' }}>{item.name}</span>
                    </div>
                    <span style={{ fontSize: 11, color: '#52525B', fontFamily: 'Geist Mono, monospace' }}>{fmt$(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* totals strip */}
            <div style={{ borderTop: '1px solid #1F1F1F', marginTop: 14, paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <p style={{ margin: 0, fontSize: 10, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today</p>
                <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 500, color: '#F5F5F5' }}>{fmt$(data?.cost?.today_usd)}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: 10, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Forecast</p>
                <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 500, color: '#F59E0B' }}>{fmt$(data?.cost?.forecast_usd, 0)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Service health grid ─── */}
        <div style={{ marginBottom: 24 }}>
          <SectionHeader title="Service health" description="Key metric and trend for each AWS service" />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            <ServiceHealthCard
              name="EC2"
              primaryValue={`${data?.services?.ec2?.cpu_pct ?? 0}%`}
              primaryLabel="CPU"
              secondaryLabel="RAM"
              secondaryValue={`${data?.services?.ec2?.ram_pct ?? 0}%`}
              points={ec2Series}
              tone={ec2Tone}
            />
            <ServiceHealthCard
              name="RDS"
              primaryValue={`${data?.services?.rds?.connections ?? 0}`}
              primaryLabel="Connections"
              secondaryLabel="CPU"
              secondaryValue={`${data?.services?.rds?.cpu_pct ?? 0}%`}
              points={rdsSeries}
              tone={rdsTone}
            />
            <ServiceHealthCard
              name="ElastiCache"
              primaryValue={`${data?.services?.elasticache?.hit_rate_pct ?? 0}%`}
              primaryLabel="Hit rate"
              secondaryLabel="Memory"
              secondaryValue={`${data?.services?.elasticache?.memory_pct ?? 0}%`}
              points={cacheSeries}
              tone={cacheTone}
            />
            <ServiceHealthCard
              name="ALB"
              primaryValue={`${data?.services?.alb?.rps ?? 0}`}
              primaryLabel="RPS"
              secondaryLabel="5xx errors"
              secondaryValue={`${data?.services?.alb?.['5xx_count'] ?? 0}`}
              points={albSeries}
              tone={albTone}
            />
            <ServiceHealthCard
              name="SQS"
              primaryValue={`${data?.services?.sqs?.queue_depth ?? 0}`}
              primaryLabel="Queue depth"
              secondaryLabel="Workers"
              secondaryValue="Processing"
              points={sqsSeries}
              tone={sqsTone}
            />
          </div>
        </div>

        {/* ── 30-day cost chart + endpoints table ─── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16, marginBottom: 24 }}>

          {/* 30-day bar chart */}
          <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: 12, padding: '20px 20px 12px' }}>
            {/* summary tiles */}
            <div style={{ display: 'flex', gap: 32, marginBottom: 16 }}>
              <div>
                <p style={{ margin: 0, fontSize: 10, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Today</p>
                <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 500, color: '#F5F5F5', letterSpacing: '-0.02em' }}>{fmt$(data?.cost?.today_usd)}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 10, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Month to date</p>
                <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 500, color: '#F5F5F5', letterSpacing: '-0.02em' }}>{fmt$(data?.cost?.month_to_date_usd, 0)}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 10, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Forecast</p>
                <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 500, color: '#F59E0B', letterSpacing: '-0.02em' }}>{fmt$(data?.cost?.forecast_usd, 0)}</p>
              </div>
            </div>

            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#52525B' }}>Daily spend — last 30 days</p>

            {costBars.length > 0 ? (
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={costBars} margin={{ top: 4, right: 4, bottom: 0, left: -16 }} barCategoryGap="20%">
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#52525B', fontSize: 10 }}
                    tickFormatter={(v) => v?.slice(8)}
                    interval={4}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#52525B', fontSize: 10 }} width={30} />
                  <Tooltip content={<CostBarTooltip />} cursor={{ fill: 'rgba(245,245,245,0.03)' }} />
                  <Bar dataKey="usd" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                    {costBars.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.isToday ? '#F5F5F5' : '#27272A'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ margin: 0, fontSize: 12, color: '#52525B' }}>No cost history</p>
              </div>
            )}
          </div>

          {/* Top endpoints */}
          <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: 12, padding: '20px' }}>
            <SectionHeader title="Top endpoints" description="By request volume" />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {/* header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 52px 56px', gap: 8, paddingBottom: 8, borderBottom: '1px solid #1F1F1F', marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Path</span>
                <span style={{ fontSize: 10, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'right' }}>RPS</span>
                <span style={{ fontSize: 10, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'right' }}>P99</span>
              </div>

              {(data?.traffic?.top_endpoints || []).map((ep, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid', gridTemplateColumns: '1fr 52px 56px', gap: 8,
                    padding: '9px 0', borderBottom: i < (data.traffic.top_endpoints.length - 1) ? '1px solid #1A1A1A' : 'none',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <span style={{
                      fontSize: 10,
                      background: ep.method === 'GET' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                      color: ep.method === 'GET' ? '#22C55E' : '#F59E0B',
                      border: `1px solid ${ep.method === 'GET' ? 'rgba(34,197,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
                      borderRadius: 4,
                      padding: '1px 5px',
                      marginRight: 6,
                      fontFamily: 'Geist Mono, monospace',
                    }}>
                      {ep.method}
                    </span>
                    <span style={{
                      fontSize: 12, color: '#A1A1AA', fontFamily: 'Geist Mono, monospace',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ep.path}
                    </span>
                  </div>
                  <span style={{ fontSize: 12, color: '#F5F5F5', textAlign: 'right', fontFamily: 'Geist Mono, monospace' }}>{ep.rps}</span>
                  <span style={{
                    fontSize: 12, textAlign: 'right', fontFamily: 'Geist Mono, monospace',
                    color: ep.p99_ms > 250 ? '#EF4444' : ep.p99_ms > 150 ? '#F59E0B' : '#22C55E',
                  }}>
                    {ep.p99_ms}ms
                  </span>
                </div>
              ))}

              {(!data?.traffic?.top_endpoints?.length) && (
                <p style={{ margin: '20px 0', fontSize: 12, color: '#52525B', textAlign: 'center' }}>No endpoint data</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Agent proposals ─── */}
        <div>
          <SectionHeader
            title="Agent proposals"
            description="Actions the autonomous agent wants to take — approve or reject each one"
          />

          {actionError && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#EF4444' }}>{actionError}</p>
          )}

          {isLoading && !data && (
            <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: 12, padding: 20 }}>
              {[1, 2].map(i => (
                <div key={i} style={{ marginBottom: i === 1 ? 20 : 0 }}>
                  <div style={{ height: 13, width: '40%', background: '#1F1F1F', borderRadius: 4, marginBottom: 8 }} />
                  <div style={{ height: 11, width: '88%', background: '#1A1A1A', borderRadius: 4, marginBottom: 5 }} />
                  <div style={{ height: 11, width: '72%', background: '#1A1A1A', borderRadius: 4 }} />
                </div>
              ))}
            </div>
          )}

          {!isLoading && proposals.length === 0 && (
            <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: 12, padding: 32, textAlign: 'center' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#52525B' }}>No pending proposals — infrastructure is optimally sized.</p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {proposals.map(proposal => (
              <AgentProposalCard
                key={proposal.id}
                proposal={proposal}
                decision={proposalDecisions[proposal.id] || null}
                onDecision={handleDecision}
              />
            ))}
          </div>
        </div>

      </div>
    </Shell>
  )
}
