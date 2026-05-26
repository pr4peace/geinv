'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingUp } from 'lucide-react'
import type { PayoutSchedule } from '@/types/database'

interface Props {
  agreementId: string
  payouts: PayoutSchedule[]
  userRole: string
  isCumulative?: boolean
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

export default function PendingPayouts({ agreementId, payouts, userRole, isCumulative }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const isCoordinator = userRole !== 'salesperson'

  const todayStr = new Date().toISOString().split('T')[0]
  const rows = payouts
    .filter(r => !r.is_tds_only && !r.is_principal_repayment)
    .sort((a, b) => a.due_by.localeCompare(b.due_by))

  const pendingCount = rows.filter(r => r.status !== 'paid').length

  function StatusDot({ status, isOverdue }: { status?: string, isOverdue?: boolean }) {
    const dot = status === 'paid' ? 'sdot-paid' : isOverdue ? 'sdot-overdue' : status === 'notified' ? 'sdot-notified' : 'sdot-pending'
    return <span className={`sdot ${dot} m-0`} title={status} />
  }

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

  async function regenerateSchedule() {
    setLoading('regen')
    try {
      const res = await fetch(`/api/agreements/${agreementId}/regenerate-schedule`, { method: 'POST' })
      if (!res.ok) return
      router.refresh()
    } finally { setLoading(null) }
  }

  // For cumulative agreements, only show this section if there are multiple interest rows
  // (indicates bad data from before the fix). A correct cumulative agreement has 1 row at maturity,
  // which is handled by MaturityPayoutCard.
  if (isCumulative && rows.length <= 1) return null
  if (rows.length === 0) return null

  return (
    <div className="bg-surface border border-hairline rounded-sm shadow-sm flex flex-col">
      <div className="px-5 py-4 border-b border-hairline flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-forest" />
          <h3 className="lbl font-bold text-ink-1 uppercase tracking-widest">Interest Payouts ({rows.length})</h3>
          {pendingCount > 0 && (
            <span className="text-[10px] font-bold text-ink-4 uppercase ml-2">{pendingCount} pending</span>
          )}
        </div>
        {isCoordinator && isCumulative && rows.length > 1 && (
          <button
            onClick={regenerateSchedule}
            disabled={!!loading}
            className="text-[10px] font-bold uppercase px-3 py-1 bg-rust-soft text-rust border border-rust/20 rounded-sm hover:bg-rust hover:text-paper transition-all disabled:opacity-50"
          >
            {loading === 'regen' ? '…' : 'Fix Schedule'}
          </button>
        )}
        {isCoordinator && !isCumulative && rows.some(r => r.status !== 'paid' && r.due_by < todayStr) && (
          <button
            onClick={markAllPastPaid}
            disabled={loading === 'bulk'}
            className="text-[10px] font-bold uppercase px-3 py-1 bg-gain-soft text-gain border border-gain/20 rounded-sm hover:bg-gain hover:text-paper transition-all disabled:opacity-50"
          >
            {loading === 'bulk' ? '…' : 'Mark All Past as Paid'}
          </button>
        )}
      </div>

      <div className="divide-y divide-hairline">
        {rows.map((row) => {
          const isOverdue = row.status !== 'paid' && row.due_by < todayStr
          const isPaid = row.status === 'paid'
          return (
            <div key={row.id} className={`px-5 py-4 flex items-center justify-between transition-colors ${isPaid ? 'bg-canvas/30 opacity-70' : isOverdue ? 'bg-rust-soft/20' : 'hover:bg-surface-2'}`}>
              <div className="flex items-center gap-6">
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className={`text-[13px] font-bold num ${isPaid ? 'text-ink-4' : 'text-ink-1'}`}>{fmtCurrency(row.net_interest)}</span>
                    {isOverdue && (
                      <span className="bg-rust-soft text-rust text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm">Overdue</span>
                    )}
                  </div>
                  <p className="text-[10px] text-ink-4 font-medium uppercase mt-0.5">
                    Due {fmtDate(row.due_by)} · {fmtDate(row.period_from)}–{fmtDate(row.period_to)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="num text-[10px] text-ink-4">Gross: {fmtCurrency(row.gross_interest)}</p>
                  <p className="num text-[10px] text-rust opacity-70">TDS: {fmtCurrency(row.tds_amount)}</p>
                </div>
                
                <div className="flex flex-col items-center gap-1 w-12 border-l border-hairline pl-4">
                  <StatusDot status={row.status} isOverdue={isOverdue} />
                  <span className="text-[9px] font-bold uppercase text-ink-4 tracking-tighter">{row.status}</span>
                </div>

                {isCoordinator && !isCumulative && (
                  <div className="border-l border-hairline pl-4 flex items-center">
                    {isPaid ? (
                      <button onClick={() => revertPayout(row.id)} disabled={loading === row.id} className="text-[10px] font-bold text-ink-5 hover:text-ink-3 transition-colors uppercase disabled:opacity-50">
                        {loading === row.id ? '…' : 'Undo'}
                      </button>
                    ) : (
                      <button onClick={() => markAsPaid(row.id)} disabled={loading === row.id} className="text-[10px] font-bold text-forest hover:text-ink-1 transition-colors uppercase disabled:opacity-50">
                        {loading === row.id ? '…' : 'Mark Paid'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
      
      {/* Footer totals */}
      <div className="px-5 py-3 bg-surface-2/50 border-t border-hairline flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase text-ink-4 tracking-widest">Aggregate Net</span>
        <span className="num font-bold text-ink-1 text-[13px]">{fmtCurrency(rows.reduce((s, r) => s + (r.net_interest ?? 0), 0))}</span>
      </div>
    </div>
  )
}
