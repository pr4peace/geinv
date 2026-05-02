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
  const unfiledTds = payouts
    .filter(r => r.is_tds_only && !r.tds_filed)
    .sort((a, b) => a.due_by.localeCompare(b.due_by))

  async function markTdsFiled(payoutId: string) {
    setLoading(payoutId)
    try {
      const res = await fetch(`/api/payout-schedule/${payoutId}/mark-tds-filed`, { method: 'POST' })
      if (!res.ok) return
      router.refresh()
    } finally { setLoading(null) }
  }

  if (!isCoordinator) return null
  if (unfiledTds.length === 0) return null

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <FileCheck className="w-4 h-4 text-violet-400" />
        <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">
          TDS Filings Pending ({unfiledTds.length})
        </h3>
      </div>

      <div className="overflow-x-auto rounded-lg border border-violet-800/30">
        <table className="min-w-full text-sm text-slate-300">
          <thead>
            <tr className="bg-violet-900/20 text-xs text-violet-300/70">
              <th className="py-2 px-3 text-left font-semibold">FY End</th>
              <th className="py-2 px-3 text-right font-semibold">TDS Amount</th>
              <th className="py-2 px-3 text-center font-semibold">Status</th>
              <th className="py-2 px-3 text-center font-semibold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-violet-800/20">
            {unfiledTds.map((row) => {
              const isOverdue = row.due_by < todayStr
              return (
                <tr key={row.id} className={`hover:bg-violet-900/5 transition-colors ${isOverdue ? 'bg-red-900/5' : ''}`}>
                  <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                    <span className={isOverdue ? 'text-red-400 font-medium' : 'text-slate-300'}>
                      {fmtDate(row.due_by)}
                      {isOverdue && <span className="ml-1 text-[10px] font-bold uppercase">(overdue)</span>}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-xs text-red-400/80 tabular-nums">{fmtCurrency(row.tds_amount)}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isOverdue ? 'bg-red-900/30 text-red-400' : 'bg-slate-700 text-slate-400'}`}>
                      {isOverdue ? 'Overdue' : 'Not Filed'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <button
                      onClick={() => markTdsFiled(row.id)}
                      disabled={loading === row.id}
                      className="text-[10px] px-2 py-0.5 rounded bg-violet-900/40 text-violet-300 hover:bg-violet-800/40 disabled:opacity-50 transition-colors border border-violet-800/50 uppercase font-bold"
                    >
                      {loading === row.id ? '…' : 'Mark Filed'}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-violet-700/40 bg-violet-900/20">
              <td className="py-2 px-3 text-xs text-violet-300/70 font-semibold">Total Pending</td>
              <td className="py-2 px-3 text-right text-xs font-bold text-violet-200">
                {fmtCurrency(unfiledTds.reduce((sum, r) => sum + (r.tds_amount ?? 0), 0))}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
