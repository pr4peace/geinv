import type { DashboardKPIs } from '@/lib/kpi'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-1">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? 'text-slate-100'}`}>{value}</p>
    </div>
  )
}

interface Props {
  kpis: DashboardKPIs
}

export default function KPICards({ kpis }: Props) {
  return (
    <div className="grid grid-cols-6 gap-4">
      <Card label="Total Principal" value={fmt(kpis.total_principal)} />
      <Card label="Quarter Gross Interest" value={fmt(kpis.quarter_gross_interest)} />
      <Card label="Quarter TDS" value={fmt(kpis.quarter_tds)} />
      <Card label="Quarter Net Outflow" value={fmt(kpis.quarter_net_interest)} />
      <Card
        label="Overdue Payouts"
        value={String(kpis.overdue_count)}
        accent={kpis.overdue_count > 0 ? 'text-red-400' : 'text-slate-100'}
      />
      <Card
        label="Maturing in 90 Days"
        value={String(kpis.maturing_in_90_days.length)}
        accent={kpis.maturing_in_90_days.length > 0 ? 'text-amber-400' : 'text-slate-100'}
      />
    </div>
  )
}
