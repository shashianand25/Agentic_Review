import { Line, LineChart, ResponsiveContainer } from 'recharts'

export default function SparklineChart({ points, color = '#22C55E', height = 40 }) {
  const safePoints = Array.isArray(points) && points.length > 0 ? points : [0, 0]
  const data = safePoints.map((value, index) => ({
    index,
    value: Number(value) || 0,
  }))

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.8}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
