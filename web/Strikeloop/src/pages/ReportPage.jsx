import { useState, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Server, Database, HardDrive, Zap, Shield,
  AlertTriangle, ChevronRight, Copy, Download, Check, AlertCircle,
} from 'lucide-react'
import SyntaxHighlighter from 'react-syntax-highlighter'
import { atomOneDark } from 'react-syntax-highlighter/dist/esm/styles/hljs'
import Shell from '../components/Shell.jsx'
import ServiceCard from '../components/ServiceCard.jsx'
import CostDonut from '../components/CostDonut.jsx'
import ApprovalTab from '../components/ApprovalTab.jsx'
import ArchitectureDiagram from '../components/ArchitectureDiagram.jsx'
import { useApp } from '../context/AppContext.jsx'
import { getReport, getRecommendation, getIaC, getPlan, approvePlan } from '../lib/api.js'

// ── helpers ──────────────────────────────────────────────────────────────────

const TABS = ['Diagram', 'Summary', 'Sizing', 'IaC', 'Security', 'Approval']

const SERVICE_ICONS = {
  ec2:             Server,
  rds_compute:     Database,
  rds_storage:     HardDrive,
  rds_connections: Zap,
  elasticache:     Zap,
  s3:              HardDrive,
  alb:             Shield,
}

const SERVICE_NAMES = {
  ec2:             'EC2 Compute',
  rds_compute:     'RDS Compute',
  rds_storage:     'RDS Storage',
  rds_connections: 'RDS Connections',
  elasticache:     'ElastiCache',
  s3:              'S3 Storage',
  alb:             'Load Balancer',
}

function buildSpec(key, svc) {
  switch (key) {
    case 'ec2':
      return `${svc.instance_type} · ${svc.count} instances · ASG ${svc.asg_min}–${svc.asg_max}`
    case 'rds_compute':
      return `${svc.instance_type} · ${svc.multi_az ? 'Multi-AZ' : 'Single-AZ'}`
    case 'rds_storage':
      return `${svc.gb} GB · ${svc.iops} IOPS · ${svc.type}`
    case 'rds_connections':
      return `Max ${svc.max_connections} connections`
    case 'elasticache':
      return `${svc.node_type} · ${svc.memory_gb} GB memory`
    case 's3':
      return `${svc.storage_gb} GB · ${svc.storage_class}`
    case 'alb':
      return 'Application Load Balancer'
    default:
      return ''
  }
}

function computeProfileBadge(profile) {
  const map = {
    io_bound:     { bg: 'rgba(59,130,246,0.1)', border: 'rgba(59,130,246,0.2)', color: '#60A5FA' },
    cpu_bound:    { bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.2)', color: '#F59E0B' },
    memory_bound: { bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.2)', color: '#A78BFA' },
    mixed:        { bg: 'rgba(161,161,170,0.1)', border: 'rgba(161,161,170,0.2)', color: '#A1A1AA' },
  }
  const style = map[profile] || map.mixed
  return (
    <span style={{
      background: style.bg,
      border: `1px solid ${style.border}`,
      color: style.color,
      borderRadius: 999,
      fontSize: 11,
      padding: '2px 8px',
    }}>
      {profile.replace('_', '-')}
    </span>
  )
}

function severityPill(severity) {
  const map = {
    high:   { bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.2)',   color: '#EF4444' },
    medium: { bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.2)',  color: '#F59E0B' },
    low:    { bg: 'rgba(161,161,170,0.1)', border: 'rgba(161,161,170,0.2)', color: '#A1A1AA' },
  }
  const s = map[severity] || map.low
  return (
    <span style={{
      background: s.bg, border: `1px solid ${s.border}`, color: s.color,
      borderRadius: 999, fontSize: 11, padding: '2px 8px', flexShrink: 0,
    }}>
      {severity}
    </span>
  )
}

function riskColor(score) {
  if (score <= 3) return '#22C55E'
  if (score <= 6) return '#F59E0B'
  return '#EF4444'
}

// ── sub-components ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-card border border-border rounded-xl h-28 animate-pulse" />
  )
}

function InfoRow({ label, value, isLast }) {
  return (
    <div className={`flex items-center justify-between py-2.5 ${isLast ? '' : 'border-b border-border'}`}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground font-medium">{value}</span>
    </div>
  )
}

// ── tabs ──────────────────────────────────────────────────────────────────────

function OverviewTab({ report }) {
  const { meta, structure, compute, database, cache, security } = report
  const score = security.risk_score

  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 0.6fr' }}>
      {/* Left — fingerprint */}
      <div className="bg-card border border-border rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <p className="text-sm font-semibold text-foreground">
          Application fingerprint
        </p>
        <p className="text-xs text-muted-foreground mt-1 mb-3">
          What the static analysis engine discovered.
        </p>
        <InfoRow label="Runtime" value={meta.language} />
        <InfoRow label="Framework" value={meta.framework} />
        <InfoRow label="API routes" value={`${structure.total_routes} total · ${structure.protected_routes} protected`} />
        <InfoRow label="Compute profile" value={computeProfileBadge(compute.profile)} />
        <InfoRow label="Avg CPU / request" value={`${compute.avg_cpu_ms_per_request} ms`} />
        <InfoRow label="Memory / request" value={`${compute.memory_mb_per_request} MB`} />
        <InfoRow label="Database" value={`${database.type} · ${database.orm}`} />
        <InfoRow label="DB calls / request" value={database.avg_calls_per_request.toFixed(1)} />
        <InfoRow label="Read / write ratio" value={`${(database.read_write_ratio * 100).toFixed(0)}% reads`} />
        <InfoRow label="Cache" value={`${cache.client} · ${cache.pattern}`} />
        <InfoRow
          label="Background jobs"
          value={structure.has_background_workers ? structure.worker_library : 'None'}
          isLast
        />
      </div>

      {/* Right — security */}
      <div
        className="bg-card border border-border rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500"
        style={{ animationDelay: '100ms', animationFillMode: 'both' }}
      >
        <p className="text-sm font-semibold text-foreground">Security score</p>
        <div className="flex items-baseline gap-1 mt-3 mb-0.5">
          <span
            className="text-4xl font-bold tracking-tight leading-none"
            style={{ color: riskColor(score) }}
          >
            {score}
          </span>
          <span className="text-sm text-muted-foreground">/10</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1 mb-4">
          {security.findings_count} finding{security.findings_count !== 1 ? 's' : ''} detected
        </p>

        {/* Flag badges */}
        <div className="flex flex-col gap-1.5 mb-4">
          {security.needs_secrets_manager && (
            <span className="inline-flex w-fit px-2.5 py-1 rounded-full text-xs font-medium border border-yellow-500/20 bg-yellow-500/10 text-yellow-400">
              Secrets Manager required
            </span>
          )}
          {security.needs_vpc_private_subnet && (
            <span className="inline-flex w-fit px-2.5 py-1 rounded-full text-xs font-medium border border-yellow-500/20 bg-yellow-500/10 text-yellow-400">
              Private subnet required
            </span>
          )}
        </div>

        <div className="border-t border-border pt-3 flex flex-col gap-2.5">
          {security.top_risks.slice(0, 3).map((risk, i) => (
            <div key={i}>
              <div className="flex items-center gap-2 mb-1">
                {severityPill(risk.severity)}
                <span className="text-xs text-foreground font-medium leading-snug">{risk.issue}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{risk.fix}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function SizingTab({ recommendation }) {
  const { services, total_monthly_usd, estimate_low_usd, estimate_high_usd, bottleneck_warnings } = recommendation

  return (
    <div className="grid gap-4 items-start" style={{ gridTemplateColumns: '1fr 0.55fr' }}>
      {/* Left — service cards */}
      <div>
        <div className="grid grid-cols-2 gap-3">
          {Object.entries(services).map(([key, svc]) => (
            <ServiceCard
              key={key}
              name={SERVICE_NAMES[key] || key}
              icon={SERVICE_ICONS[key]}
              spec={buildSpec(key, svc)}
              monthlyCost={svc.monthly_usd}
              reasoning={svc.reasoning}
            />
          ))}
        </div>

        {/* Bottleneck warnings */}
        {bottleneck_warnings?.length > 0 && (
          <div className="flex flex-col gap-2 mt-3">
            {bottleneck_warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2 pl-3 py-2.5 pr-3 rounded-r-lg" style={{ borderLeft: '3px solid #fbbf24', background: 'rgba(251,191,36,0.06)' }}>
                <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                <span className="text-sm text-warning leading-relaxed">{w}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right — cost summary */}
      <div className="bg-card border border-border rounded-xl p-5 sticky top-6">
        <p className="text-sm font-semibold text-foreground mb-4">Estimated monthly cost</p>
        <CostDonut services={services} total={total_monthly_usd} />
        <p className="text-xs text-muted-foreground text-center mt-3 font-mono">
          Low ${estimate_low_usd} · High ${estimate_high_usd}
        </p>
      </div>
    </div>
  )
}

function IaCTab({ iac }) {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(iac.terraform_hcl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function handleDownload() {
    const blob = new Blob([iac.terraform_hcl], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'main.tf'
    a.click()
    URL.revokeObjectURL(url)
  }

  const ghostBtn = 'flex items-center gap-1.5 border border-border text-foreground rounded-lg px-3 py-1.5 text-xs bg-transparent cursor-pointer hover:border-muted-foreground transition-colors duration-150'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-sm font-semibold text-foreground">main.tf</span>
        <div className="flex gap-2">
          <button className={ghostBtn} onClick={handleCopy}>
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button className={ghostBtn} onClick={handleDownload}>
            <Download className="w-3 h-3" />
            Download
          </button>
        </div>
      </div>

      {/* Code card */}
      <div className="bg-card border border-border rounded-xl p-5 max-h-[520px] overflow-y-auto thin-scroll">
        <SyntaxHighlighter
          language="hcl"
          style={atomOneDark}
          customStyle={{
            background: 'transparent',
            padding: 0,
            fontSize: 12,
            lineHeight: 1.6,
            fontFamily: 'JetBrains Mono, monospace',
            margin: 0,
          }}
        >
          {iac.terraform_hcl}
        </SyntaxHighlighter>
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        This plan creates {iac.resources_count} AWS resources.
      </p>
    </div>
  )
}

function SecurityTab({ report }) {
  const { security } = report
  const score = security.risk_score

  const borderColorStyle = (severity) => {
    if (severity === 'high')   return '#ef4444'
    if (severity === 'medium') return '#fbbf24'
    return '#888898'
  }
  const bgColorStyle = (severity) => {
    if (severity === 'high')   return 'rgba(239,68,68,0.06)'
    if (severity === 'medium') return 'rgba(251,191,36,0.06)'
    return 'rgba(136,136,152,0.04)'
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Score header */}
      <div className="bg-card border border-border rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Security risk score</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Based on static analysis of {report.meta.repo}
            </p>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className="text-5xl font-bold tracking-tight leading-none"
              style={{ color: riskColor(score) }}
            >
              {score}
            </span>
            <span className="text-base text-muted-foreground">/10</span>
          </div>
        </div>
      </div>

      {/* Findings */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">Findings</p>
        <div className="flex flex-col gap-2">
          {security.top_risks.map((risk, i) => (
            <div
              key={i}
              className="rounded-r-lg py-3 px-4"
              style={{ borderLeft: `3px solid ${borderColorStyle(risk.severity)}`, background: bgColorStyle(risk.severity) }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                {severityPill(risk.severity)}
                <span className="text-sm text-foreground font-medium">{risk.issue}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{risk.fix}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Infrastructure flags */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-2.5">Infrastructure flags</p>
        <div className="flex flex-col gap-2">
          {security.needs_secrets_manager && (
            <div className="flex items-start gap-2.5 p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
              <Shield className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-warning">AWS Secrets Manager</p>
                <p className="text-xs text-muted-foreground mt-1">Credentials detected in source. Rotate and store in Secrets Manager before deployment.</p>
              </div>
            </div>
          )}
          {security.needs_vpc_private_subnet && (
            <div className="flex items-start gap-2.5 p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
              <Shield className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-warning">Private Subnet Required</p>
                <p className="text-xs text-muted-foreground mt-1">RDS and ElastiCache must be placed in private subnets, not accessible from the public internet.</p>
              </div>
            </div>
          )}
          {security.needs_waf && (
            <div className="flex items-start gap-2.5 p-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5">
              <Shield className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-warning">WAF Recommended</p>
                <p className="text-xs text-muted-foreground mt-1">Attach AWS WAF to the ALB to protect against common web exploits and bots.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── page ──────────────────────────────────────────────────────────────────────

const completeBadge = (
  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-green-500/20 bg-green-500/10 text-green-400">
    Complete
  </span>
)

export default function ReportPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { updateRunRecord, setJobId } = useApp()
  const [activeTab, setActiveTab] = useState('Summary')
  const [report, setReport] = useState(null)
  const [recommendation, setRecommendation] = useState(null)
  const [iac, setIac] = useState(null)
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [planLoading, setPlanLoading] = useState(true)
  const [planError, setPlanError] = useState(null)

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab')
    if (tabFromUrl && TABS.includes(tabFromUrl)) {
      setActiveTab(tabFromUrl)
      return
    }
    setActiveTab('Diagram')
  }, [searchParams])

  useEffect(() => {
    setJobId(jobId)
  }, [jobId, setJobId])

  useEffect(() => {
    Promise.all([
      getReport(jobId),
      getRecommendation(jobId),
      getIaC(jobId),
      getPlan(jobId),
    ])
      .then(([r, rec, i, p]) => {
        setReport(r)
        setRecommendation(rec)
        setIac(i)
        setPlan(p)
        setLoading(false)
        setPlanLoading(false)
      })
      .catch(err => {
        setError(err.message || 'Failed to load report')
        setPlanError(err.message || 'Failed to load plan')
        setLoading(false)
        setPlanLoading(false)
      })
  }, [jobId])

  async function handleApprovePlan() {
    await approvePlan(jobId, 'approve')
    updateRunRecord(jobId, { status: 'approved' })
    navigate('/monitor')
  }

  async function handleSuggestAlternative(note) {
    await approvePlan(jobId, 'reject', note)
  }

  const tabClass = (tab) => `
    px-4 py-2 text-sm font-medium cursor-pointer bg-transparent border-0 transition-colors duration-150 -mb-px
    ${activeTab === tab
      ? 'text-foreground border-b-2 border-foreground'
      : 'text-muted-foreground hover:text-foreground border-b-2 border-transparent'
    }
  `

  return (
    <Shell statusBadge={completeBadge}>
      {error && (
        <div className="flex items-center gap-2.5 p-5 rounded-xl bg-red-500/5 border border-red-500/20 mb-6">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {loading ? (
        <div>
          <div className="h-8 bg-card rounded-lg w-60 mb-2 animate-pulse" />
          <div className="h-4 bg-card rounded w-80 mb-8 animate-pulse" />
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 0.6fr' }}>
            <SkeletonCard />
            <SkeletonCard />
          </div>
        </div>
      ) : report && (
        <>
          {/* Page heading */}
          <div className="mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h1 className="text-3xl font-semibold text-foreground tracking-tight leading-tight">
              Architecture workspace
            </h1>
            <p className="font-mono text-xs text-muted-foreground mt-1 tracking-wide">
              {report.meta.repo} · {report.meta.framework} · {report.meta.language}
            </p>
          </div>

          {/* Tab bar */}
          <div className="border-b border-border mb-0 flex gap-0 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '50ms', animationFillMode: 'both' }}>
            {TABS.map(tab => (
              <button
                key={tab}
                className={tabClass(tab)}
                onClick={() => {
                  setActiveTab(tab)
                  setSearchParams(tab === 'Summary' ? {} : { tab })
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ paddingTop: 24 }}>
            {activeTab === 'Diagram'   && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#A1A1AA' }}>
                    AI-generated AWS topology for <span style={{ color: '#F5F5F5', fontFamily: 'Geist Mono, monospace', fontSize: 12 }}>{report.meta.repo}</span>
                  </p>
                </div>
                <ArchitectureDiagram
                  hcl={iac?.terraform_hcl}
                  totalCost={recommendation?.total_monthly_usd}
                  resourceCount={iac?.resources_count}
                />
              </div>
            )}
            {activeTab === 'Summary'   && <OverviewTab report={report} />}
            {activeTab === 'Sizing'    && recommendation && <SizingTab recommendation={recommendation} />}
            {activeTab === 'IaC'       && iac && <IaCTab iac={iac} />}
            {activeTab === 'Security'  && <SecurityTab report={report} />}
            {activeTab === 'Approval'  && (
              <ApprovalTab
                plan={plan}
                loading={planLoading}
                error={planError}
                onApprove={handleApprovePlan}
                onSuggest={handleSuggestAlternative}
              />
            )}
          </div>

          {/* Bottom CTA */}
          {activeTab !== 'Approval' && activeTab !== 'Diagram' && (
            <div className="mt-8">
              <button
                onClick={() => {
                  setActiveTab('Approval')
                  setSearchParams({ tab: 'Approval' })
                }}
                className="w-full flex items-center justify-center gap-1.5 bg-primary text-primary-foreground border-0 rounded-xl py-3 px-6 text-sm font-semibold cursor-pointer hover:opacity-90 transition-opacity duration-150"
              >
                Open approval gate
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </Shell>
  )
}
