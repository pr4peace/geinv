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

function getFY(dateStr: string): string {
  const d = new Date(dateStr)
  const m = d.getMonth()
  const y = d.getFullYear()
  if (m >= 3) return `FY ${y}-${String(y + 1).slice(2)}`
  return `FY ${y - 1}-${String(y).slice(2)}`
}

type RowType = 'interest' | 'tds' | 'principal'

function getTypeBadge(rowType: RowType): React.ReactNode {
  if (rowType === 'tds') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-900/40 text-violet-300 border border-violet-800/50 whitespace-nowrap">
        TDS
      </span>
    )
  }
  if (rowType === 'principal') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-900/40 text-amber-300 border border-amber-800/50 whitespace-nowrap">
        PRINCIPAL
      </span>
    )
  }
  return null
}

function getStatusBadge(row: PayoutSchedule): React.ReactNode {
  if (row.is_tds_only) {
    return (
      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${row.tds_filed ? 'bg-green-900/40 text-green-400' : 'bg-slate-800 text-slate-500'}`}>
        {row.tds_filed ? 'Filed' : 'Pending'}
      </span>
    )
  }
  const map: Record<string, string> = {
    pending: 'bg-slate-700 text-slate-300',
    notified: 'bg-amber-900/40 text-amber-400',
    paid: 'bg-green-900/40 text-green-400',
    overdue: 'bg-red-900/40 text-red-400',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${map[row.status] ?? 'bg-slate-700 text-slate-300'}`}>
      {row.status}
    </span>
  )
}

export default function PayoutScheduleSection({ agreementId, payouts, userRole }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null)
  const isCoordinator = userRole !== 'salesperson'

  // All rows sorted by due_by, with type classification
  const sorted = payouts
    .slice()
    .sort((a, b) => a.due_by.localeCompare(b.due_by))

  // TDS summary by FY
  const fyData: Record<string, { gross: number; tds: number; net: number }> = {}
  for (const row of sorted) {
    if (row.is_principal_repayment) continue
    const fy = getFY(row.due_by ?? row.period_to)
    if (!fyData[fy]) fyData[fy] = { gross: 0, tds: 0, net: 0 }
    fyData[fy].gross += row.gross_interest
    fyData[fy].tds += row.tds_amount
    fyData[fy].net += row.net_interest
  }
  const fyTotals = Object.entries(fyData).sort(([a], [b]) => a.localeCompare(b))

  // Grand totals
  const grandTotals = { gross: 0, tds: 0, net: 0 }
  for (const row of sorted) {
    grandTotals.gross += row.gross_interest
    grandTotals.tds += row.tds_amount
    grandTotals.net += row.net_interest
  }

  const interestRows = sorted.filter(r => !r.is_principal_repayment && !r.is_tds_only)
  const todayStr = new Date().toISOString().split('T')[0]
  const hasPastPending = interestRows.some(r => r.status !== 'paid' && r.due_by < todayStr)

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
    <div className="space-y-6">
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

      {/* ── Unified Payout + TDS Table ── */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-slate-300">
          <thead>
            <tr className="border-b border-slate-700 text-xs text-slate-400">
              <th className="pb-2 text-left pr-2 whitespace-nowrap">#</th>
              <th className="pb-2 text-left pr-3 whitespace-nowrap">Period</th>
              <th className="pb-2 text-right pr-3 whitespace-nowrap">Days</th>
              <th className="pb-2 text-left pr-3 whitespace-nowrap">Due By</th>
              <th className="pb-2 text-right pr-3 whitespace-nowrap">Gross</th>
              <th className="pb-2 text-right pr-3 whitespace-nowrap">TDS</th>
              <th className="pb-2 text-right pr-3 whitespace-nowrap">Net</th>
              <th className="pb-2 text-center pr-3 whitespace-nowrap">Status</th>
              {isCoordinator && <th className="pb-2 text-center whitespace-nowrap">Action</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/40">
            {sorted.map((row, idx) => {
              const rowType: RowType = row.is_principal_repayment ? 'principal' : row.is_tds_only ? 'tds' : 'interest'
              const isPastPending = !row.is_principal_repayment && row.status !== 'paid' && row.due_by < todayStr
              return (
                <tr key={row.id} className={`hover:bg-slate-800/30 transition-colors ${rowType === 'tds' ? 'bg-violet-900/5' : rowType === 'principal' ? 'bg-amber-900/5' : ''} ${isPastPending ? 'border-l-2 border-l-red-500' : ''}`}>
                  <td className="py-2.5 pr-2 text-xs text-slate-500 font-mono">{idx + 1}</td>
                  <td className="py-2.5 pr-3 text-xs whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {getTypeBadge(rowType)}
                      {!row.is_principal_repayment && !row.is_tds_only && (
                        <span>{fmtDate(row.period_from)} – {fmtDate(row.period_to)}</span>
                      )}
                      {row.is_tds_only && <span className="text-slate-500">FY End</span>}
                      {row.is_principal_repayment && <span className="text-slate-500">Maturity</span>}
                    </div>
                  </td>
                  <td className="py-2.5 pr-3 text-right text-xs text-slate-500">{row.no_of_days ?? '—'}</td>
                  <td className="py-2.5 pr-3 text-xs whitespace-nowrap">{fmtDate(row.due_by)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-xs">{fmtCurrency(row.gross_interest)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-xs text-red-400/80">{fmtCurrency(row.tds_amount)}</td>
                  <td className="py-2.5 pr-3 text-right font-mono text-xs text-emerald-400">{fmtCurrency(row.net_interest)}</td>
                  <td className="py-2.5 pr-3 text-center">{getStatusBadge(row)}</td>
                  {isCoordinator && (
                    <td className="py-2.5 text-center">
                      {row.is_tds_only ? (
                        !row.tds_filed ? (
                          <button onClick={() => markTdsFiled(row.id)} disabled={loading === row.id} className="text-[10px] px-2 py-0.5 rounded bg-violet-900/40 text-violet-300 hover:bg-violet-800/40 disabled:opacity-50 transition-colors border border-violet-800/50">
                            {loading === row.id ? '…' : 'Mark Filed'}
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-600">—</span>
                        )
                      ) : row.status !== 'paid' ? (
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
          {/* FY Subtotals */}
          {fyTotals.length > 1 && (
            <tfoot>
              {fyTotals.map(([fy, t]) => (
                <tr key={fy} className="border-t border-slate-700 bg-slate-900/30">
                  <td colSpan={4} className="py-2 px-3 text-xs font-bold text-slate-400">{fy} Subtotal</td>
                  <td className="py-2 text-right font-mono text-xs text-slate-300">{fmtCurrency(t.gross)}</td>
                  <td className="py-2 text-right font-mono text-xs text-red-400/80">{fmtCurrency(t.tds)}</td>
                  <td className="py-2 text-right font-mono text-xs text-emerald-400 font-semibold">{fmtCurrency(t.net)}</td>
                  <td></td>
                  {isCoordinator && <td></td>}
                </tr>
              ))}
              <tr className="border-t-2 border-slate-600 bg-slate-800/30">
                <td colSpan={4} className="py-2.5 px-3 text-xs font-bold text-slate-200 uppercase tracking-wide">Grand Total</td>
                <td className="py-2.5 text-right font-mono text-xs font-semibold text-slate-100">{fmtCurrency(grandTotals.gross)}</td>
                <td className="py-2.5 text-right font-mono text-xs font-semibold text-red-400">{fmtCurrency(grandTotals.tds)}</td>
                <td className="py-2.5 text-right font-mono text-xs font-semibold text-emerald-400">{fmtCurrency(grandTotals.net)}</td>
                <td></td>
                {isCoordinator && <td></td>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {undoToast && (
        <UndoToast message={undoToast.message} onUndo={undoToast.onUndo} onDismiss={() => setUndoToast(null)} />
      )}
    </div>
  )
}
