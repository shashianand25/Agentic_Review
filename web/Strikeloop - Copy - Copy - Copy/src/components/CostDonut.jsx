import { PieChart, Pie, Cell, Tooltip } from 'recharts'

const COLOUR_MAP = {
  ec2:             '#378ADD',
  rds_compute:     '#22C55E',
  rds_storage:     '#16A34A',
  rds_connections: '#15803D',
  elasticache:     '#F59E0B',
  s3:              '#A1A1AA',
  alb:             '#52525B',
}

const LABEL_MAP = {
  ec2:             'EC2',
  rds_compute:     'RDS Compute',
  rds_storage:     'RDS Storage',
  rds_connections: 'RDS Proxy',
  elasticache:     'ElastiCache',
  s3:              'S3',
  alb:             'ALB',
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const { name, value } = payload[0].payload
  return (
    <div style={{
      background: '#111111',
      border: '1px solid #1F1F1F',
      borderRadius: 8,
      padding: '6px 12px',
      fontSize: 12,
      color: '#F5F5F5',
      pointerEvents: 'none',
    }}>
      <span style={{ color: '#A1A1AA' }}>{name}</span>
      <span style={{ marginLeft: 8, fontWeight: 500 }}>${value.toFixed(2)}</span>
    </div>
  )
}

export default function CostDonut({ services, total }) {
  const data = Object.entries(services)
    .filter(([, v]) => v.monthly_usd > 0)
    .map(([key, v]) => ({
      key,
      name: LABEL_MAP[key] || key,
      value: v.monthly_usd,
      color: COLOUR_MAP[key] || '#52525B',
    }))

  return (
    <div>
      {/* Chart */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <PieChart width={200} height={200}>
          <Pie
            data={data}
            cx={100}
            cy={100}
            innerRadius={60}
            outerRadius={90}
            paddingAngle={2}
            startAngle={90}
            endAngle={-270}
            strokeWidth={0}
            dataKey="value"
          >
            {data.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
          </Pie>

          {/* Centre label */}
          <text x={100} y={92} textAnchor="middle" dominantBaseline="middle">
            <tspan
              x={100}
              dy={0}
              style={{ fontSize: 22, fontWeight: 500, fill: '#F5F5F5', letterSpacing: '-0.02em' }}
            >
              ${Math.round(total)}
            </tspan>
          </text>
          <text x={100} y={113} textAnchor="middle">
            <tspan style={{ fontSize: 11, fill: '#52525B' }}>per month</tspan>
          </text>

          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
        {data.map((entry) => (
          <div key={entry.key} style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: entry.color,
                flexShrink: 0,
              }} />
              <span style={{ fontSize: 12, color: '#A1A1AA' }}>{entry.name}</span>
            </div>
            <span style={{ fontSize: 12, color: '#52525B', fontFamily: 'Geist Mono, monospace' }}>
              ${entry.value.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
