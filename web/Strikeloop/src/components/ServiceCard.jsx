export default function ServiceCard({ name, icon: Icon, spec, monthlyCost, reasoning }) {
  return (
    <div style={{
      background: '#111111',
      border: '1px solid #1F1F1F',
      borderRadius: 12,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 0,
      transition: 'border-color 100ms ease',
    }}
      onMouseEnter={e => e.currentTarget.style.borderColor = '#2E2E2E'}
      onMouseLeave={e => e.currentTarget.style.borderColor = '#1F1F1F'}
    >
      {/* Row 1 — icon + name + cost */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {Icon && (
            <div style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#1F1F1F',
              borderRadius: 6,
              flexShrink: 0,
            }}>
              <Icon size={14} color="#A1A1AA" />
            </div>
          )}
          <span style={{ fontSize: 13, fontWeight: 500, color: '#F5F5F5' }}>{name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 1, flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 500, color: '#F5F5F5', letterSpacing: '-0.02em' }}>
            ${monthlyCost > 0 ? Math.round(monthlyCost) : '0'}
          </span>
          <span style={{ fontSize: 11, color: '#52525B', marginLeft: 1 }}>/mo</span>
        </div>
      </div>

      {/* Row 2 — spec */}
      <p style={{
        margin: '8px 0 0',
        fontFamily: 'Geist Mono, monospace',
        fontSize: 11,
        color: '#52525B',
        letterSpacing: '0.02em',
        lineHeight: 1.5,
      }}>
        {spec}
      </p>

      {/* Row 3 — reasoning */}
      {reasoning && (
        <p style={{
          margin: '10px 0 0',
          paddingTop: 10,
          borderTop: '1px solid #1F1F1F',
          fontSize: 12,
          color: '#A1A1AA',
          lineHeight: 1.5,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {reasoning}
        </p>
      )}
    </div>
  )
}
