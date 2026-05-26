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

  function StatusDot({ status }: { status?: string }) {
    if (!status) return null
    const dot = status === 'paid' ? 'sdot-paid' : status === 'overdue' ? 'sdot-overdue' : status === 'notified' ? 'sdot-notified' : 'sdot-pending'
    return <span className={`sdot ${dot} m-0`} title={status} />
  }

  return (
    <div className="space-y-8">

      {/* ── Interest Payouts ── */}
      {interestRows.length > 0 && (
        <div className="space-y-3">
          <h4 className="lbl font-bold text-ink-1">Interest Payouts ({interestRows.length})</h4>
          <div className="bg-surface border border-hairline rounded-sm overflow-hidden shadow-sm">
            <table className="border-collapse w-full text-xs">
              <thead>
                <tr className="bg-surface-2 border-b border-hairline-strong text-[10px] uppercase tracking-widest font-medium text-ink-4">
                  <th className="py-2 px-3 text-left w-8">#</th>
                  <th className="py-2 px-3 text-left">Period</th>
                  <th className="py-2 px-3 text-right">Days</th>
                  <th className="py-2 px-3 text-left">Due By</th>
                  <th className="py-2 px-3 text-right">Gross</th>
                  <th className="py-2 px-3 text-right">TDS</th>
                  <th className="py-2 px-3 text-right">Net</th>
                  {showStatus && <th className="py-2 px-3 text-center w-12">Status</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {interestRows.map((row, idx) => {
                  const isPaid = row.status === 'paid'
                  const isOverdue = row.status === 'overdue'
                  return (
                    <tr key={idx} className={`h-7 hover:bg-surface-2 transition-colors ${isOverdue ? 'bg-rust-soft/40' : ''} ${isPaid ? 'text-ink-4' : 'text-ink-2'}`}>
                      <td className="px-3 py-1 font-mono text-[10px] opacity-50">{idx + 1}</td>
                      <td className="px-3 py-1 whitespace-nowrap opacity-80">
                        {fmtDate(row.period_from)} – {fmtDate(row.period_to)}
                      </td>
                      <td className="px-3 py-1 text-right font-mono text-[10px] opacity-50">
                        {row.no_of_days ?? '—'}
                      </td>
                      <td className={`px-3 py-1 whitespace-nowrap font-medium ${isOverdue ? 'text-rust' : ''}`}>{fmtDate(row.due_by)}</td>
                      <td className="px-3 py-1 text-right num text-[11px] tabular-nums">{fmtCurrency(row.gross_interest)}</td>
                      <td className="px-3 py-1 text-right num text-[11px] tabular-nums opacity-70">{fmtCurrency(row.tds_amount)}</td>
                      <td className={`px-3 py-1 text-right num text-[11px] tabular-nums font-bold ${isPaid ? 'text-ink-4' : 'text-ink-1'}`}>{fmtCurrency(row.net_interest)}</td>
                      {showStatus && (
                        <td className="px-3 py-1 text-center">
                          <StatusDot status={row.status} />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-surface-2/50 border-t border-hairline-strong">
                <tr className="h-8">
                  <td colSpan={4} className="px-3 py-1 text-[10px] font-bold text-ink-3 uppercase tracking-widest">Total</td>
                  <td className="px-3 py-1 text-right num font-bold text-ink-2">{fmtCurrency(interestTotal.gross)}</td>
                  <td className="px-3 py-1 text-right num font-bold text-ink-3 opacity-70">{fmtCurrency(interestTotal.tds)}</td>
                  <td className="px-3 py-1 text-right num font-bold text-ink-1 text-[13px]">{fmtCurrency(interestTotal.net)}</td>
                  {showStatus && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── TDS Filing Requirements ── */}
      {tdsRows.length > 0 && (
        <div className="space-y-3">
          <h4 className="lbl font-bold text-ink-1">TDS Filing Requirements ({tdsRows.length})</h4>
          <div className="bg-surface border border-hairline rounded-sm overflow-hidden shadow-sm">
            <table className="border-collapse w-full text-xs">
              <thead>
                <tr className="bg-surface-2 border-b border-hairline-strong text-[10px] uppercase tracking-widest font-medium text-ink-4">
                  <th className="py-2 px-3 text-left w-8">#</th>
                  <th className="py-2 px-3 text-left">Filing Deadline</th>
                  <th className="py-2 px-3 text-right">TDS Amount</th>
                  {tdsRows.some(r => r.status !== undefined) && (
                    <th className="py-2 px-3 text-center w-16">Status</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {tdsRows.map((row, idx) => {
                  const isFiled = row.tds_filed
                  return (
                    <tr key={idx} className={`h-7 hover:bg-surface-2 transition-colors bg-clay-soft/30 ${isFiled ? 'text-ink-4' : 'text-ink-3'}`}>
                      <td className="px-3 py-1 font-mono text-[10px] opacity-50">{idx + 1}</td>
                      <td className="px-3 py-1 font-medium">{fmtDate(row.due_by)}</td>
                      <td className="px-3 py-1 text-right num font-bold">{fmtCurrency(row.tds_amount)}</td>
                      {tdsRows.some(r => r.status !== undefined) && (
                        <td className="px-3 py-1 text-center">
                          <span className={`sdot ${isFiled ? 'sdot-active' : 'sdot-overdue'} m-0`} title={isFiled ? 'Filed' : 'Not Filed'} />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Maturity Payout ── */}
      {principalRows.length > 0 && (
        <div className="space-y-3">
          <h4 className="lbl font-bold text-ink-1">Maturity Payout</h4>
          {principalRows.map((row, idx) => {
            const rawGross = row.gross_interest ?? 0
            const gross = rawGross === 0 && principalAmount ? principalAmount : rawGross
            const tds = row.tds_amount ?? 0
            const interestEarned = principalAmount && gross > principalAmount * 1.01
              ? gross - principalAmount
              : null
            return (
              <div key={idx} className="bg-surface border border-hairline rounded-sm overflow-hidden shadow-sm">
                <div className="bg-earth-brown/5 px-6 py-4 flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="lbl opacity-70">Scheduled for {fmtDate(row.due_by)}</p>
                    <p className="text-2xl font-bold num text-earth-brown leading-none">{fmtCurrency(gross - tds)}</p>
                    {interestEarned !== null && (
                      <p className="text-[11px] text-ink-4 mt-1">
                        Interest earned: <span className="num font-medium">{fmtCurrency(interestEarned)}</span>
                        {tds > 0 && <> · TDS: <span className="num font-medium">{fmtCurrency(tds)}</span></>}
                        {' '}· Principal: <span className="num font-medium">{fmtCurrency(principalAmount!)}</span>
                      </p>
                    )}
                  </div>
                  {row.status && (
                    <div className="flex flex-col items-center gap-1">
                      <StatusDot status={row.status} />
                      <span className="text-[9px] font-bold uppercase text-ink-4 tracking-tighter">{row.status}</span>
                    </div>
                  )}
                </div>
                {interestEarned !== null && (
                  <div className="bg-surface border-t border-hairline px-6 py-3 grid grid-cols-3 gap-6">
                    <div><p className="lbl text-[9px] mb-0.5 opacity-60">Interest</p><p className="num text-xs font-bold text-ink-2">{fmtCurrency(interestEarned)}</p></div>
                    <div><p className="lbl text-[9px] mb-0.5 opacity-60">TDS</p><p className="num text-xs font-bold text-rust">{fmtCurrency(tds)}</p></div>
                    <div><p className="lbl text-[9px] mb-0.5 opacity-60">Net Interest</p><p className="num text-xs font-bold text-gain">{fmtCurrency(interestEarned - tds)}</p></div>
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
