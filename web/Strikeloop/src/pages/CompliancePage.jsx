import { useEffect, useState, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, ShieldAlert, CircleDashed, Save, Upload, Paperclip } from 'lucide-react'
import Shell from '../components/Shell.jsx'
import { getCompliance, updateControl, getRisks } from '../lib/api.js'

function controlIcon(status) {
  switch (status) {
    case 'compliant': return <CheckCircle2 className="w-5 h-5 text-emerald-400" />
    case 'needs_review': return <ShieldAlert className="w-5 h-5 text-amber-400" />
    case 'not_applicable': return <CircleDashed className="w-5 h-5 text-slate-500" />
    default: return <CircleDashed className="w-5 h-5 text-slate-500" />
  }
}

export default function CompliancePage() {
  const { jobId } = useParams()
  const [controls, setControls] = useState([])
  const [loading, setLoading] = useState(true)
  const [expandedPillar, setExpandedPillar] = useState('Security')
  const [editingControl, setEditingControl] = useState(null)
  
  const [editStatus, setEditStatus] = useState('compliant')
  const [editNotes, setEditNotes] = useState('')

  const [risks, setRisks] = useState([])

  useEffect(() => {
    async function load() {
      try {
        const [compData, riskData] = await Promise.all([
          getCompliance(jobId),
          getRisks(jobId)
        ])
        setControls(compData)
        setRisks(riskData)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [jobId])

  const pillars = useMemo(() => {
    const list = [...new Set(controls.map(c => c.pillar))]
    return list.sort()
  }, [controls])

  const byPillar = useMemo(() => {
    const map = {}
    pillars.forEach(p => map[p] = controls.filter(c => c.pillar === p))
    return map
  }, [controls, pillars])

  const openEditor = async (c) => {
    setEditingControl(c.id)
    setEditStatus(c.status)
    setEditNotes(c.notes || '')
  }

  const saveControl = async () => {
    try {
      const patch = { status: editStatus, notes: editNotes }
      await updateControl(jobId, editingControl, patch)
      setControls(prev => prev.map(c => c.id === editingControl ? { ...c, ...patch } : c))
      setEditingControl(null)
    } catch (err) {
      console.error(err)
      alert("Failed to save.")
    }
  }



  if (loading) return <Shell><div className="flex h-64 items-center justify-center text-muted-foreground">Loading Compliance Tracker...</div></Shell>

  return (
    <Shell>
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Compliance Tracker</h1>
          <p className="text-sm text-muted-foreground mt-1">Well-Architected Framework alignment. AI has pre-filled "Needs Review" for categories where issues were detected.</p>
        </div>

        <div className="flex flex-col md:flex-row gap-6 items-start">
          
          {/* Sidebar Pillars */}
          <div className="w-full md:w-64 shrink-0 space-y-1">
            {pillars.map(p => {
              const active = p === expandedPillar
              const pControls = byPillar[p]
              const needsReview = pControls.filter(c => c.status === 'needs_review').length
              return (
                <button
                  key={p}
                  onClick={() => setExpandedPillar(p)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between items-center transition-colors ${active ? 'bg-accent/10 border border-accent/20 text-accent font-medium' : 'hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent'}`}
                >
                  <span className="truncate">{p}</span>
                  {needsReview > 0 && (
                    <span className="bg-amber-400/20 text-amber-500 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{needsReview}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Controls List */}
          <div className="flex-1 min-w-0 space-y-4">
            <h2 className="text-lg font-semibold text-foreground mb-4">{expandedPillar} Controls</h2>
            
            {(byPillar[expandedPillar] || []).map(c => {
              const isEditing = editingControl === c.id
              return (
                <div key={c.id} className={`bg-card border rounded-xl overflow-hidden transition-all ${isEditing ? 'border-accent shadow-md ring-1 ring-accent/20' : 'border-border hover:border-muted-foreground/30'}`}>
                  {/* Header Row */}
                  <div 
                    className="p-4 flex gap-4 items-start cursor-pointer group"
                    onClick={() => !isEditing && openEditor(c)}
                  >
                    <div className="mt-1 shrink-0">
                      {controlIcon(c.status)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-mono font-semibold text-muted-foreground px-1.5 py-0.5 rounded bg-muted">{c.ref}</span>
                      </div>
                      <p className="text-sm font-medium text-foreground leading-relaxed">{c.question}</p>
                    </div>
                  </div>

                  {/* Editor Body */}
                  {isEditing && (
                    <div className="border-t border-border bg-sidebar p-4 space-y-5">
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Compliance Status</label>
                            <select className="w-full bg-background border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:border-accent outline-none" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                              <option value="compliant">Compliant</option>
                              <option value="needs_review">Needs Review / Gaps Found</option>
                              <option value="not_applicable">Not Applicable</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Assessment Notes</label>
                            <textarea className="w-full bg-background border border-border text-foreground rounded-lg px-3 py-2 text-sm focus:border-accent outline-none min-h-[100px]" placeholder="Document how this is enforced, or why it's not applicable..." value={editNotes} onChange={e => setEditNotes(e.target.value)}></textarea>
                          </div>
                        </div>

                        {/* AI Evidence / Mapped Risks */}
                        <div className="space-y-3">
                          <label className="text-xs font-semibold text-muted-foreground block">Automated AI Evidence</label>
                          <div className="border border-border rounded-lg bg-background p-4 min-h-[160px] max-h-[220px] overflow-y-auto">
                            {risks.filter(r => r.pillar === c.pillar).length > 0 ? (
                              <div className="space-y-3">
                                {risks.filter(r => r.pillar === c.pillar).map((r, i) => (
                                  <div key={i} className="flex gap-3 text-sm p-3 rounded-md bg-red-400/5 border border-red-400/10">
                                    <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                    <div>
                                      <p className="font-medium text-foreground">{r.title}</p>
                                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="flex flex-col items-center justify-center h-full text-center py-6 text-muted-foreground">
                                <CheckCircle2 className="w-8 h-8 opacity-20 mb-2" />
                                <p className="text-sm font-medium">No identified violations.</p>
                                <p className="text-xs mt-1">Codebase aligns with this compliance category.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-2">
                        <button className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setEditingControl(null)}>Cancel</button>
                        <button className="px-4 py-2 text-sm font-medium bg-accent text-accent-foreground rounded-lg inline-flex items-center gap-2 hover:bg-accent/90 shadow-sm" onClick={saveControl}><Save className="w-4 h-4" /> Save Assesment</button>
                      </div>

                    </div>
                  )}

                </div>
              )
            })}
          </div>

        </div>
      </div>
    </Shell>
  )
}
