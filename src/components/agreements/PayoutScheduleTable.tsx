'use client'

interface PayoutRowBase {
  period_from?: string | null
  period_to?: string | null
  no_of_days?: number | null
  due_by: string
  gross_interest: number | null
  tds_amount: number | null
  net_interest: number | null
  is_tds_only?: boolean
  is_principal_repayment?: boolean
  tds_filed?: boolean
  status?: string
}

interface Props {
  payouts: PayoutRowBase[]
  principalAmount?: number
}

function fmtCurrency(v: number | null | undefined) {
  if (v == null) return '—'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(v)
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  const parts = d.split('-')
  if (parts.length !== 3) return d
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

export default function PayoutScheduleTable({ payouts, principalAmount }: Props) {
  const interestRows = payouts.filter(r => !r.is_tds_only && !r.is_principal_repayment)
  const tdsRows = payouts.filter(r => r.is_tds_only)
  const principalRows = payouts.filter(r => r.is_principal_repayment)

  const interestTotal = {
    gross: interestRows.reduce((s, r) => s + (r.gross_interest ?? 0), 0),
    tds: interestRows.reduce((s, r) => s + (r.tds_amount ?? 0), 0),
    net: interestRows.reduce((s, r) => s + (r.net_interest ?? 0), 0),
  }

  const showStatus = interestRows.some(r => r.status !== undefined)

  return (
    <div className="space-y-5">

      {/* ── Interest Payouts ── */}
      {interestRows.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
            Interest Payouts ({interestRows.length})
          </h4>
          <div className="overflow-x-auto rounded-lg border border-slate-700">
            <table className="min-w-full text-sm text-slate-300">
              <thead>
                <tr className="bg-slate-800/60 text-xs text-slate-400">
                  <th className="py-2 px-3 text-left font-semibold">#</th>
                  <th className="py-2 px-3 text-left font-semibold">Period</th>
                  <th className="py-2 px-3 text-right font-semibold">Days</th>
                  <th className="py-2 px-3 text-left font-semibold">Due By</th>
                  <th className="py-2 px-3 text-right font-semibold">Gross</th>
                  <th className="py-2 px-3 text-right font-semibold">TDS</th>
                  <th className="py-2 px-3 text-right font-semibold">Net</th>
                  {showStatus && <th className="py-2 px-3 text-center font-semibold">Status</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {interestRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 px-3 text-xs text-slate-500 font-mono">{idx + 1}</td>
                    <td className="py-2 px-3 text-xs whitespace-nowrap">
                      {fmtDate(row.period_from)} – {fmtDate(row.period_to)}
                    </td>
                    <td className="py-2 px-3 text-right text-xs text-slate-500">
                      {row.no_of_days ?? '—'}
                    </td>
                    <td className="py-2 px-3 text-xs whitespace-nowrap">{fmtDate(row.due_by)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs tabular-nums">{fmtCurrency(row.gross_interest)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs tabular-nums text-red-400/80">{fmtCurrency(row.tds_amount)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs tabular-nums text-emerald-400">{fmtCurrency(row.net_interest)}</td>
                    {showStatus && (
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                          row.status === 'paid' ? 'bg-green-900/40 text-green-400' :
                          row.status === 'overdue' ? 'bg-red-900/40 text-red-400' :
                          row.status === 'notified' ? 'bg-amber-900/40 text-amber-400' :
                          'bg-slate-700 text-slate-300'
                        }`}>{row.status}</span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800/40 border-t-2 border-slate-600">
                  <td colSpan={4} className="py-2 px-3 text-xs font-bold text-slate-100 uppercase tracking-wide">Total</td>
                  <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-slate-100 tabular-nums">{fmtCurrency(interestTotal.gross)}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-red-400 tabular-nums">{fmtCurrency(interestTotal.tds)}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-emerald-400 tabular-nums">{fmtCurrency(interestTotal.net)}</td>
                  {showStatus && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── TDS Filing Requirements ── */}
      {tdsRows.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
            TDS Filing Requirements ({tdsRows.length})
          </h4>
          <div className="overflow-x-auto rounded-lg border border-violet-800/30">
            <table className="min-w-full text-sm text-slate-300">
              <thead>
                <tr className="bg-violet-900/20 text-xs text-violet-300/70">
                  <th className="py-2 px-3 text-left font-semibold">#</th>
                  <th className="py-2 px-3 text-left font-semibold">FY End</th>
                  <th className="py-2 px-3 text-right font-semibold">Accrued Interest</th>
                  <th className="py-2 px-3 text-right font-semibold">TDS Amount</th>
                  {tdsRows.some(r => r.status !== undefined) && (
                    <th className="py-2 px-3 text-center font-semibold">Status</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-800/20">
                {tdsRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-violet-900/5 transition-colors">
                    <td className="py-2 px-3 text-xs text-slate-500 font-mono">{idx + 1}</td>
                    <td className="py-2 px-3 text-xs">{fmtDate(row.due_by)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs tabular-nums">{fmtCurrency(row.gross_interest)}</td>
                    <td className="py-2 px-3 text-right font-mono text-xs tabular-nums text-red-400/80">{fmtCurrency(row.tds_amount)}</td>
                    {tdsRows.some(r => r.status !== undefined) && (
                      <td className="py-2 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          row.tds_filed ? 'bg-green-900/40 text-green-400' : 'bg-red-900/30 text-red-400'
                        }`}>
                          {row.tds_filed ? 'Filed' : 'Not Filed'}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Maturity Payout ── */}
      {principalRows.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
            Maturity Payout
          </h4>
          {principalRows.map((row, idx) => {
            const rawGross = row.gross_interest ?? 0
            const gross = rawGross === 0 && principalAmount ? principalAmount : rawGross
            const tds = row.tds_amount ?? 0
            const interestEarned = principalAmount && gross > principalAmount * 1.01
              ? gross - principalAmount
              : null
            const showStatus = row.status !== undefined
            return (
              <div key={idx} className="rounded-lg border border-amber-800/30 overflow-hidden">
                <div className="bg-amber-900/10 px-4 py-3 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs text-slate-400">Scheduled for {fmtDate(row.due_by)}</p>
                    <p className="text-lg font-bold text-amber-200">{fmtCurrency(gross - tds)}</p>
                    {interestEarned !== null && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Interest earned: {fmtCurrency(interestEarned)}
                        {tds > 0 && <> · TDS: {fmtCurrency(tds)}</>}
                        {' '}· Principal returned: {fmtCurrency(principalAmount!)}
                      </p>
                    )}
                  </div>
                  {showStatus && (
                    <span className={`inline-block px-2.5 py-1 rounded text-xs font-semibold capitalize flex-shrink-0 ${
                      row.status === 'paid' ? 'bg-green-900/40 text-green-400' :
                      row.status === 'overdue' ? 'bg-red-900/40 text-red-400' :
                      'bg-slate-700 text-slate-300'
                    }`}>{row.status}</span>
                  )}
                </div>
                {interestEarned !== null && (
                  <div className="bg-amber-900/5 border-t border-amber-800/20 px-4 py-2 grid grid-cols-3 gap-2 text-xs">
                    <div><span className="text-slate-500">Interest</span><br /><span className="font-mono text-slate-200">{fmtCurrency(interestEarned)}</span></div>
                    <div><span className="text-slate-500">TDS</span><br /><span className="font-mono text-red-400/80">{fmtCurrency(tds)}</span></div>
                    <div><span className="text-slate-500">Net Interest</span><br /><span className="font-mono text-emerald-400">{fmtCurrency(interestEarned - tds)}</span></div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
