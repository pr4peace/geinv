'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingUp } from 'lucide-react'
import type { PayoutSchedule } from '@/types/database'

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

export default function PendingPayouts({ agreementId, payouts, userRole }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const isCoordinator = userRole !== 'salesperson'

  const todayStr = new Date().toISOString().split('T')[0]
  const rows = payouts
    .filter(r => !r.is_tds_only && !r.is_principal_repayment)
    .sort((a, b) => a.due_by.localeCompare(b.due_by))

  const pendingCount = rows.filter(r => r.status !== 'paid').length

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

  if (rows.length === 0) return null

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
            Interest Payouts ({rows.length})
          </h3>
          {pendingCount > 0 && (
            <span className="text-xs text-slate-500">{pendingCount} pending</span>
          )}
        </div>
        {isCoordinator && rows.some(r => r.status !== 'paid' && r.due_by < todayStr) && (
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
              <th className="py-2 px-3 text-left font-semibold">#</th>
              <th className="py-2 px-3 text-left font-semibold">Period</th>
              <th className="py-2 px-3 text-left font-semibold">Due By</th>
              <th className="py-2 px-3 text-right font-semibold">Gross</th>
              <th className="py-2 px-3 text-right font-semibold">TDS</th>
              <th className="py-2 px-3 text-right font-semibold">Net</th>
              <th className="py-2 px-3 text-left font-semibold">Status / Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/40">
            {rows.map((row, idx) => {
              const isPast = row.status !== 'paid' && row.due_by < todayStr
              const isPaid = row.status === 'paid'
              return (
                <tr key={row.id} className={`transition-colors ${isPaid ? 'opacity-50' : isPast ? 'bg-red-900/5' : 'hover:bg-slate-800/30'}`}>
                  <td className="py-2.5 px-3 text-xs text-slate-500 font-mono">{idx + 1}</td>
                  <td className="py-2.5 px-3 text-xs whitespace-nowrap text-slate-400">
                    {fmtDate(row.period_from)} – {fmtDate(row.period_to)}
                  </td>
                  <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                    <span className={isPast ? 'text-red-400 font-medium' : ''}>
                      {fmtDate(row.due_by)}
                      {isPast && <span className="ml-1 text-[10px] font-bold uppercase">(overdue)</span>}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums">{fmtCurrency(row.gross_interest)}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-red-400/80">{fmtCurrency(row.tds_amount)}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-emerald-400">{fmtCurrency(row.net_interest)}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        row.status === 'paid' ? 'bg-green-900/40 text-green-400' :
                        row.status === 'overdue' ? 'bg-red-900/40 text-red-400' :
                        row.status === 'notified' ? 'bg-amber-900/40 text-amber-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>{row.status}</span>
                      {isCoordinator && (
                        isPaid ? (
                          <button onClick={() => revertPayout(row.id)} disabled={loading === row.id} className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50">
                            {loading === row.id ? '…' : 'Undo'}
                          </button>
                        ) : (
                          <button onClick={() => markAsPaid(row.id)} disabled={loading === row.id} className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50">
                            {loading === row.id ? '…' : 'Mark Paid'}
                          </button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-600 bg-slate-800/40">
              <td colSpan={3} className="py-2 px-3 text-xs font-bold text-slate-100 uppercase tracking-wide">Total</td>
              <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-slate-100 tabular-nums">
                {fmtCurrency(rows.reduce((s, r) => s + (r.gross_interest ?? 0), 0))}
              </td>
              <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-red-400 tabular-nums">
                {fmtCurrency(rows.reduce((s, r) => s + (r.tds_amount ?? 0), 0))}
              </td>
              <td className="py-2 px-3 text-right font-mono text-xs font-semibold text-emerald-400 tabular-nums">
                {fmtCurrency(rows.reduce((s, r) => s + (r.net_interest ?? 0), 0))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
