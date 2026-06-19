'use client'

// Phase 5F — reports-per-day trend for the Clinic Analytics section.

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

interface DayPoint {
  date:  string // YYYY-MM-DD
  count: number
}

interface Props {
  data: DayPoint[]
}

// "2026-06-19" → "06-19" to keep the axis compact.
function shortDay(date: string): string {
  return date.slice(5)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null
  const d: DayPoint = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-gray-900">{d.date}</p>
      <p className="text-gray-600 mt-0.5">
        <span className="font-medium text-blue-600">{d.count}</span> report{d.count !== 1 ? 's' : ''}
      </p>
    </div>
  )
}

export function ReportsTrend({ data }: Props) {
  const total = data.reduce((a, d) => a + d.count, 0)
  if (total === 0) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-gray-400">
        No finalized reports in this period.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="reportsTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDay}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#e2e8f0' }} />
        <Area
          type="monotone"
          dataKey="count"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#reportsTrendFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
