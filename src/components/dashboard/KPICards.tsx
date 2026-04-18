import type { DashboardKPIs } from '@/lib/kpi'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

function Card({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: string
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-1">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold ${accent ?? 'text-slate-100'}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

interface Props {
  kpis: DashboardKPIs
}

export default function KPICards({ kpis }: Props) {
  const maturingCount = kpis.maturing_in_90_days.length
  const maturingPrincipal = kpis.maturing_in_90_days.reduce((s, a) => s + a.principal_amount, 0)

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      <Card
        label="Active Principal"
        value={fmt(kpis.active_principal)}
        sub={`Matured: ${fmt(kpis.matured_principal)}`}
        accent="text-green-400"
      />
      <Card
        label="Active Agreements"
        value={String(kpis.active_agreements)}
        sub={`Matured: ${kpis.matured_agreements}`}
        accent="text-green-400"
      />
      <Card label="Quarter Gross Interest" value={fmt(kpis.quarter_gross_interest)} />
      <Card label="Quarter TDS" value={fmt(kpis.quarter_tds)} />
      <Card label="Quarter Net Outflow" value={fmt(kpis.quarter_net_interest)} />
      <Card
        label="Overdue Payouts"
        value={String(kpis.overdue_count)}
        sub={kpis.overdue_count > 0 ? fmt(kpis.overdue_amount) : undefined}
        accent={kpis.overdue_count > 0 ? 'text-red-400' : 'text-slate-100'}
      />
      <Card
        label="Maturing (90 days)"
        value={maturingCount > 0 ? fmt(maturingPrincipal) : '—'}
        sub={maturingCount > 0 ? `${maturingCount} agreement${maturingCount > 1 ? 's' : ''}` : undefined}
        accent={maturingCount > 0 ? 'text-amber-400' : 'text-slate-100'}
      />
    </div>
  )
}
