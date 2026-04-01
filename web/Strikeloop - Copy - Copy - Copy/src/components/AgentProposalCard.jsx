import { useState } from 'react'

function urgencyStyle(urgency) {
  if (urgency === 'high') {
    return {
      border: 'rgba(239,68,68,0.2)',
      bg: 'rgba(239,68,68,0.08)',
      color: '#EF4444',
    }
  }

  if (urgency === 'medium') {
    return {
      border: 'rgba(245,158,11,0.2)',
      bg: 'rgba(245,158,11,0.08)',
      color: '#F59E0B',
    }
  }

  return {
    border: 'rgba(161,161,170,0.2)',
    bg: 'rgba(161,161,170,0.08)',
    color: '#A1A1AA',
  }
}

function formatCostDelta(value) {
  const num = Number(value) || 0
  const sign = num > 0 ? '+' : ''
  return `${sign}$${num.toFixed(2)}/mo`
}

export default function AgentProposalCard({ proposal, decision, onDecision }) {
  const [submitting, setSubmitting] = useState(false)
  const [actionError, setActionError] = useState(null)

  const urgency = urgencyStyle(proposal.urgency)
  const costDelta = Number(proposal.cost_delta_usd) || 0
  const costColor = costDelta <= 0 ? '#22C55E' : '#EF4444'

  const borderColor = decision === 'approved'
    ? 'rgba(34,197,94,0.35)'
    : decision === 'rejected'
      ? '#2E2E2E'
      : '#1F1F1F'

  async function handleAction(nextDecision) {
    if (submitting || decision) return

    setSubmitting(true)
    setActionError(null)
    try {
      await onDecision(proposal.id, nextDecision)
    } catch (err) {
      setActionError(err.message || 'Action failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        background: '#111111',
        border: `1px solid ${borderColor}`,
        borderRadius: 12,
        padding: 20,
        transition: 'border-color 150ms ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            style={{
              border: `1px solid ${urgency.border}`,
              background: urgency.bg,
              color: urgency.color,
              borderRadius: 999,
              padding: '2px 8px',
              fontSize: 11,
              textTransform: 'capitalize',
              flexShrink: 0,
            }}
          >
            {proposal.urgency}
          </span>

          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: '#F5F5F5',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={proposal.action}
          >
            {proposal.action}
          </p>
        </div>

        <span style={{ color: costColor, fontSize: 12, fontWeight: 500, flexShrink: 0 }}>
          {formatCostDelta(proposal.cost_delta_usd)}
        </span>
      </div>

      <p style={{ margin: '8px 0 0', color: '#A1A1AA', fontSize: 13, lineHeight: 1.6 }}>
        {proposal.reasoning}
      </p>

      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid #1F1F1F',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        {!decision && (
          <>
            <button
              onClick={() => handleAction('approve')}
              disabled={submitting}
              style={{
                background: '#F5F5F5',
                color: '#0A0A0A',
                border: 'none',
                borderRadius: 8,
                padding: '6px 16px',
                fontSize: 13,
                fontWeight: 500,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              Approve
            </button>

            <button
              onClick={() => handleAction('reject')}
              disabled={submitting}
              style={{
                background: 'transparent',
                color: '#A1A1AA',
                border: '1px solid #1F1F1F',
                borderRadius: 8,
                padding: '6px 16px',
                fontSize: 13,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
              }}
            >
              Reject
            </button>
          </>
        )}

        {decision === 'approved' && (
          <span style={{ fontSize: 13, color: '#22C55E', fontWeight: 500 }}>
            Approved
          </span>
        )}

        {decision === 'rejected' && (
          <span style={{ fontSize: 13, color: '#A1A1AA', fontWeight: 500 }}>
            Rejected
          </span>
        )}

        {actionError && (
          <span style={{ fontSize: 12, color: '#EF4444' }}>
            {actionError}
          </span>
        )}
      </div>
    </div>
  )
}
