import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import {
  Server, Database, HardDrive, Zap, Shield, Activity,
  AlertTriangle, CheckCircle2, Cpu, MemoryStick, Gauge,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, RadialBarChart, RadialBar,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import Shell from '../components/Shell.jsx'
import { getRecommendation } from '../lib/api.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

// Generate simulated time-series data
function genTimeSeries(points = 24, base = 50, jitter = 20, min = 0, max = 100) {
  return Array.from({ length: points }, (_, i) => {
    const t = new Date()
    t.setHours(t.getHours() - (points - i))
    const val = Math.max(min, Math.min(max, base + (Math.random() - 0.5) * jitter))
    return { time: `${t.getHours()}:00`, value: Math.round(val * 10) / 10 }
  })
}

function genBarData(labels, base, jitter) {
  return labels.map(label => ({
    label,
    value: Math.max(0, Math.round(base + (Math.random() - 0.5) * jitter)),
  }))
}

const ACCENT = '#4ade80'
const WARN = '#fbbf24'
const ERR = '#ef4444'
const BLUE = '#60a5fa'
const PURPLE = '#a78bfa'

// Custom chart tooltips
function SimpleTooltip({ active, payload, label, unit = '' }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-muted-foreground mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.stroke || p.fill || ACCENT }} className="font-semibold">
          {p.name}: {p.value}{unit}
        </p>
      ))}
    </div>
  )
}

// Gauge ring using RadialBarChart
function GaugeRing({ value, max, color = ACCENT, label, unit = '%' }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  const data = [{ value: pct }, { value: 100 - pct }]
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 100, height: 100 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={32}
              outerRadius={44}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              paddingAngle={0}
            >
              <Cell fill={color} />
              <Cell fill="var(--color-secondary)" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-base font-bold text-foreground leading-none">{value}{unit}</span>
          <span className="text-[9px] text-muted-foreground">{unit === '%' ? 'used' : unit}</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-1 text-center">{label}</p>
    </div>
  )
}

// Section card wrapper
function ServiceSection({ icon: Icon, title, iconColor, badge, children, delay = 0 }) {
  return (
    <div
      className="bg-card border border-border rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500"
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${iconColor}18`, border: `1px solid ${iconColor}30` }}>
            <Icon className="w-4 h-4" style={{ color: iconColor }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            {badge && (
              <span className="text-xs px-1.5 py-0.5 rounded border font-mono" style={{ color: iconColor, background: `${iconColor}10`, borderColor: `${iconColor}30` }}>
                {badge}
              </span>
            )}
          </div>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
          <CheckCircle2 className="w-3.5 h-3.5" /> Provisioned
        </span>
      </div>
      {children}
    </div>
  )
}

// Mini stat chip
function StatChip({ label, value }) {
  return (
    <div className="bg-secondary rounded-lg px-3 py-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5 font-mono">{value}</p>
    </div>
  )
}

// ─── EC2 Section ──────────────────────────────────────────────────────────────

function EC2Section({ svc }) {
  const cpuData = useMemo(() => genTimeSeries(24, 42, 28, 5, 95), [])
  const netData = useMemo(() => genTimeSeries(24, 120, 80, 10, 500), [])
  const instanceCount = svc.count || 2

  return (
    <ServiceSection icon={Server} title="EC2 Compute" iconColor={ACCENT} badge={svc.instance_type} delay={100}>
      {/* Stat row */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatChip label="Instances" value={`${instanceCount}`} />
        <StatChip label="ASG Range" value={`${svc.asg_min}–${svc.asg_max}`} />
        <StatChip label="vCPUs" value={`${instanceCount * 2}`} />
        <StatChip label="Memory" value={`${instanceCount * 8} GB`} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-2">CPU Utilization (24h)</p>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={cpuData} margin={{ top: 0, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={ACCENT} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={ACCENT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="time" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={v => `${v}%`} />
              <Tooltip content={<SimpleTooltip unit="%" />} />
              <Area type="monotone" dataKey="value" name="CPU" stroke={ACCENT} fill="url(#cpuGrad)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Network Throughput MB/s (24h)</p>
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={netData} margin={{ top: 0, right: 4, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={BLUE} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={BLUE} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="time" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<SimpleTooltip unit=" MB/s" />} />
              <Area type="monotone" dataKey="value" name="Network" stroke={BLUE} fill="url(#netGrad)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Instance table */}
      <div className="mt-4 border border-border rounded-lg overflow-hidden">
        <div className="grid px-4 py-2 bg-secondary/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr' }}>
          <span>Instance ID</span><span>Type</span><span>State</span><span>CPU</span><span>Status</span>
        </div>
        {Array.from({ length: Math.min(instanceCount, 3) }, (_, i) => {
          const cpu = Math.round(30 + Math.random() * 50)
          return (
            <div key={i} className="grid px-4 py-2.5 text-xs border-b border-border last:border-0 hover:bg-secondary/30 transition-colors" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr' }}>
              <span className="font-mono text-foreground">i-{Math.random().toString(36).substr(2, 8)}</span>
              <span className="text-muted-foreground">{svc.instance_type}</span>
              <span className="text-green-400">● running</span>
              <span className="text-foreground">{cpu}%</span>
              <span className="text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> 2/2 checks</span>
            </div>
          )
        })}
      </div>
    </ServiceSection>
  )
}

// ─── RDS Section ──────────────────────────────────────────────────────────────

function RDSSection({ svcCompute, svcStorage, svcConns }) {
  const connData = useMemo(() => genTimeSeries(24, 85, 60, 0, 300), [])
  const latencyData = useMemo(() => genTimeSeries(24, 12, 8, 0, 80), [])
  const storageUsed = Math.round((svcStorage?.gb || 100) * 0.62)
  const storageTotal = svcStorage?.gb || 100

  return (
    <ServiceSection icon={Database} title="RDS Database" iconColor={BLUE} badge={svcCompute?.instance_type} delay={150}>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatChip label="Engine" value="PostgreSQL" />
        <StatChip label="Mode" value={svcCompute?.multi_az ? 'Multi-AZ' : 'Single-AZ'} />
        <StatChip label="Storage" value={`${storageTotal} GB`} />
        <StatChip label="IOPS" value={`${svcStorage?.iops || 3000}`} />
      </div>

      {/* Gauges */}
      <div className="flex gap-6 justify-around mb-5 py-4 border border-border rounded-lg bg-secondary/30">
        <GaugeRing value={storageUsed} max={storageTotal} color={BLUE} label="Storage used" unit=" GB" />
        <GaugeRing value={Math.round((svcConns?.max_connections || 100) * 0.55)} max={svcConns?.max_connections || 100} color={ACCENT} label="Active conns" unit="" />
        <GaugeRing value={62} max={100} color={PURPLE} label="Cache hit rate" unit="%" />
        <GaugeRing value={28} max={100} color={WARN} label="CPU util." unit="%" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-2">DB Connections (24h)</p>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={connData} margin={{ top: 0, right: 4, bottom: 0, left: -10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="time" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<SimpleTooltip unit="" />} />
              <Line type="monotone" dataKey="value" name="Connections" stroke={BLUE} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Read Latency ms (24h)</p>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={latencyData} margin={{ top: 0, right: 4, bottom: 0, left: -14 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="time" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<SimpleTooltip unit=" ms" />} />
              <Line type="monotone" dataKey="value" name="Latency" stroke={PURPLE} strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </ServiceSection>
  )
}

// ─── ElastiCache Section ──────────────────────────────────────────────────────

function ElastiCacheSection({ svc }) {
  const hitData = useMemo(() => genTimeSeries(24, 88, 10, 50, 100), [])
  const memData = useMemo(() => genTimeSeries(24, 55, 20, 10, 95), [])

  const cacheHitPie = [
    { name: 'Hit', value: 88 },
    { name: 'Miss', value: 12 },
  ]

  return (
    <ServiceSection icon={Zap} title="ElastiCache (Redis)" iconColor={WARN} badge={svc.node_type} delay={200}>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatChip label="Memory" value={`${svc.memory_gb} GB`} />
        <StatChip label="Hit rate" value="88%" />
        <StatChip label="Pattern" value="aside" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-1 flex flex-col items-center justify-center p-2 border border-border rounded-lg bg-secondary/30">
          <p className="text-xs text-muted-foreground mb-2">Cache hit/miss</p>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie data={cacheHitPie} cx="50%" cy="50%" innerRadius={38} outerRadius={55} dataKey="value" paddingAngle={3}>
                <Cell fill={ACCENT} />
                <Cell fill="var(--color-secondary)" />
              </Pie>
              <Tooltip formatter={v => [`${v}%`]} contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground text-center">88% hits · 12% misses</p>
        </div>
        <div className="col-span-2 grid grid-rows-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Hit rate % (24h)</p>
            <ResponsiveContainer width="100%" height={70}>
              <AreaChart data={hitData} margin={{ top: 0, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="hitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={WARN} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={WARN} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" hide />
                <Tooltip content={<SimpleTooltip unit="%" />} />
                <Area type="monotone" dataKey="value" name="Hit rate" stroke={WARN} fill="url(#hitGrad)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Memory usage % (24h)</p>
            <ResponsiveContainer width="100%" height={70}>
              <AreaChart data={memData} margin={{ top: 0, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PURPLE} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={PURPLE} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" hide />
                <Tooltip content={<SimpleTooltip unit="%" />} />
                <Area type="monotone" dataKey="value" name="Memory" stroke={PURPLE} fill="url(#memGrad)" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </ServiceSection>
  )
}

// ─── ALB Section ──────────────────────────────────────────────────────────────

function ALBSection() {
  const rpsData = useMemo(() => genTimeSeries(24, 320, 200, 20, 1000), [])
  const errData = useMemo(() => genTimeSeries(24, 0.8, 1.2, 0, 8), [])

  const targetHealth = [
    { az: 'us-east-1a', healthy: 3, unhealthy: 0 },
    { az: 'us-east-1b', healthy: 3, unhealthy: 0 },
    { az: 'us-east-1c', healthy: 2, unhealthy: 1 },
  ]

  return (
    <ServiceSection icon={Shield} title="Application Load Balancer" iconColor="#60a5fa" delay={250}>
      <div className="grid grid-cols-4 gap-3 mb-5">
        <StatChip label="Scheme" value="Internet" />
        <StatChip label="Listeners" value="2 (80, 443)" />
        <StatChip label="Target Groups" value="2" />
        <StatChip label="Healthy" value="8/9" />
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <p className="text-xs text-muted-foreground mb-2">Requests / sec (24h)</p>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={rpsData} margin={{ top: 0, right: 4, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="rpsGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#60a5fa" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="time" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<SimpleTooltip unit=" rps" />} />
              <Area type="monotone" dataKey="value" name="RPS" stroke="#60a5fa" fill="url(#rpsGrad)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-2">Error rate % (24h)</p>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={errData} margin={{ top: 0, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={ERR} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={ERR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="time" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} interval={5} />
              <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<SimpleTooltip unit="%" />} />
              <Area type="monotone" dataKey="value" name="Errors" stroke={ERR} fill="url(#errGrad)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Target health table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="grid px-4 py-2 bg-secondary/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <span>Availability Zone</span><span>Healthy</span><span>Unhealthy</span>
        </div>
        {targetHealth.map(row => (
          <div key={row.az} className="grid px-4 py-2.5 text-xs border-b border-border last:border-0" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <span className="font-mono text-foreground">{row.az}</span>
            <span className="text-green-400">{row.healthy} targets</span>
            <span className={row.unhealthy > 0 ? 'text-red-400' : 'text-muted-foreground'}>{row.unhealthy} targets</span>
          </div>
        ))}
      </div>
    </ServiceSection>
  )
}

// ─── S3 Section ───────────────────────────────────────────────────────────────

function S3Section({ svc }) {
  const storageData = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    day: `Day ${i + 1}`,
    value: Math.round((svc?.storage_gb || 50) * (0.6 + (i / 30) * 0.4 + (Math.random() - 0.5) * 0.05)),
  })), [svc])

  const buckets = [
    { name: 'app-assets', size: `${Math.round((svc?.storage_gb || 50) * 0.45)} GB`, class: 'Standard', objects: '12.4K' },
    { name: 'app-backups', size: `${Math.round((svc?.storage_gb || 50) * 0.38)} GB`, class: 'Infrequent Access', objects: '834' },
    { name: 'app-logs', size: `${Math.round((svc?.storage_gb || 50) * 0.17)} GB`, class: 'Glacier', objects: '2.1M' },
  ]

  return (
    <ServiceSection icon={HardDrive} title="S3 Object Storage" iconColor="#34d399" badge={`${svc?.storage_gb || 50} GB`} delay={300}>
      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatChip label="Storage class" value={svc?.storage_class || 'Standard'} />
        <StatChip label="Versioning" value="Enabled" />
        <StatChip label="Replication" value="Cross-region" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-2">Storage growth (30 days)</p>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={storageData} margin={{ top: 0, right: 4, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="s3Grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#34d399" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="day" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} interval={6} />
              <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickLine={false} axisLine={false} />
              <Tooltip content={<SimpleTooltip unit=" GB" />} />
              <Area type="monotone" dataKey="value" name="Storage" stroke="#34d399" fill="url(#s3Grad)" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div>
          <p className="text-xs text-muted-foreground mb-2">Buckets</p>
          <div className="space-y-2">
            {buckets.map(b => (
              <div key={b.name} className="grid px-3 py-2 rounded-lg bg-secondary/50 text-xs" style={{ gridTemplateColumns: '1fr auto auto' }}>
                <span className="font-mono text-foreground truncate">{b.name}</span>
                <span className="text-muted-foreground px-2">{b.objects}</span>
                <span className="text-green-400 font-semibold">{b.size}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ServiceSection>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ServicesPage() {
  const { jobId } = useParams()
  const [recommendation, setRecommendation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    getRecommendation(jobId)
      .then(rec => { setRecommendation(rec); setLoading(false) })
      .catch(err => { setError(err.message); setLoading(false) })
  }, [jobId])

  const badge = (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-green-500/20 bg-green-500/10 text-green-400">
      Live metrics
    </span>
  )

  if (loading) return (
    <Shell statusBadge={badge}>
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-card border border-border rounded-xl h-64 animate-pulse" />
        ))}
      </div>
    </Shell>
  )

  if (error) return (
    <Shell>
      <div className="flex items-center gap-2 p-5 rounded-xl bg-red-500/5 border border-red-500/20">
        <AlertTriangle className="w-4 h-4 text-red-400" />
        <span className="text-sm text-red-400">{error}</span>
      </div>
    </Shell>
  )

  const { services } = recommendation

  return (
    <Shell statusBadge={badge}>
      {/* Header */}
      <div className="flex items-start justify-between mb-7 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Services Map</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Visual breakdown of every provisioned AWS service with live metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
          <span className="text-xs text-muted-foreground font-mono">Simulated · 30s refresh</span>
        </div>
      </div>

      {/* Services */}
      <div className="space-y-4">
        {services.ec2 && <EC2Section svc={services.ec2} />}
        {(services.rds_compute || services.rds_storage) && (
          <RDSSection
            svcCompute={services.rds_compute}
            svcStorage={services.rds_storage}
            svcConns={services.rds_connections}
          />
        )}
        {services.elasticache && <ElastiCacheSection svc={services.elasticache} />}
        <ALBSection />
        {services.s3 && <S3Section svc={services.s3} />}
      </div>
    </Shell>
  )
}
