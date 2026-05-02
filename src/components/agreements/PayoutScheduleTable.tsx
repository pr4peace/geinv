'use client'

interface PayoutRowBase {
  period_from?: string | null
  period_to?: string | null
  due_by: string
  gross_interest: number | null
  tds_amount: number | null
  net_interest: number | null
  is_tds_only?: boolean
  is_principal_repayment?: boolean
  status?: string
}

interface Props {
  payouts: PayoutRowBase[]
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return dateStr }
}

function fmtCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)
}

function getFY(dateStr: string): string {
  const d = new Date(dateStr)
  const m = d.getMonth()
  const y = d.getFullYear()
  if (m >= 3) return `FY ${y}-${String(y + 1).slice(2)}`
  return `FY ${y - 1}-${String(y).slice(2)}`
}

export default function PayoutScheduleTable({ payouts }: Props) {
  const sorted = payouts.slice().sort((a, b) => a.due_by.localeCompare(b.due_by))

  const fyGroups: Record<string, typeof sorted> = {}
  for (const row of sorted) {
    const fy = getFY(row.due_by ?? row.period_to ?? '')
    if (!fyGroups[fy]) fyGroups[fy] = []
    fyGroups[fy].push(row)
  }
  const fyOrder = Object.keys(fyGroups).sort()

  const grandTotal = { gross: 0, tds: 0, net: 0 }
  for (const row of sorted) {
    if (!row.is_tds_only) {
      grandTotal.gross += row.gross_interest ?? 0
      grandTotal.tds += row.tds_amount ?? 0
      grandTotal.net += row.net_interest ?? 0
    }
  }

  if (payouts.length === 0) {
    return <p className="text-slate-500 text-sm italic">No payout schedule available.</p>
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="min-w-full text-sm text-slate-300">
        <thead>
          <tr className="bg-slate-800/60 text-xs text-slate-400">
            <th className="py-2 px-3 text-left font-semibold">#</th>
            <th className="py-2 px-3 text-left font-semibold">Period</th>
            <th className="py-2 px-3 text-left font-semibold">Due By</th>
            <th className="py-2 px-3 text-right font-semibold">Gross</th>
            <th className="py-2 px-3 text-right font-semibold">TDS</th>
            <th className="py-2 px-3 text-right font-semibold">Net</th>
            <th className="py-2 px-3 text-center font-semibold">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/40">
          {fyOrder.map((fy) => {
            const rows = fyGroups[fy]
            const fyTotals = { gross: 0, tds: 0, net: 0 }
            for (const r of rows) {
              if (!r.is_tds_only) {
                fyTotals.gross += r.gross_interest ?? 0
                fyTotals.tds += r.tds_amount ?? 0
                fyTotals.net += r.net_interest ?? 0
              }
            }

            return (
              <>
                {rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 px-3 text-xs text-slate-500 font-mono">{idx + 1}</td>
                    <td className="py-2 px-3 text-xs whitespace-nowrap">
                      {row.is_tds_only ? (
                        <span className="text-violet-400/80">TDS Filing</span>
                      ) : row.is_principal_repayment ? (
                        <span className="text-amber-400/80">Principal Repayment</span>
                      ) : (
                        `${fmtDate(row.period_from)} – ${fmtDate(row.period_to)}`
                      )}
                    </td>
                    <td className="py-2 px-3 text-xs whitespace-nowrap">{fmtDate(row.due_by)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs tabular-nums">{fmtCurrency(row.gross_interest)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs tabular-nums text-red-400/80">{fmtCurrency(row.tds_amount)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs tabular-nums text-emerald-400">{fmtCurrency(row.net_interest)}</td>
                    <td className="py-2 px-3 text-center">
                      {row.status ? (
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                          row.status === 'paid' ? 'bg-green-900/40 text-green-400' :
                          row.status === 'overdue' ? 'bg-red-900/40 text-red-400' :
                          row.status === 'notified' ? 'bg-amber-900/40 text-amber-400' :
                          'bg-slate-700 text-slate-300'
                        }`}>{row.status}</span>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-800/20 border-t border-slate-700/60">
                  <td colSpan={3} className="py-1.5 px-3 text-xs font-bold text-slate-400">{fy} Subtotal</td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs font-semibold text-slate-200 tabular-nums">{fmtCurrency(fyTotals.gross)}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs font-semibold text-red-400 tabular-nums">{fmtCurrency(fyTotals.tds)}</td>
                  <td className="py-1.5 px-3 text-right font-mono text-xs font-semibold text-emerald-400 tabular-nums">{fmtCurrency(fyTotals.net)}</td>
                  <td></td>
                </tr>
              </>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="bg-slate-800/40 border-t-2 border-slate-600">
            <td colSpan={3} className="py-2 px-3 text-xs font-bold text-slate-100 uppercase tracking-wide">Grand Total</td>
            <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-slate-100 tabular-nums">{fmtCurrency(grandTotal.gross)}</td>
            <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-red-400 tabular-nums">{fmtCurrency(grandTotal.tds)}</td>
            <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-emerald-400 tabular-nums">{fmtCurrency(grandTotal.net)}</td>
            <td></td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
