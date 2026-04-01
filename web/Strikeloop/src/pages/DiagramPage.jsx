import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { GitBranch } from 'lucide-react'
import Shell from '../components/Shell.jsx'
import ArchitectureDiagram from '../components/ArchitectureDiagram.jsx'
import { getReport, getRecommendation, getIaC } from '../lib/api.js'

export default function DiagramPage() {
  const { jobId } = useParams()
  const [report, setReport] = useState(null)
  const [recommendation, setRecommendation] = useState(null)
  const [iac, setIac] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getReport(jobId), getRecommendation(jobId), getIaC(jobId)])
      .then(([r, rec, i]) => { setReport(r); setRecommendation(rec); setIac(i); setLoading(false) })
      .catch(() => setLoading(false))
  }, [jobId])

  const badge = (
    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-blue-500/20 bg-blue-500/10 text-blue-400">
      AI Generated
    </span>
  )

  return (
    <Shell statusBadge={badge}>
      <div className="flex items-start justify-between mb-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Architecture Diagram</h1>
          {report && (
            <p className="text-sm text-muted-foreground mt-1.5 font-mono">
              {report.meta.repo} · {report.meta.framework}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-muted-foreground" />
          {iac && <span className="text-xs text-muted-foreground">{iac.resources_count} resources</span>}
        </div>
      </div>

      {loading ? (
        <div className="bg-card border border-border rounded-xl h-[500px] animate-pulse" />
      ) : (
        <div className="bg-card border border-border rounded-xl p-4 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '100ms', animationFillMode: 'both' }}>
          <ArchitectureDiagram
            hcl={iac?.terraform_hcl}
            totalCost={recommendation?.total_monthly_usd}
            resourceCount={iac?.resources_count}
          />
        </div>
      )}
    </Shell>
  )
}
