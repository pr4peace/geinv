'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PayoutSchedule } from '@/types/database'

interface Props {
  agreementId: string
  payouts: PayoutSchedule[]
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

function PayoutStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-slate-700 text-slate-300',
    notified: 'bg-amber-900/40 text-amber-400',
    paid: 'bg-green-900/40 text-green-400',
    overdue: 'bg-red-900/40 text-red-400',
  }
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${map[status] ?? 'bg-slate-700 text-slate-300'}`}>
      {status}
    </span>
  )
}

function MarkTdsFiledButton({ payoutId }: { payoutId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch(`/api/payout-schedule/${payoutId}/mark-tds-filed`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Failed to mark TDS as filed')
      } else {
        router.refresh()
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="text-[10px] px-2 py-0.5 rounded bg-violet-900/40 text-violet-300 hover:bg-violet-800/40 disabled:opacity-50 transition-colors border border-violet-800/50"
    >
      {loading ? 'Saving…' : 'Mark Filed'}
    </button>
  )
}

export default function PayoutScheduleSection({ agreementId, payouts }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  const interestRows = payouts
    .filter(r => !r.is_principal_repayment && !r.is_tds_only)
    .sort((a, b) => a.due_by.localeCompare(b.due_by))
  const principalRows = payouts.filter(r => r.is_principal_repayment)
  const tdsOnlyRows = payouts.filter(r => r.is_tds_only).sort((a, b) => a.due_by.localeCompare(b.due_by))

  async function markAsPaid(payoutId: string) {
    setLoading(payoutId)
    try {
      const res = await fetch(`/api/agreements/${agreementId}/payouts/${payoutId}/paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error ?? 'Failed to mark as paid')
      } else {
        router.refresh()
      }
    } finally {
      setLoading(null)
    }
  }

  if (payouts.length === 0) {
    return <p className="text-slate-500 text-sm italic">No payout schedule available.</p>
  }

  return (
    <div className="space-y-6">
      {/* ── Interest Payouts ── */}
      {interestRows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm text-slate-300">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-400">
                <th className="pb-2 text-left pr-3 whitespace-nowrap">Period</th>
                <th className="pb-2 text-right pr-3 whitespace-nowrap">Days</th>
                <th className="pb-2 text-left pr-3 whitespace-nowrap">Due By</th>
                <th className="pb-2 text-right pr-3 whitespace-nowrap">Gross Interest</th>
                <th className="pb-2 text-right pr-3 whitespace-nowrap">TDS</th>
                <th className="pb-2 text-right pr-3 whitespace-nowrap">Net Interest</th>
                <th className="pb-2 text-center pr-3 whitespace-nowrap">Status</th>
                <th className="pb-2 text-left pr-3 whitespace-nowrap">Paid Date</th>
                <th className="pb-2 text-center whitespace-nowrap">Action</th>
              </tr>
            </thead>
            <tbody>
              {interestRows.map((row) => (
                <tr key={row.id} className="border-b border-slate-700/40 hover:bg-slate-700/20">
                  <td className="py-2 pr-3 whitespace-nowrap text-slate-400 text-xs">
                    {fmtDate(row.period_from)} → {fmtDate(row.period_to)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{row.no_of_days ?? '—'}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(row.due_by)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{fmtCurrency(row.gross_interest)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-red-400">{fmtCurrency(row.tds_amount)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums font-medium text-green-400">{fmtCurrency(row.net_interest)}</td>
                  <td className="py-2 pr-3 text-center">
                    <PayoutStatusBadge status={row.status} />
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-slate-400 text-xs">{fmtDate(row.paid_date)}</td>
                  <td className="py-2 text-center">
                    {row.status !== 'paid' && (
                      <button
                        onClick={() => markAsPaid(row.id)}
                        disabled={loading === row.id}
                        className="px-2 py-1 text-xs rounded bg-green-800/40 text-green-400 hover:bg-green-800/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                      >
                        {loading === row.id ? 'Saving…' : 'Mark Paid'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TDS Only Payouts (Cumulative Tracking) ── */}
      {tdsOnlyRows.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">TDS Filing Obligations</p>
          <div className="grid grid-cols-1 gap-3">
            {tdsOnlyRows.map((row) => (
              <div key={row.id} className="bg-violet-900/10 border border-violet-800/30 rounded-lg p-3 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-900/40 text-violet-400 border border-violet-800/50">
                    TDS FILING
                  </span>
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">Due By</p>
                    <p className="text-xs text-slate-200">{fmtDate(row.due_by)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-0.5">TDS Amount</p>
                    <p className="text-xs text-violet-400 font-semibold">{fmtCurrency(row.tds_amount)}</p>
                  </div>
                </div>
                <div>
                  {row.tds_filed ? (
                    <span className="text-[10px] text-emerald-400 font-bold bg-emerald-900/20 px-2 py-1 rounded border border-emerald-800/30">
                      ✓ FILED
                    </span>
                  ) : (
                    <MarkTdsFiledButton payoutId={row.id} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Principal Repayment ── */}
      {principalRows.map((row) => (
        <div key={row.id} className="bg-emerald-900/10 border border-emerald-800/30 rounded-lg p-4">
          <p className="text-sm font-semibold text-emerald-400 mb-3">Principal Repayment at Maturity</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Due By</p>
              <p className="text-slate-200">{fmtDate(row.due_by)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Principal Amount</p>
              <p className="text-emerald-400 font-semibold">{fmtCurrency(row.gross_interest)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Status</p>
              <PayoutStatusBadge status={row.status} />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Action</p>
              {row.status !== 'paid' && (
                <button
                  onClick={() => markAsPaid(row.id)}
                  disabled={loading === row.id}
                  className="px-2 py-1 text-xs rounded bg-green-800/40 text-green-400 hover:bg-green-800/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading === row.id ? 'Saving…' : 'Mark Paid'}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
