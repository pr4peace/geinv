'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { format, parseISO } from 'date-fns'
import type { PayoutReminderRow } from '@/lib/dashboard-reminders'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

function fmtDate(d: string) {
  return format(parseISO(d), 'dd MMM yyyy')
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function PayoutRow({ row, isOverdue }: { row: PayoutReminderRow; isOverdue: boolean }) {
  const router = useRouter()
  const [notifying, setNotifying] = useState(false)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleNotify() {
    setNotifying(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/agreements/${row.agreement_id}/payouts/${row.id}/notify`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? 'Failed to notify')
      } else {
        router.refresh()
      }
    } catch {
      setError('Network error')
    } finally {
      setNotifying(false)
    }
  }

  async function handlePaid() {
    setPaying(true)
    setError(null)
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const res = await fetch(
        `/api/agreements/${row.agreement_id}/payouts/${row.id}/paid`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paid_date: today }),
        }
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? 'Failed to mark paid')
      } else {
        router.refresh()
      }
    } catch {
      setError('Network error')
    } finally {
      setPaying(false)
    }
  }

  const borderColor = isOverdue ? 'border-l-red-500' : 'border-l-amber-500'

  return (
    <div className={`bg-slate-800/60 border border-slate-700 border-l-4 ${borderColor} rounded-lg p-3 sm:p-4`}>
      {/* Top row: name + amount */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-100 truncate">{row.investor_name}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Due till {fmtDate(row.period_to)} · {capitalize(row.payout_frequency)} · {row.reference_id}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-slate-100">{fmt(row.net_interest)}</p>
          <p className="text-xs text-red-400">TDS {fmt(row.tds_amount)}</p>
        </div>
      </div>

      {/* Action buttons — full-width grid on mobile, inline on sm+ */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end sm:gap-2 sm:mt-2">
        <button
          onClick={handlePaid}
          disabled={paying}
          className={`py-2 sm:py-1.5 px-3 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${
            isOverdue
              ? 'bg-red-700 hover:bg-red-600 text-white'
              : 'bg-green-800/60 hover:bg-green-700/60 text-green-300'
          }`}
        >
          {paying ? 'Saving…' : 'Mark Paid'}
        </button>
        <button
          onClick={handleNotify}
          disabled={notifying}
          className="py-2 sm:py-1.5 px-3 rounded-md text-xs font-medium bg-indigo-700/60 hover:bg-indigo-600/60 text-indigo-200 transition-colors disabled:opacity-50"
        >
          {notifying ? 'Sending…' : row.status === 'notified' ? 'Re-notify' : 'Notify'}
        </button>
      </div>

      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  )
}

interface Props {
  overdue: PayoutReminderRow[]
  thisMonth: PayoutReminderRow[]
  netTotal: number
  monthLabel: string
}

export default function PayoutReminders({ overdue, thisMonth, netTotal, monthLabel }: Props) {
  const overdueCount = overdue.length
  const thisMonthCount = thisMonth.length

  if (overdueCount === 0 && thisMonthCount === 0) {
    return (
      <section>
        <h2 className="text-sm font-bold text-slate-100 mb-3">Interest Payouts</h2>
        <p className="text-sm text-slate-500 italic">No outstanding payouts.</p>
      </section>
    )
  }

  return (
    <section>
      {/* Section header */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-sm font-bold text-slate-100">Interest Payouts</h2>
        {overdueCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-red-900/60 text-red-300 text-xs font-semibold">
            {overdueCount} Overdue
          </span>
        )}
        {thisMonthCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 text-xs font-semibold">
            {thisMonthCount} Due in {monthLabel}
          </span>
        )}
        <span className="ml-auto text-xs text-slate-500">Net total {fmt(netTotal)}</span>
      </div>

      {/* Overdue */}
      {overdueCount > 0 && (
        <div className="mb-5">
          <p className="text-xs font-bold text-red-400 uppercase tracking-wider mb-2">Overdue</p>
          <div className="flex flex-col gap-3">
            {overdue.map(row => (
              <PayoutRow key={row.id} row={row} isOverdue />
            ))}
          </div>
        </div>
      )}

      {/* This month */}
      {thisMonthCount > 0 && (
        <div>
          <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-2">{monthLabel}</p>
          <div className="flex flex-col gap-3">
            {thisMonth.map(row => (
              <PayoutRow key={row.id} row={row} isOverdue={false} />
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
