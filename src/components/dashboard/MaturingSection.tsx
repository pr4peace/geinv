import { format, parseISO } from 'date-fns'
import type { MaturingRow } from '@/lib/dashboard-reminders'
import Link from 'next/link'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

interface Props {
  agreements: MaturingRow[]
  totalPrincipal: number
  monthLabel: string
}

export default function MaturingSection({ agreements, totalPrincipal, monthLabel }: Props) {
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-sm font-bold text-slate-100">Maturing This Month</h2>
        {agreements.length > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-emerald-900/60 text-emerald-300 text-xs font-semibold">
            {agreements.length} agreement{agreements.length > 1 ? 's' : ''}
          </span>
        )}
        {agreements.length > 0 && (
          <span className="ml-auto text-xs text-slate-500">{fmt(totalPrincipal)} principal</span>
        )}
      </div>

      {agreements.length === 0 ? (
        <p className="text-sm text-slate-500 italic">No agreements maturing in {monthLabel}.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {agreements.map(a => (
            <Link
              key={a.id}
              href={`/agreements/${a.id}`}
              className="block bg-slate-800/60 border border-slate-700 border-l-4 border-l-emerald-500 rounded-lg p-3 sm:p-4 hover:bg-slate-700/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100 truncate">{a.investor_name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Matures {format(parseISO(a.maturity_date), 'dd MMM yyyy')} · {a.reference_id} · {capitalize(a.interest_type)}
                  </p>
                </div>
                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                  <p className="text-sm font-bold text-emerald-400">{fmt(a.principal_amount)}</p>
                  <span className="bg-emerald-900/50 text-emerald-300 text-xs px-2 py-0.5 rounded">
                    {a.daysRemaining <= 0 ? 'Today' : `${a.daysRemaining}d`}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
