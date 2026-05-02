'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, Undo2 } from 'lucide-react'
import type { PayoutSchedule } from '@/types/database'

interface Props {
  agreementId: string
  payouts: PayoutSchedule[]
  userRole: string
  principalAmount?: number
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

export default function PendingPayouts({ agreementId, payouts, userRole, principalAmount }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const isCoordinator = userRole !== 'salesperson'

  const todayStr = new Date().toISOString().split('T')[0]
  const pendingPayouts = payouts
    .filter(r => !r.is_tds_only && r.status !== 'paid')
    .sort((a, b) => a.due_by.localeCompare(b.due_by))

  async function markAsPaid(payoutId: string) {
    setLoading(payoutId)
    try {
      const res = await fetch(`/api/agreements/${agreementId}/payouts/${payoutId}/paid`, { method: 'POST' })
      if (!res.ok) return
      router.refresh()
    } finally { setLoading(null) }
  }

  async function revertPayout(payoutId: string) {
    setLoading(payoutId)
    try {
      const res = await fetch(`/api/agreements/${agreementId}/payouts/${payoutId}/revert`, { method: 'POST' })
      if (!res.ok) return
      router.refresh()
    } finally { setLoading(null) }
  }

  async function markAllPastPaid() {
    setLoading('bulk')
    try {
      const res = await fetch(`/api/agreements/${agreementId}/mark-past-paid`, { method: 'POST' })
      if (!res.ok) return
      router.refresh()
    } finally { setLoading(null) }
  }

  if (!isCoordinator) return null
  if (pendingPayouts.length === 0) return null

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
            Pending Payouts ({pendingPayouts.length})
          </h3>
        </div>
        {pendingPayouts.some(r => r.due_by < todayStr) && (
          <button
            onClick={markAllPastPaid}
            disabled={loading === 'bulk'}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-900/40 text-emerald-400 hover:bg-emerald-800/40 border border-emerald-800/50 transition-colors disabled:opacity-50"
          >
            {loading === 'bulk' ? '…' : 'Mark All Past as Paid'}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="min-w-full text-sm text-slate-300">
          <thead>
            <tr className="bg-slate-800/60 text-xs text-slate-400">
              <th className="py-2 px-3 text-left font-semibold">Due Date</th>
              <th className="py-2 px-3 text-right font-semibold">Net Amount</th>
              <th className="py-2 px-3 text-center font-semibold">Status</th>
              <th className="py-2 px-3 text-center font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/40">
            {pendingPayouts.map((row) => {
              const isPast = row.due_by < todayStr
              const isMaturity = row.is_principal_repayment
              const gross = row.gross_interest ?? 0
              const tds = row.tds_amount ?? 0
              const interestEarned = isMaturity && principalAmount && gross > principalAmount * 1.01
                ? gross - principalAmount
                : null
              return (
                <tr key={row.id} className={`hover:bg-slate-800/30 transition-colors ${isPast ? 'bg-red-900/5 border-l-2 border-l-red-500' : isMaturity ? 'bg-amber-900/5 border-l-2 border-l-amber-600' : ''}`}>
                  <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                    <span className={isPast ? 'text-red-400 font-medium' : isMaturity ? 'text-amber-300' : 'text-slate-300'}>
                      {fmtDate(row.due_by)}
                      {isPast && <span className="ml-1 text-[10px] font-bold uppercase">(overdue)</span>}
                      {isMaturity && <span className="ml-1 text-[10px] font-bold uppercase text-amber-500">(maturity)</span>}
                    </span>
                    {interestEarned !== null && (
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Interest {fmtCurrency(interestEarned)} + Principal {fmtCurrency(principalAmount)}
                        {tds > 0 && <> − TDS {fmtCurrency(tds)}</>}
                      </p>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs text-emerald-400 tabular-nums">{fmtCurrency(row.net_interest)}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${
                      row.status === 'overdue' ? 'bg-red-900/40 text-red-400' :
                      row.status === 'notified' ? 'bg-amber-900/40 text-amber-400' :
                      'bg-slate-700 text-slate-300'
                    }`}>{row.status}</span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button onClick={() => markAsPaid(row.id)} disabled={loading === row.id} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase">
                      {loading === row.id ? '…' : 'Mark Paid'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-600/50 bg-slate-800/60">
              <td className="py-2 px-3 text-xs text-slate-400 font-semibold">Total</td>
              <td className="py-2 px-3 text-right text-xs font-bold text-emerald-300">
                {fmtCurrency(pendingPayouts.reduce((sum, r) => sum + (r.net_interest ?? 0), 0))}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Show recently paid with undo */}
      {payouts.filter(r => !r.is_tds_only && r.status === 'paid').length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-400">
            Paid payouts ({payouts.filter(r => !r.is_tds_only && r.status === 'paid').length})
          </summary>
          <div className="mt-2 space-y-1">
            {payouts.filter(r => !r.is_tds_only && r.status === 'paid').sort((a, b) => a.due_by.localeCompare(b.due_by)).map((row) => (
              <div key={row.id} className="flex items-center justify-between px-3 py-1.5 bg-slate-900/40 rounded text-xs">
                <span className="text-slate-400">{fmtDate(row.due_by)} — {fmtCurrency(row.net_interest)}</span>
                <button onClick={() => revertPayout(row.id)} disabled={loading === row.id} className="inline-flex items-center gap-1 text-slate-600 hover:text-slate-400 transition-colors">
                  <Undo2 className="w-3 h-3" /> Undo
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
