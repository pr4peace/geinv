'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Landmark } from 'lucide-react'
import type { PayoutSchedule } from '@/types/database'

interface Props {
  agreementId: string
  payouts: PayoutSchedule[]
  principalAmount?: number
  maturityDate?: string
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

export default function MaturityPayoutCard({ agreementId, payouts, principalAmount, maturityDate, userRole }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const isCoordinator = userRole !== 'salesperson'

  const todayStr = new Date().toISOString().split('T')[0]
  const row = payouts.find(r => r.is_principal_repayment)

  function StatusDot({ status, isOverdue }: { status?: string, isOverdue?: boolean }) {
    const dot = status === 'paid' ? 'sdot-paid' : isOverdue ? 'sdot-overdue' : status === 'notified' ? 'sdot-notified' : 'sdot-pending'
    return <span className={`sdot ${dot} m-0`} title={status} />
  }

  // Show a read-only card from agreement-level data when no payout row exists yet
  if (!row) {
    if (!maturityDate || !principalAmount) return null
    const isOverdue = maturityDate < todayStr
    return (
      <div className={`bg-surface border rounded-sm p-6 shadow-sm ${isOverdue ? 'border-rust/30' : 'border-hairline'}`}>
        <div className="flex items-center gap-2 mb-6">
          <Landmark className={`w-3.5 h-3.5 ${isOverdue ? 'text-rust' : 'text-earth-brown'}`} />
          <h3 className="lbl font-bold text-ink-1 uppercase tracking-widest">Maturity Payout</h3>
        </div>
        <div className="flex items-end justify-between">
          <div>
            <p className="lbl opacity-70 mb-1">Scheduled for {fmtDate(maturityDate)}{isOverdue && <span className="ml-2 text-rust font-bold uppercase text-[9px] tracking-widest">(overdue)</span>}</p>
            <p className={`text-2xl font-bold num ${isOverdue ? 'text-rust' : 'text-earth-brown'} leading-none`}>{fmtCurrency(principalAmount)}</p>
          </div>
          <p className="text-[11px] text-ink-4 font-medium uppercase tracking-tight">Principal <span className="num font-bold text-ink-2">{fmtCurrency(principalAmount)}</span></p>
        </div>
      </div>
    )
  }

  const rawGross = row.gross_interest ?? 0
  const gross = rawGross === 0 && principalAmount ? principalAmount : rawGross
  const tds = row.tds_amount ?? 0
  const net = gross - tds
  const interestComponent = principalAmount && gross > principalAmount * 1.01 ? gross - principalAmount : null

  const isPaid = row.status === 'paid'
  const isOverdue = !isPaid && row.due_by < todayStr

  async function markAsPaid() {
    setLoading(true)
    try {
      const res = await fetch(`/api/agreements/${agreementId}/payouts/${row!.id}/paid`, { method: 'POST' })
      if (!res.ok) return
      router.refresh()
    } finally { setLoading(false) }
  }

  async function revertPayout() {
    setLoading(true)
    try {
      const res = await fetch(`/api/agreements/${agreementId}/payouts/${row!.id}/revert`, { method: 'POST' })
      if (!res.ok) return
      router.refresh()
    } finally { setLoading(false) }
  }

  return (
    <div className={`bg-surface border rounded-sm p-6 shadow-sm ${isOverdue ? 'border-rust/30' : isPaid ? 'border-hairline-strong/20 opacity-80' : 'border-hairline'}`}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Landmark className={`w-3.5 h-3.5 ${isPaid ? 'text-ink-4' : isOverdue ? 'text-rust' : 'text-earth-brown'}`} />
          <h3 className="lbl font-bold text-ink-1 uppercase tracking-widest">Maturity Payout</h3>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <StatusDot status={row.status} isOverdue={isOverdue} />
            <span className="text-[9px] font-bold uppercase text-ink-4 tracking-tighter">{row.status}</span>
          </div>
          {isCoordinator && (
            <div className="border-l border-hairline pl-4">
              {isPaid ? (
                <button onClick={revertPayout} disabled={loading} className="text-[10px] font-bold text-ink-5 hover:text-ink-3 transition-colors uppercase disabled:opacity-50">
                  {loading ? '…' : 'Undo'}
                </button>
              ) : (
                <button onClick={markAsPaid} disabled={loading} className="text-[10px] font-bold text-forest hover:text-ink-1 transition-colors uppercase disabled:opacity-50">
                  {loading ? '…' : 'Mark Paid'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <p className="lbl opacity-70">Scheduled for {fmtDate(row.due_by)}{isOverdue && <span className="ml-2 text-rust font-bold uppercase text-[9px] tracking-widest">(overdue)</span>}</p>
          <p className={`text-2xl font-bold num leading-none ${isPaid ? 'text-ink-4' : isOverdue ? 'text-rust' : 'text-earth-brown'}`}>{fmtCurrency(net)}</p>
        </div>
        <div className="text-right space-y-1">
          {interestComponent !== null ? (
            <>
              <p className="text-[11px] text-ink-4 font-medium">Principal <span className="num font-bold text-ink-2 ml-1">{fmtCurrency(principalAmount)}</span></p>
              <p className="text-[11px] text-ink-4 font-medium">Interest <span className="num font-bold text-gain ml-1">{fmtCurrency(interestComponent)}</span></p>
            </>
          ) : (
            <p className="text-[11px] text-ink-4 font-medium">Principal <span className="num font-bold text-ink-2 ml-1">{fmtCurrency(principalAmount)}</span></p>
          )}
          {tds > 0 && <p className="text-[11px] text-ink-4 font-medium">TDS <span className="num font-bold text-rust ml-1">{fmtCurrency(tds)}</span></p>}
        </div>
      </div>
    </div>
  )
}
