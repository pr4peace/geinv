'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PayoutSchedule } from '@/types/database'
import { UndoToast } from '@/components/UndoToast'

interface Props {
  agreementId: string
  payouts: PayoutSchedule[]
  userRole: string
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

export default function PayoutScheduleSection({ agreementId, payouts, userRole }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null)
  const isCoordinator = userRole !== 'salesperson'

  const sorted = payouts.slice().sort((a, b) => a.due_by.localeCompare(b.due_by))
  const interestRows = sorted.filter(r => !r.is_principal_repayment && !r.is_tds_only)
  const tdsRows = sorted.filter(r => r.is_tds_only).sort((a, b) => a.due_by.localeCompare(b.due_by))
  const principalRows = sorted.filter(r => r.is_principal_repayment)

  const todayStr = new Date().toISOString().split('T')[0]
  const hasPastPending = interestRows.some(r => r.status !== 'paid' && r.due_by < todayStr)

  // Grand totals (interest rows only)
  const totals = { gross: 0, tds: 0, net: 0 }
  for (const row of interestRows) {
    totals.gross += row.gross_interest
    totals.tds += row.tds_amount
    totals.net += row.net_interest
  }

  async function markAsPaid(payoutId: string) {
    setLoading(payoutId)
    setError(null)
    try {
      const res = await fetch(`/api/agreements/${agreementId}/payouts/${payoutId}/paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error ?? 'Failed to mark as paid')
      } else {
        setUndoToast({ message: 'Payout marked as paid', onUndo: async () => { setUndoToast(null); await fetch(`/api/agreements/${agreementId}/payouts/${payoutId}/revert`, { method: 'POST' }); router.refresh() } })
        router.refresh()
      }
    } finally { setLoading(null) }
  }

  async function revertPayout(payoutId: string) {
    setLoading(payoutId)
    setError(null)
    try {
      const res = await fetch(`/api/agreements/${agreementId}/payouts/${payoutId}/revert`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error ?? 'Failed to revert payout')
      } else {
        setUndoToast({ message: 'Payout reverted to pending', onUndo: () => markAsPaid(payoutId) })
        router.refresh()
      }
    } finally { setLoading(null) }
  }

  async function markTdsFiled(payoutId: string) {
    setLoading(payoutId)
    setError(null)
    try {
      const res = await fetch(`/api/payout-schedule/${payoutId}/mark-tds-filed`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error ?? 'Failed to mark TDS as filed')
      } else {
        router.refresh()
      }
    } finally { setLoading(null) }
  }

  async function markPastPaid() {
    setLoading('bulk')
    setError(null)
    try {
      const res = await fetch(`/api/agreements/${agreementId}/mark-past-paid`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error ?? 'Failed to mark past payouts as paid')
      } else {
        setConfirmBulk(false)
        setUndoToast({ message: 'Past payouts marked as paid', onUndo: async () => { setUndoToast(null); await fetch(`/api/agreements/${agreementId}/revert-past-paid`, { method: 'POST' }); router.refresh() } })
        router.refresh()
      }
    } finally { setLoading(null) }
  }

  if (payouts.length === 0) {
    return <p className="text-slate-500 text-sm italic">No payout schedule available.</p>
  }

  return (
    <div className="space-y-5">
      {isCoordinator && hasPastPending && (
        <div className="flex justify-end items-center gap-4">
          {confirmBulk ? (
            <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700 px-3 py-1.5 rounded-lg animate-in fade-in slide-in-from-right-2">
              <span className="text-xs text-slate-300 font-medium">Mark all past pending as paid?</span>
              <button onClick={() => markPastPaid()} disabled={loading === 'bulk'} className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 transition-colors uppercase">Yes</button>
              <button onClick={() => setConfirmBulk(false)} disabled={loading === 'bulk'} className="text-[10px] font-bold text-slate-500 hover:text-slate-400 transition-colors uppercase">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmBulk(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-900/40 text-emerald-400 hover:bg-emerald-800/40 border border-emerald-800/50 transition-colors">
              Mark all past payouts as paid
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800/50 px-4 py-2 rounded-lg">
          <p className="text-xs text-red-400 font-medium">{error}</p>
        </div>
      )}

      {/* ── Interest Payouts ── */}
      {interestRows.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Interest Payouts ({interestRows.length})
            </h4>
          </div>
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
                  <th className="py-2 px-3 text-center font-semibold">Status</th>
                  {isCoordinator && <th className="py-2 px-3 text-center font-semibold">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/40">
                {interestRows.map((row, idx) => {
                  const isPastPending = row.status !== 'paid' && row.due_by < todayStr
                  return (
                    <tr key={row.id} className={`hover:bg-slate-800/30 transition-colors ${isPastPending ? 'bg-red-900/5 border-l-2 border-l-red-500' : ''}`}>
                      <td className="py-2.5 px-3 text-xs text-slate-500 font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-3 text-xs whitespace-nowrap">{fmtDate(row.period_from)} – {fmtDate(row.period_to)}</td>
                      <td className="py-2.5 px-3 text-right text-xs text-slate-500">{row.no_of_days}</td>
                      <td className="py-2.5 px-3 text-xs whitespace-nowrap">{fmtDate(row.due_by)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs">{fmtCurrency(row.gross_interest)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-red-400/80">{fmtCurrency(row.tds_amount)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-xs text-emerald-400">{fmtCurrency(row.net_interest)}</td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                          row.status === 'paid' ? 'bg-green-900/40 text-green-400' :
                          row.status === 'overdue' ? 'bg-red-900/40 text-red-400' :
                          row.status === 'notified' ? 'bg-amber-900/40 text-amber-400' :
                          'bg-slate-700 text-slate-300'
                        }`}>{row.status}</span>
                      </td>
                      {isCoordinator && (
                        <td className="py-2.5 px-3 text-center">
                          {row.status !== 'paid' ? (
                            <button onClick={() => markAsPaid(row.id)} disabled={loading === row.id} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase">
                              {loading === row.id ? '…' : 'Paid'}
                            </button>
                          ) : (
                            <button onClick={() => revertPayout(row.id)} disabled={loading === row.id} className="text-[10px] font-bold text-slate-600 hover:text-slate-400 transition-colors uppercase">
                              {loading === row.id ? '…' : 'Undo'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800/40 border-t border-slate-600">
                  <td colSpan={4} className="py-2 px-3 text-xs font-bold text-slate-200 uppercase tracking-wide">Total</td>
                  <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-slate-100">{fmtCurrency(totals.gross)}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-red-400">{fmtCurrency(totals.tds)}</td>
                  <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-emerald-400">{fmtCurrency(totals.net)}</td>
                  <td></td>
                  {isCoordinator && <td></td>}
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
                  <th className="py-2 px-3 text-center font-semibold">Status</th>
                  {isCoordinator && <th className="py-2 px-3 text-center font-semibold">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-800/20">
                {tdsRows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-violet-900/5 transition-colors">
                    <td className="py-2.5 px-3 text-xs text-slate-500 font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-3 text-xs">{fmtDate(row.due_by)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs">{fmtCurrency(row.gross_interest)}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs text-red-400/80">{fmtCurrency(row.tds_amount)}</td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${row.tds_filed ? 'bg-green-900/40 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                        {row.tds_filed ? 'Filed' : 'Not Filed'}
                      </span>
                    </td>
                    {isCoordinator && (
                      <td className="py-2.5 px-3 text-center">
                        {!row.tds_filed ? (
                          <button onClick={() => markTdsFiled(row.id)} disabled={loading === row.id} className="text-[10px] px-2 py-0.5 rounded bg-violet-900/40 text-violet-300 hover:bg-violet-800/40 disabled:opacity-50 transition-colors border border-violet-800/50">
                            {loading === row.id ? '…' : 'Mark Filed'}
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-600">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Maturity Repayment ── */}
      {principalRows.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
            Maturity Repayment
          </h4>
          {principalRows.map((row) => (
            <div key={row.id} className="flex items-center justify-between p-4 bg-amber-900/10 border border-amber-800/30 rounded-lg">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-slate-400">Scheduled for {fmtDate(row.due_by)}</p>
                  <p className="text-xl font-bold text-slate-100">{fmtCurrency(row.gross_interest)}</p>
                </div>
                <span className={`inline-block px-2.5 py-1 rounded text-xs font-semibold capitalize ${
                  row.status === 'paid' ? 'bg-green-900/40 text-green-400' :
                  row.status === 'overdue' ? 'bg-red-900/40 text-red-400' :
                  'bg-slate-700 text-slate-300'
                }`}>{row.status}</span>
              </div>
              {isCoordinator && (
                row.status !== 'paid' ? (
                  <button onClick={() => markAsPaid(row.id)} disabled={loading === row.id} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-colors uppercase disabled:opacity-50">
                    {loading === row.id ? '…' : 'Mark Repaid'}
                  </button>
                ) : (
                  <button onClick={() => revertPayout(row.id)} disabled={loading === row.id} className="text-xs font-bold text-slate-600 hover:text-slate-400 transition-colors uppercase">
                    Undo
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {undoToast && (
        <UndoToast message={undoToast.message} onUndo={undoToast.onUndo} onDismiss={() => setUndoToast(null)} />
      )}
    </div>
  )
}
