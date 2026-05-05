'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Landmark } from 'lucide-react'
import type { PayoutSchedule } from '@/types/database'

interface Props {
  agreementId: string
  payouts: PayoutSchedule[]
  principalAmount?: number
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

export default function MaturityPayoutCard({ agreementId, payouts, principalAmount, userRole }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const isCoordinator = userRole !== 'salesperson'

  const todayStr = new Date().toISOString().split('T')[0]
  const row = payouts.find(r => r.is_principal_repayment)
  if (!row) return null

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
    <div className={`bg-slate-800/50 border rounded-xl p-5 ${isOverdue ? 'border-red-700/50' : isPaid ? 'border-slate-700/30' : 'border-amber-700/40'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Landmark className={`w-4 h-4 ${isPaid ? 'text-slate-400' : 'text-amber-400'}`} />
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider">Maturity Payout</h3>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
            isPaid ? 'bg-green-900/40 text-green-400' :
            isOverdue ? 'bg-red-900/40 text-red-400' :
            row.status === 'notified' ? 'bg-amber-900/40 text-amber-400' :
            'bg-slate-700 text-slate-400'
          }`}>{row.status}</span>
          {isCoordinator && (
            isPaid ? (
              <button onClick={revertPayout} disabled={loading} className="text-xs text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-50">
                {loading ? '…' : 'Undo'}
              </button>
            ) : (
              <button onClick={markAsPaid} disabled={loading} className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50">
                {loading ? '…' : 'Mark Paid'}
              </button>
            )
          )}
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-slate-500 mb-1">Scheduled for {fmtDate(row.due_by)}{isOverdue && <span className="ml-1 text-red-400 font-bold uppercase text-[10px]">(overdue)</span>}</p>
          <p className={`text-2xl font-bold ${isPaid ? 'text-slate-400' : isOverdue ? 'text-red-300' : 'text-amber-200'}`}>{fmtCurrency(net)}</p>
        </div>
        <div className="text-right space-y-0.5">
          {interestComponent !== null ? (
            <>
              <p className="text-xs text-slate-500">Principal <span className="text-slate-300 font-mono">{fmtCurrency(principalAmount)}</span></p>
              <p className="text-xs text-slate-500">Interest <span className="text-slate-300 font-mono">{fmtCurrency(interestComponent)}</span></p>
            </>
          ) : (
            <p className="text-xs text-slate-500">Principal <span className="text-slate-300 font-mono">{fmtCurrency(principalAmount)}</span></p>
          )}
          {tds > 0 && <p className="text-xs text-slate-500">TDS <span className="text-red-400/80 font-mono">{fmtCurrency(tds)}</span></p>}
        </div>
      </div>
    </div>
  )
}
