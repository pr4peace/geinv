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
      await fetch(`/api/payout-schedule/${payoutId}/mark-tds-filed`, { method: 'POST' })
      router.refresh()
    } finally {
      setLoading(null)
    }
  }

  if (rows.length === 0) return null

  return (
    <div className="bg-surface border border-hairline rounded-sm shadow-sm flex flex-col">
      <div className="px-5 py-4 border-b border-hairline flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileCheck className="w-3.5 h-3.5 text-earth-brown" />
          <h3 className="lbl font-bold text-ink-1 uppercase tracking-widest">TDS Filings ({rows.length})</h3>
          {pendingCount > 0 && (
            <span className="text-[10px] font-bold text-ink-4 uppercase ml-2">{pendingCount} pending</span>
          )}
        </div>
      </div>

      <div className="divide-y divide-hairline">
        {rows.map((row) => {
          const isOverdue = !row.tds_filed && row.due_by < todayStr
          const isFiled = row.tds_filed
          return (
            <div key={row.id} className={`px-5 py-4 flex items-center justify-between transition-colors ${isFiled ? 'bg-canvas/30 opacity-70' : isOverdue ? 'bg-rust-soft/20' : 'bg-clay-soft/10 hover:bg-clay-soft/20'}`}>
              <div className="flex items-center gap-6">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-bold num ${isFiled ? 'text-ink-4' : 'text-ink-1'}`}>{fmtCurrency(row.tds_amount)}</span>
                    {isOverdue && (
                      <span className="bg-rust-soft text-rust text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm">Overdue</span>
                    )}
                  </div>
                  <p className="text-[10px] text-ink-4 font-medium uppercase mt-0.5">
                    Filing Deadline {fmtDate(row.due_by)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex flex-col items-center gap-1 w-12 border-l border-hairline pl-4">
                  <span className={`sdot ${isFiled ? 'sdot-active' : isOverdue ? 'sdot-overdue' : 'sdot-pending'} m-0`} title={isFiled ? 'Filed' : 'Pending'} />
                  <span className="text-[9px] font-bold uppercase text-ink-4 tracking-tighter">{isFiled ? 'Filed' : 'Pending'}</span>
                </div>

                {isCoordinator && !isFiled && (
                  <div className="border-l border-hairline pl-4 flex items-center">
                    <button
                      onClick={() => markTdsFiled(row.id)}
                      disabled={loading === row.id}
                      className="h-8 px-4 rounded-sm bg-earth-brown text-paper text-[11px] font-bold uppercase transition-all shadow-sm hover:bg-ink-1 disabled:opacity-50"
                    >
                      {loading === row.id ? '…' : 'Mark Filed'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Footer totals */}
      <div className="px-5 py-3 bg-surface-2/50 border-t border-hairline flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase text-ink-4 tracking-widest">Aggregate TDS</span>
        <span className="num font-bold text-ink-1 text-[13px]">{fmtCurrency(rows.reduce((s, r) => s + (r.tds_amount ?? 0), 0))}</span>
      </div>
    </div>
  )
}
