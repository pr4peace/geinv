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

  function StatusDot({ status }: { status?: string }) {
    if (!status) return null
    const dot = status === 'paid' ? 'sdot-paid' : status === 'overdue' ? 'sdot-overdue' : status === 'notified' ? 'sdot-notified' : 'sdot-pending'
    return <span className={`sdot ${dot} m-0`} title={status} />
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
    return <p className="text-ink-5 text-sm italic py-4">No payout schedule available.</p>
  }

  return (
    <div className="space-y-6">
      {isCoordinator && hasPastPending && (
        <div className="flex justify-end items-center gap-4">
          {confirmBulk ? (
            <div className="flex items-center gap-3 bg-surface-2 border border-hairline px-3 py-1.5 rounded-sm animate-in fade-in slide-in-from-right-2">
              <span className="text-[11px] font-bold uppercase text-ink-3">Mark all past pending as paid?</span>
              <button onClick={() => markPastPaid()} disabled={loading === 'bulk'} className="text-[10px] font-bold text-gain hover:text-ink-1 transition-colors uppercase">Yes</button>
              <button onClick={() => setConfirmBulk(false)} disabled={loading === 'bulk'} className="text-[10px] font-bold text-ink-4 hover:text-ink-2 transition-colors uppercase">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmBulk(true)} className="text-[10px] font-bold uppercase px-3 py-1.5 rounded-sm bg-gain text-paper hover:bg-forest transition-colors shadow-sm">
              Mark all past payouts as paid
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="bg-rust-soft border border-rust/20 px-4 py-2 rounded-sm shadow-sm">
          <p className="text-xs text-rust font-bold uppercase tracking-tight">{error}</p>
        </div>
      )}

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
                  <th className="py-2 px-3 text-right w-12">Days</th>
                  <th className="py-2 px-3 text-left">Due By</th>
                  <th className="py-2 px-3 text-right">Gross</th>
                  <th className="py-2 px-3 text-right">TDS</th>
                  <th className="py-2 px-3 text-right">Net</th>
                  <th className="py-2 px-3 text-center w-12">Status</th>
                  {isCoordinator && <th className="py-2 px-3 text-center w-16">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {interestRows.map((row, idx) => {
                  const isPaid = row.status === 'paid'
                  const isPastPending = row.status !== 'paid' && row.due_by < todayStr
                  return (
                    <tr key={row.id} className={`h-7 hover:bg-surface-2 transition-colors ${isPastPending ? 'bg-rust-soft/40' : ''} ${isPaid ? 'text-ink-4' : 'text-ink-2'}`}>
                      <td className="px-3 py-1 font-mono text-[10px] opacity-50">{idx + 1}</td>
                      <td className="px-3 py-1 whitespace-nowrap opacity-80">{fmtDate(row.period_from)} – {fmtDate(row.period_to)}</td>
                      <td className="px-3 py-1 text-right font-mono text-[10px] opacity-50">{row.no_of_days}</td>
                      <td className={`px-3 py-1 whitespace-nowrap font-medium ${isPastPending ? 'text-rust' : ''}`}>{fmtDate(row.due_by)}</td>
                      <td className="px-3 py-1 text-right num text-[11px] tabular-nums">{fmtCurrency(row.gross_interest)}</td>
                      <td className="px-3 py-1 text-right num text-[11px] tabular-nums opacity-70">{fmtCurrency(row.tds_amount)}</td>
                      <td className={`px-3 py-1 text-right num text-[11px] tabular-nums font-bold ${isPaid ? 'text-ink-4' : 'text-ink-1'}`}>{fmtCurrency(row.net_interest)}</td>
                      <td className="px-3 py-1 text-center">
                        <StatusDot status={row.status} />
                      </td>
                      {isCoordinator && (
                        <td className="px-3 py-1 text-center">
                          {row.status !== 'paid' ? (
                            <button onClick={() => markAsPaid(row.id)} disabled={loading === row.id} className="text-[10px] font-bold text-forest hover:text-ink-1 transition-colors uppercase">
                              {loading === row.id ? '…' : 'Paid'}
                            </button>
                          ) : (
                            <button onClick={() => revertPayout(row.id)} disabled={loading === row.id} className="text-[10px] font-bold text-ink-5 hover:text-ink-3 transition-colors uppercase">
                              {loading === row.id ? '…' : 'Undo'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-surface-2/50 border-t border-hairline-strong">
                <tr className="h-8">
                  <td colSpan={4} className="px-3 py-1 text-[10px] font-bold text-ink-3 uppercase tracking-widest">Total</td>
                  <td className="px-3 py-1 text-right num font-bold text-ink-2">{fmtCurrency(totals.gross)}</td>
                  <td className="px-3 py-1 text-right num font-bold text-ink-3 opacity-70">{fmtCurrency(totals.tds)}</td>
                  <td className="px-3 py-1 text-right num font-bold text-ink-1 text-[13px]">{fmtCurrency(totals.net)}</td>
                  <td colSpan={isCoordinator ? 2 : 1}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Maturity Repayment ── */}
      {principalRows.length > 0 && (
        <div className="space-y-3">
          <h4 className="lbl font-bold text-ink-1">Maturity Repayment</h4>
          {principalRows.map((row) => (
            <div key={row.id} className="flex items-center justify-between p-6 bg-surface border border-hairline rounded-sm shadow-sm">
              <div className="flex items-center gap-6">
                <div>
                  <p className="lbl opacity-70">Scheduled for {fmtDate(row.due_by)}</p>
                  <p className="text-2xl font-bold num text-earth-brown leading-none">{fmtCurrency(row.gross_interest)}</p>
                </div>
                <div className="flex flex-col items-center gap-1 border-l border-hairline pl-6">
                  <StatusDot status={row.status} />
                  <span className="text-[9px] font-bold uppercase text-ink-4 tracking-tighter">{row.status}</span>
                </div>
              </div>
              {isCoordinator && (
                <div className="flex items-center gap-3">
                  {row.status !== 'paid' ? (
                    <button 
                      onClick={() => markAsPaid(row.id)} 
                      disabled={loading === row.id} 
                      className="px-4 py-2 bg-forest text-paper text-[11px] font-bold rounded-sm hover:bg-ink-1 transition-all uppercase shadow-sm disabled:opacity-50"
                    >
                      {loading === row.id ? '…' : 'Mark Repaid'}
                    </button>
                  ) : (
                    <button 
                      onClick={() => revertPayout(row.id)} 
                      disabled={loading === row.id} 
                      className="px-4 py-2 border border-hairline-strong text-ink-4 text-[11px] font-bold rounded-sm hover:bg-surface-2 transition-all uppercase"
                    >
                      Undo
                    </button>
                  )}
                </div>
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
