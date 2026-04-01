import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
} from 'lucide-react'
import { useJobStatus } from '../hooks/useJobStatus.js'
import Shell from '../components/Shell.jsx'
import { useApp } from '../context/AppContext.jsx'

const STAGES = [
  { name: 'Repository scan',      desc: 'Cloning and scanning files' },
  { name: 'Code analysis',        desc: 'Detecting frameworks, dependencies, DB patterns' },
  { name: 'Behaviour extraction', desc: 'Mapping API routes and data access patterns' },
  { name: 'Load simulation',      desc: 'Estimating resource requirements at scale' },
  { name: 'Architecture decision',desc: 'AI architect reasoning over AWS best practices' },
  { name: 'IaC generation',       desc: 'Generating Terraform configuration' },
]

function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}m ${s}s`
}

function StatusBadge({ status }) {
  if (status === 'done') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-green-500/20 bg-green-500/10 text-green-400">
        Complete
      </span>
    )
  }
  if (status === 'error') {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-red-500/20 bg-red-500/10 text-red-400">
        Failed
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-yellow-500/20 bg-yellow-500/10 text-yellow-400">
      Analysing
    </span>
  )
}

function StepRow({ stageIndex, activeStage, status, message, isLast }) {
  const stageNum = stageIndex + 1
  const isCompleted = stageNum < activeStage
  const isActive    = stageNum === activeStage
  const isPending   = stageNum > activeStage
  const isError     = status === 'error' && isActive

  return (
    <div className="flex gap-4 items-start">
      {/* Left: circle + connector */}
      <div className="w-5 shrink-0 flex flex-col items-center">
        {/* Circle */}
        <div
          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
            isCompleted
              ? 'bg-accent'
              : isActive && !isError
                ? 'border-2 border-foreground bg-transparent'
                : isError
                  ? 'border-2 border-red-400 bg-red-500/10'
                  : 'border border-border bg-transparent'
          }`}
        >
          {isCompleted && <CheckCircle2 className="w-3 h-3 text-accent-foreground" strokeWidth={2.5} />}
          {isActive && !isError && (
            <span className="stage-dot-pulse w-2 h-2 rounded-full bg-foreground block" />
          )}
          {isError && <AlertCircle className="w-3 h-3 text-red-400" />}
        </div>

        {/* Connector line */}
        {!isLast && (
          <div
            className={`w-px mt-1 mb-1 transition-colors duration-300 ${
              isCompleted ? 'bg-accent' : 'bg-border'
            }`}
            style={{ height: 32 }}
          />
        )}
      </div>

      {/* Right: text */}
      <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-8'}`}>
        <p
          className={`text-sm font-medium transition-colors duration-300 ${
            isPending ? 'text-muted-foreground' : 'text-foreground'
          }`}
        >
          {STAGES[stageIndex].name}
        </p>

        {(isActive || isCompleted) && message && (
          <div className="flex items-center gap-1 mt-1">
            {isActive && status === 'running' && (
              <Loader2 className="w-2.5 h-2.5 text-muted-foreground animate-spin shrink-0" />
            )}
            <span className="text-xs font-mono text-muted-foreground tracking-wide">
              {message}
            </span>
          </div>
        )}

        {isPending && (
          <p className="text-xs text-muted-foreground/60 mt-0.5">{STAGES[stageIndex].desc}</p>
        )}
      </div>
    </div>
  )
}

export default function AnalysisPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { updateRunRecord } = useApp()
  const { status, stage, message, stageMessages, elapsedSeconds, error, isLoading } = useJobStatus(jobId)

  useEffect(() => {
    if (status !== 'done') return
    updateRunRecord(jobId, { status: 'complete' })
    const t = setTimeout(() => navigate(`/overview/${jobId}`), 800)
    return () => clearTimeout(t)
  }, [status, jobId, navigate, updateRunRecord])

  useEffect(() => {
    if (status !== 'error') return
    updateRunRecord(jobId, { status: 'failed' })
  }, [status, jobId, updateRunRecord])

  const badge = <StatusBadge status={status} />

  return (
    <Shell statusBadge={badge}>
      <div className="max-w-2xl">
        {/* Header row */}
        <div className="flex items-start justify-between mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div>
            <h1 className="text-3xl font-semibold text-foreground tracking-tight leading-tight">
              Analysing your codebase
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Running static analysis, load estimation, and AI reasoning.
            </p>
          </div>

          {/* Elapsed timer */}
          {!isLoading && (
            <div className="flex items-center gap-2 mt-1 shrink-0">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-mono text-muted-foreground">
                {formatElapsed(elapsedSeconds)}
              </span>
            </div>
          )}
        </div>

        {/* Step tracker card */}
        <div
          className="bg-card border border-border rounded-xl p-6 animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{ animationDelay: '100ms', animationFillMode: 'both' }}
        >
          {STAGES.map((_, i) => (
            <StepRow
              key={i}
              stageIndex={i}
              activeStage={isLoading ? 0 : stage}
              status={status}
              message={stageMessages[i + 1] || ''}
              isLast={i === STAGES.length - 1}
            />
          ))}
        </div>

        {/* Error card */}
        {status === 'error' && (
          <div
            className="mt-6 bg-red-500/5 border border-red-500/20 rounded-xl p-5 animate-in fade-in slide-in-from-bottom-4 duration-500"
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-sm font-semibold text-red-400">Analysis failed</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {error || 'An unexpected error occurred during analysis.'}
            </p>
            <button
              onClick={() => navigate('/')}
              className="mt-4 border border-red-500/30 text-red-400 rounded-lg px-4 py-2 text-sm bg-transparent cursor-pointer hover:bg-red-500/10 transition-colors duration-150"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </Shell>
  )
}
