import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { ShieldAlert, AlertTriangle, Info, CheckCircle2 } from 'lucide-react'
import Shell from '../components/Shell.jsx'
import { getRisks, getPlan } from '../lib/api.js'

function DiffViewer({ diff }) {
  if (!diff || !diff.trim()) return null;
  const lines = diff.split('\n')
  return (
    <div className="mt-3 overflow-x-auto rounded-md border border-[#1c1c1c] bg-[#0a0a0a]" style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, lineHeight: 1.5 }}>
      {lines.map((line, i) => {
        let color = '#71717A'; let bg = 'transparent';
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

function RiskIcon({ severity }) {
  const norm = (severity || 'medium').toLowerCase()
  if (norm === 'high' || norm === 'critical') return <ShieldAlert className="w-5 h-5 text-red-400" />
  if (norm === 'medium') return <AlertTriangle className="w-5 h-5 text-amber-400" />
  return <Info className="w-5 h-5 text-blue-400" />
}

export default function CompliancePage() {
  const { jobId } = useParams()
  const [loading, setLoading] = useState(true)
  const [expandedPillar, setExpandedPillar] = useState('Security')

  const [risks, setRisks] = useState([])
  const [planResources, setPlanResources] = useState([])

  useEffect(() => {
    async function load() {
      try {
        const [riskData, planData] = await Promise.all([
          getRisks(jobId),
          getPlan(jobId)
        ])
        setRisks(riskData)
        setPlanResources(planData?.resources || [])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [jobId])

  const ALL_PILLARS = [
    'Security',
    'Reliability',
    'Cost Optimization',
    'Operational Excellence',
    'Performance Efficiency',
    'Sustainability'
  ]

  const byPillar = useMemo(() => {
    const map = {}
    ALL_PILLARS.forEach(p => {
      const pNorm = p.toLowerCase().replace(/ /g, '_')
      map[p] = risks.filter(r => (r.pillar || '').toLowerCase().replace(/ /g, '_') === pNorm)
    })
    return map
  }, [risks])

  if (loading) return <Shell><div className="flex h-64 items-center justify-center text-muted-foreground">Loading Code Fixes...</div></Shell>

  const currentRisks = byPillar[expandedPillar] || []

  return (
    <Shell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Compliance Guardrails</h1>
          <p className="text-sm text-muted-foreground mt-1">Direct code fixes categorised by AWS Well-Architected Pillars.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 items-start">
          
          {/* Sidebar Pillars */}
          <div className="w-full md:w-64 shrink-0 space-y-1">
            {ALL_PILLARS.map(p => {
              const active = p === expandedPillar
              const pCount = byPillar[p]?.length || 0
              return (
                <button
                  key={p}
                  onClick={() => setExpandedPillar(p)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between items-center transition-colors ${active ? 'bg-accent/10 border border-accent/20 text-accent font-medium' : 'hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent'}`}
                >
                  <span className="truncate">{p}</span>
                  {pCount > 0 && (
                    <span className="bg-amber-400/20 text-amber-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{pCount}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Fixes List */}
          <div className="flex-1 min-w-0 space-y-4">
            <h2 className="text-lg font-semibold text-foreground mb-4">{expandedPillar} Code Fixes</h2>
            
            {currentRisks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 bg-card border border-border rounded-xl text-muted-foreground">
                <CheckCircle2 className="w-8 h-8 opacity-20 mb-2" />
                <p className="text-sm font-medium">No violations discovered.</p>
                <p className="text-xs mt-1">Codebase aligns seamlessly with {expandedPillar}.</p>
              </div>
            ) : (
                currentRisks.map((r, idx) => {
                  const fix = planResources.find(p => p.name === r.id)
                  const severity = (r.severity || 'medium').toLowerCase()
                  return (
                    <div key={idx} className="bg-card border border-border hover:border-muted-foreground/30 rounded-xl overflow-hidden transition-all">
                      <div className="p-4 flex gap-4 items-start group">
                        <div className="mt-1 shrink-0">
                          <RiskIcon severity={severity} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded
                              ${severity === 'high' || severity === 'critical' ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 
                              severity === 'medium' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 
                              'bg-blue-500/10 text-blue-500 border border-blue-500/20'}`}>
                              {severity} IMPACT
                            </span>
                          </div>
                          <p className="text-sm font-medium text-foreground leading-relaxed">{r.title}</p>
                          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{r.description}</p>
                          
                          {/* Code Snippet Fix */}
                          {fix && fix.diff_unified ? (
                            <div className="mt-4 border-t border-border/50 pt-4">
                              <p className="text-xs font-semibold text-emerald-400 mb-2">Generated Auto-Fix</p>
                              <DiffViewer diff={fix.diff_unified} />
                            </div>
                          ) : (
                            <div className="mt-4 border-t border-border/50 pt-4">
                              <p className="text-xs font-semibold text-muted-foreground mb-2">Manual Action Required</p>
                              <p className="text-xs text-muted-foreground italic bg-sidebar py-2 px-3 rounded-lg border border-border">AI could not generate a safe auto-fix for this file. Recommended: {r.recommendation}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
            )}

          </div>
        </div>
      </div>
    </Shell>
  )
}
