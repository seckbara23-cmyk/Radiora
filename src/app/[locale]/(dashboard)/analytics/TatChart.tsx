'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

interface TatDataPoint {
  modality:   string
  avgMinutes: number
  count:      number
}

interface Props {
  data: TatDataPoint[]
}

const MODALITY_COLORS: Record<string, string> = {
  CT:  '#3b82f6',
  MRI: '#8b5cf6',
  XR:  '#10b981',
  US:  '#f59e0b',
  NM:  '#ef4444',
  PT:  '#ec4899',
  MG:  '#06b6d4',
  DX:  '#84cc16',
  CR:  '#f97316',
}

function minutesToLabel(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null
  const d: TatDataPoint = payload[0].payload
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-gray-900">{d.modality}</p>
      <p className="text-gray-600 mt-0.5">Avg TAT: <span className="font-medium text-blue-600">{minutesToLabel(d.avgMinutes)}</span></p>
      <p className="text-gray-500">{d.count} report{d.count !== 1 ? 's' : ''}</p>
    </div>
  )
}

export function TatChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-gray-400">
        No finalized reports in this period.
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="modality"
          tick={{ fontSize: 11, fill: '#6b7280' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tickFormatter={minutesToLabel}
          tick={{ fontSize: 10, fill: '#9ca3af' }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
        <Bar dataKey="avgMinutes" radius={[4, 4, 0, 0]} maxBarSize={48}>
          {data.map((entry) => (
            <Cell
              key={entry.modality}
              fill={MODALITY_COLORS[entry.modality] ?? '#6366f1'}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
