import { useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronRight, DollarSign, Edit2, Loader2, MessageSquare, Plus, Trash2 } from 'lucide-react'

const ACTION_META = {
  create: { icon: Plus, color: '#22C55E', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)' },
  modify: { icon: Edit2, color: '#F59E0B', bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.2)' },
  destroy: { icon: Trash2, color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' },
}

function ActionPill({ action }) {
  const style = ACTION_META[action] || ACTION_META.create
  return (
    <span
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        color: style.color,
        borderRadius: 999,
        fontSize: 11,
        padding: '2px 8px',
      }}
    >
      {action}
    </span>
  )
}

export default function ApprovalTab({ plan, loading, error, onApprove, onSuggest }) {
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [approving, setApproving] = useState(false)

  async function handleApprove() {
    if (approving) return
    setApproving(true)
    try {
      await onApprove()
    } finally {
      setApproving(false)
    }
  }

  async function handleSuggest() {
    if (!note.trim() || sending) return
    setSending(true)
    try {
      await onSuggest(note.trim())
      setSent(true)
      setNote('')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div
        style={{
          background: '#111111',
          border: '1px solid #1F1F1F',
          borderRadius: 12,
          padding: 20,
        }}
        className="animate-pulse"
      >
        <div style={{ height: 20, width: '40%', background: '#1F1F1F', borderRadius: 6, marginBottom: 10 }} />
        <div style={{ height: 14, width: '80%', background: '#1F1F1F', borderRadius: 6, marginBottom: 6 }} />
        <div style={{ height: 14, width: '70%', background: '#1F1F1F', borderRadius: 6 }} />
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.2)',
          borderRadius: 12,
          padding: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <AlertCircle size={14} color="#EF4444" />
        <span style={{ fontSize: 13, color: '#EF4444' }}>{error}</span>
      </div>
    )
  }

  if (!plan) return null

  const delta = Number(plan.cost_delta_usd) || 0
  const deltaColor = delta >= 0 ? '#F59E0B' : '#22C55E'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: 12, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: '#52525B' }}>Create</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, color: '#22C55E', fontWeight: 500 }}>{plan.resources_to_create}</p>
        </div>
        <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: 12, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: '#52525B' }}>Modify</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, color: '#F59E0B', fontWeight: 500 }}>{plan.resources_to_modify}</p>
        </div>
        <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: 12, padding: 14 }}>
          <p style={{ margin: 0, fontSize: 11, color: '#52525B' }}>Destroy</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, color: '#EF4444', fontWeight: 500 }}>{plan.resources_to_destroy}</p>
        </div>
      </div>

      <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: 12, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div>
            <p style={{ margin: 0, fontSize: 11, color: '#52525B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Cost delta</p>
            <p style={{ margin: '4px 0 0', fontSize: 22, color: '#F5F5F5', fontWeight: 500 }}>${plan.proposed_monthly_usd}/mo</p>
          </div>
          <span
            style={{
              border: `1px solid ${deltaColor === '#F59E0B' ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)'}`,
              background: deltaColor === '#F59E0B' ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)',
              color: deltaColor,
              borderRadius: 999,
              fontSize: 12,
              padding: '4px 10px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <DollarSign size={12} />
            {delta >= 0 ? '+' : '-'}${Math.abs(delta)}/mo
          </span>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12, color: '#A1A1AA', lineHeight: 1.6 }}>{plan.reasoning}</p>
      </div>

      <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #1F1F1F' }}>
          <p style={{ margin: 0, fontSize: 13, color: '#F5F5F5', fontWeight: 500 }}>Resources in plan</p>
        </div>
        {plan.resources.map((resource, index) => {
          const Icon = (ACTION_META[resource.action] || ACTION_META.create).icon
          const isLast = index === plan.resources.length - 1
          return (
            <div
              key={resource.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 16px',
                borderBottom: isLast ? 'none' : '1px solid #1F1F1F',
              }}
            >
              <Icon size={14} color={(ACTION_META[resource.action] || ACTION_META.create).color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontFamily: 'Geist Mono, monospace',
                    fontSize: 12,
                    color: '#F5F5F5',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                  title={resource.name}
                >
                  {resource.name}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#52525B' }}>{resource.description}</p>
              </div>
              <ActionPill action={resource.action} />
            </div>
          )
        })}
      </div>

      <button
        onClick={handleApprove}
        disabled={approving}
        style={{
          width: '100%',
          border: 'none',
          background: '#F5F5F5',
          color: '#0A0A0A',
          borderRadius: 12,
          padding: '12px 16px',
          fontSize: 14,
          fontWeight: 500,
          cursor: approving ? 'not-allowed' : 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 6,
          opacity: approving ? 0.8 : 1,
        }}
      >
        {approving ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : null}
        {approving ? 'Applying...' : 'Approve and apply infrastructure'}
        {!approving ? <ChevronRight size={16} /> : null}
      </button>

      <div style={{ background: '#111111', border: '1px solid #1F1F1F', borderRadius: 12, padding: 14 }}>
        <p style={{ margin: 0, fontSize: 12, color: '#52525B' }}>Have a different approach?</p>
        {sent ? (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CheckCircle2 size={14} color="#22C55E" />
            <span style={{ fontSize: 12, color: '#A1A1AA' }}>Suggestion sent. The AI will revise this plan.</span>
          </div>
        ) : (
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Can we reduce cost using spot instances?"
              style={{
                flex: 1,
                background: 'transparent',
                border: '1px solid #1F1F1F',
                borderRadius: 8,
                color: '#F5F5F5',
                fontSize: 13,
                padding: '8px 10px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleSuggest}
              disabled={!note.trim() || sending}
              style={{
                border: '1px solid #1F1F1F',
                background: 'transparent',
                borderRadius: 8,
                color: note.trim() ? '#F5F5F5' : '#52525B',
                fontSize: 12,
                padding: '0 12px',
                cursor: !note.trim() || sending ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                opacity: !note.trim() || sending ? 0.6 : 1,
              }}
            >
              <MessageSquare size={13} />
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
