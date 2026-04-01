function toneColor(tone) {
  if (tone === 'healthy') return '#22C55E'
  if (tone === 'degraded') return '#F59E0B'
  if (tone === 'critical') return '#EF4444'
  return '#52525B'
}

export default function MetricTile({ label, value, status, tone = 'neutral' }) {
  const dotColor = toneColor(tone)

  return (
    <div
      style={{
        background: '#111111',
        border: '1px solid #1F1F1F',
        borderRadius: 12,
        padding: '12px 16px',
      }}
    >
      <p
        style={{
          fontSize: 11,
          color: '#52525B',
          margin: 0,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </p>

      <p
        style={{
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          color: '#F5F5F5',
          margin: '6px 0 8px',
          lineHeight: 1.2,
        }}
      >
        {value}
      </p>

      <div style={{ minHeight: 16 }}>
        {status && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: dotColor,
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 11, color: '#A1A1AA', textTransform: 'capitalize' }}>
              {status}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
