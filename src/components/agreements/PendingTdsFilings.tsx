'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileCheck } from 'lucide-react'
import type { PayoutSchedule } from '@/types/database'

interface Props {
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

export default function PendingTdsFilings({ payouts, userRole }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const isCoordinator = userRole !== 'salesperson'

  const todayStr = new Date().toISOString().split('T')[0]
  const rows = payouts
    .filter(r => r.is_tds_only)
    .sort((a, b) => a.due_by.localeCompare(b.due_by))

  const pendingCount = rows.filter(r => !r.tds_filed).length

  async function markTdsFiled(payoutId: string) {
    setLoading(payoutId)
    try {
      const res = await fetch(`/api/payout-schedule/${payoutId}/mark-tds-filed`, { method: 'POST' })
      if (!res.ok) return
      router.refresh()
    } finally { setLoading(null) }
  }

  if (rows.length === 0) return null

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <FileCheck className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
          TDS Filings ({rows.length})
        </h3>
        {pendingCount > 0 && (
          <span className="text-xs text-slate-500">{pendingCount} pending</span>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-violet-800/30">
        <table className="min-w-full text-sm text-slate-300">
          <thead>
            <tr className="bg-violet-900/20 text-xs text-violet-300/70">
              <th className="py-2 px-3 text-left font-semibold">#</th>
              <th className="py-2 px-3 text-left font-semibold">Filing Deadline</th>
              <th className="py-2 px-3 text-right font-semibold">TDS Amount</th>
              <th className="py-2 px-3 text-left font-semibold">Status / Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-violet-800/20">
            {rows.map((row, idx) => {
              const isOverdue = !row.tds_filed && row.due_by < todayStr
              const isFiled = row.tds_filed
              return (
                <tr key={row.id} className={`transition-colors ${isFiled ? 'opacity-50' : isOverdue ? 'bg-red-900/5' : 'hover:bg-violet-900/5'}`}>
                  <td className="py-2.5 px-3 text-xs text-slate-500 font-mono">{idx + 1}</td>
                  <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                    <span className={isOverdue ? 'text-red-400 font-medium' : ''}>
                      {fmtDate(row.due_by)}
                      {isOverdue && <span className="ml-1 text-[10px] font-bold uppercase">(overdue)</span>}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs tabular-nums text-red-400/80">{fmtCurrency(row.tds_amount)}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isFiled ? 'bg-green-900/40 text-green-400' :
                        isOverdue ? 'bg-red-900/30 text-red-400' :
                        'bg-slate-700 text-slate-400'
                      }`}>{isFiled ? 'Filed' : 'Pending'}</span>
                      {isCoordinator && !isFiled && (
                        <button
                          onClick={() => markTdsFiled(row.id)}
                          disabled={loading === row.id}
                          className="text-[10px] font-bold text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50"
                        >
                          {loading === row.id ? '…' : 'Mark Filed'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-violet-700/40 bg-violet-900/20">
              <td colSpan={2} className="py-2 px-3 text-xs text-violet-300/70 font-semibold">Total</td>
              <td className="py-2 px-3 text-right text-xs font-bold text-violet-200 tabular-nums">
                {fmtCurrency(rows.reduce((s, r) => s + (r.tds_amount ?? 0), 0))}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
