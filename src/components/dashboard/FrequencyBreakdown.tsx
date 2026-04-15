import type { FrequencyBreakdown } from '@/lib/kpi'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

const LABELS: Record<keyof FrequencyBreakdown, string> = {
  quarterly: 'Quarterly',
  annual: 'Annual',
  cumulative: 'Cumulative',
}

interface Props {
  frequency: FrequencyBreakdown
}

export default function FrequencyBreakdownPanel({ frequency }: Props) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {(Object.keys(frequency) as Array<keyof FrequencyBreakdown>).map((key) => {
        const data = frequency[key]
        return (
          <div key={key} className="bg-slate-800 border border-slate-700 rounded-xl p-5">
            <p className="text-sm font-semibold text-slate-300 mb-3">{LABELS[key]}</p>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Agreements</span>
                <span className="text-sm font-medium text-slate-100">{data.count}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Total Principal</span>
                <span className="text-sm font-medium text-slate-100">{fmt(data.principal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-400">Expected Interest</span>
                <span className="text-sm font-medium text-emerald-400">{fmt(data.total_expected_interest)}</span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
