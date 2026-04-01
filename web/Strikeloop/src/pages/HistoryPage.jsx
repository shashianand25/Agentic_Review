import { Clock3, ExternalLink, FolderGit2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import Shell from '../components/Shell.jsx'
import { useApp } from '../context/AppContext.jsx'

const statusConfig = {
  running:  { color: 'text-yellow-400', border: 'border-yellow-500/20', bg: 'bg-yellow-500/10' },
  complete: { color: 'text-green-400',  border: 'border-green-500/20',  bg: 'bg-green-500/10' },
  approved: { color: 'text-green-400',  border: 'border-green-500/20',  bg: 'bg-green-500/10' },
  failed:   { color: 'text-red-400',   border: 'border-red-500/20',    bg: 'bg-red-500/10' },
}

function formatStatus(value) {
  if (!value) return 'Unknown'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatDate(value) {
  if (!value) return 'Unknown time'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Unknown time' : date.toLocaleString()
}

export default function HistoryPage() {
  const { runHistory } = useApp()

  return (
    <Shell statusBadge={null}>
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mb-6">
        <h1 className="text-3xl font-semibold text-foreground tracking-tight leading-tight">
          Run history
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          Reopen previous architecture workspaces and monitor outcomes.
        </p>
      </div>

      {runHistory.length === 0 && (
        <div className="bg-card border border-border rounded-xl p-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <p className="text-sm text-muted-foreground">
            No runs yet. Start one from the setup screen.
          </p>
        </div>
      )}

      {runHistory.length > 0 && (
        <div
          className="bg-card border border-border rounded-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500"
          style={{ animationDelay: '50ms', animationFillMode: 'both' }}
        >
          {/* Table header */}
          <div className="border-b border-border bg-secondary/50">
            <div className="grid px-5 py-3" style={{ gridTemplateColumns: '1fr auto auto' }}>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Repository</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4">Status</span>
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</span>
            </div>
          </div>

          {runHistory.map((run, index) => {
            const cfg = statusConfig[run.status] || { color: 'text-muted-foreground', border: 'border-border', bg: 'bg-secondary' }
            const isLast = index === runHistory.length - 1

            return (
              <div
                key={run.jobId}
                className={`grid px-5 py-4 items-center hover:bg-secondary/30 transition-colors duration-150 cursor-pointer animate-in fade-in slide-in-from-left-2 ${isLast ? '' : 'border-b border-border'}`}
                style={{ gridTemplateColumns: '1fr auto auto', animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
              >
                {/* Repo info */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center shrink-0">
                      <FolderGit2 className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <span
                      className="font-mono text-sm text-foreground truncate"
                      title={run.repo || run.jobId}
                    >
                      {run.repo || run.jobId}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 pl-9">
                    <Clock3 className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{formatDate(run.createdAt)}</span>
                  </div>
                </div>

                {/* Status badge */}
                <div className="px-4">
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color} ${cfg.border} ${cfg.bg}`}>
                    {formatStatus(run.status)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <Link
                    to={`/architecture/${run.jobId}`}
                    className="border border-border rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-muted-foreground bg-transparent transition-all duration-150"
                    style={{ textDecoration: 'none' }}
                  >
                    Architecture
                  </Link>
                  <Link
                    to="/monitor"
                    className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity duration-150 hover:opacity-80"
                    style={{ textDecoration: 'none' }}
                  >
                    Monitor
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Shell>
  )
}
