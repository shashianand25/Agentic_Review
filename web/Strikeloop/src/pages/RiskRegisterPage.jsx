import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, Clock, CheckCircle2, ShieldCheck, ChevronDown, Save } from 'lucide-react'
import Shell from '../components/Shell.jsx'
import { getRisks, updateRisk } from '../lib/api.js'

function severityColor(s) {
  if (s === 'critical') return 'text-red-400 bg-red-400/10 border-red-400/20'
  if (s === 'high')     return 'text-red-300 bg-red-400/10 border-red-400/20'
  if (s === 'medium')   return 'text-amber-400 bg-amber-400/10 border-amber-400/20'
  return 'text-blue-400 bg-blue-400/10 border-blue-400/20'
}

function statusInfo(status) {
  switch (status) {
    case 'open': return { label: 'Open', icon: AlertTriangle, color: 'text-red-400' }
    case 'in_progress': return { label: 'In Progress', icon: Clock, color: 'text-amber-400' }
    case 'accepted': return { label: 'Risk Accepted', icon: CheckCircle2, color: 'text-slate-400' }
    case 'remediated': return { label: 'Remediated', icon: ShieldCheck, color: 'text-emerald-400' }
    default: return { label: 'Open', icon: AlertTriangle, color: 'text-red-400' }
  }
}

export default function RiskRegisterPage() {
  const { jobId } = useParams()
  const [risks, setRisks] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingRisk, setEditingRisk] = useState(null)
  
  // Edit form state
  const [editStatus, setEditStatus] = useState('open')
  const [editOwner, setEditOwner] = useState('')
  const [editNotes, setEditNotes] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const data = await getRisks(jobId)
        setRisks(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [jobId])

  const openEditor = (r) => {
    setEditingRisk(r.id)
    setEditStatus(r.status || 'open')
    setEditOwner(r.owner || '')
    setEditNotes(r.notes || '')
  }

  const saveRisk = async () => {
    try {
      const patch = { status: editStatus, owner: editOwner, notes: editNotes }
      await updateRisk(jobId, editingRisk, patch)
      setRisks(prev => prev.map(r => r.id === editingRisk ? { ...r, ...patch } : r))
      setEditingRisk(null)
    } catch (err) {
      console.error(err)
      alert("Failed to save risk.")
    }
  }

  if (loading) return <Shell><div className="flex h-64 items-center justify-center text-muted-foreground"><Clock className="animate-spin mr-2" /> Loading Risk Register...</div></Shell>

  return (
    <Shell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Risk Register</h1>
            <p className="text-sm text-muted-foreground mt-1">Track, assign, and remediate identified architecture risks.</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-medium text-foreground">Risk ID & Title</th>
                <th className="px-4 py-3 font-medium text-foreground">Severity</th>
                <th className="px-4 py-3 font-medium text-foreground">Pillar</th>
                <th className="px-4 py-3 font-medium text-foreground">Status</th>
                <th className="px-4 py-3 font-medium text-foreground">Owner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {risks.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                    No risks currently tracked.
                  </td>
                </tr>
              )}
              {risks.map(r => {
                const sInfo = statusInfo(r.status)
                const isEditing = editingRisk === r.id
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors group cursor-pointer" onClick={() => !isEditing && openEditor(r)}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground break-words max-w-sm">{r.title}</div>
                      <div className="text-xs text-muted-foreground font-mono mt-1">{r.id}</div>
                      {isEditing && (
                        <div className="mt-4 space-y-4 p-4 border border-border rounded-lg bg-background/50 shadow-inner" onClick={e => e.stopPropagation()}>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Status</label>
                              <select className="w-full bg-secondary border border-border text-foreground rounded-md px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                                <option value="open">Open</option>
                                <option value="in_progress">In Progress</option>
                                <option value="accepted">Risk Accepted</option>
                                <option value="remediated">Remediated</option>
                              </select>
                            </div>
                            <div>
                              <label className="text-xs font-semibold text-muted-foreground mb-1 block">Owner</label>
                              <input type="text" className="w-full bg-secondary border border-border text-foreground rounded-md px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none" placeholder="e.g. Security Team" value={editOwner} onChange={e => setEditOwner(e.target.value)} />
                            </div>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-muted-foreground mb-1 block">Notes / Mitigation</label>
                            <textarea className="w-full bg-secondary border border-border text-foreground rounded-md px-3 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent outline-none min-h-[80px]" placeholder="Add context, mitigation steps, or acceptance justification..." value={editNotes} onChange={e => setEditNotes(e.target.value)}></textarea>
                          </div>
                          <div className="flex justify-end gap-2">
                            <button className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setEditingRisk(null)}>Cancel</button>
                            <button className="px-3 py-1.5 text-sm font-medium bg-accent text-accent-foreground rounded inline-flex items-center gap-1.5 hover:bg-accent/90" onClick={saveRisk}><Save className="w-4 h-4" /> Save</button>
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${severityColor(r.severity)}`}>
                        {r.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <span className="text-xs text-muted-foreground">{r.pillar}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="inline-flex items-center gap-1.5">
                        <sInfo.icon className={`w-4 h-4 ${sInfo.color}`} />
                        <span className="text-sm font-medium text-foreground">{sInfo.label}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-muted-foreground">
                      {r.owner || <span className="italic opacity-50">Unassigned</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Shell>
  )
}
