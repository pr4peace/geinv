'use client'

import { useState } from 'react'
import { format, parseISO, differenceInDays } from 'date-fns'
import type { QuarterlyForecast } from '@/lib/kpi'

type PayoutRow = QuarterlyForecast['payouts'][number]

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

function UrgencyLabel({ dueBy, status }: { dueBy: string; status: string }) {
  const today = new Date()
  const due = parseISO(dueBy)
  const diff = differenceInDays(due, today)

  if (status === 'overdue') {
    return <span className="text-xs font-bold text-red-400 bg-red-900/30 px-2 py-0.5 rounded">OVERDUE</span>
  }
  if (status === 'paid') {
    return <span className="text-xs font-bold text-green-400 bg-green-900/30 px-2 py-0.5 rounded">PAID</span>
  }
  if (diff <= 30) {
    return <span className="text-xs font-bold text-amber-400 bg-amber-900/30 px-2 py-0.5 rounded">IN {diff} DAYS</span>
  }
  return <span className="text-xs text-slate-500">{format(due, 'dd MMM yyyy')}</span>
}

function stepChecked(step: 1 | 2 | 3, status: string, dueBy: string): boolean {
  const today = new Date()
  const due = parseISO(dueBy)
  const diff = differenceInDays(due, today)

  if (status === 'paid') return true
  if (status === 'notified') {
    if (step === 1 || step === 2) return true
    return false
  }
  // pending / overdue
  if (step === 1) {
    return diff <= 14
  }
  return false
}

function CheckBubble({ done, label }: { done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-1 text-xs ${done ? 'text-green-400' : 'text-slate-500'}`}>
      <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${done ? 'bg-green-500 border-green-500 text-white' : 'border-slate-600'}`}>
        {done && (
          <svg className="w-2.5 h-2.5" viewBox="0 0 10 10" fill="none">
            <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span>{label}</span>
    </div>
  )
}

function borderColor(status: string, dueBy: string): string {
  if (status === 'paid') return 'border-l-green-500'
  if (status === 'overdue') return 'border-l-red-500'
  const diff = differenceInDays(parseISO(dueBy), new Date())
  if (diff <= 30) return 'border-l-amber-500'
  return 'border-l-slate-600'
}

interface PayoutRowItemProps {
  payout: PayoutRow
  onRefresh: () => void
}

function PayoutRowItem({ payout, onRefresh }: PayoutRowItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [notifying, setNotifying] = useState(false)
  const [paying, setPaying] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const step1Done = stepChecked(1, payout.status, payout.due_by)
  const step2Done = stepChecked(2, payout.status, payout.due_by)
  const step3Done = stepChecked(3, payout.status, payout.due_by)

  async function handleNotify() {
    setNotifying(true)
    setActionError(null)
    try {
      const res = await fetch(`/api/agreements/${payout.agreement_id}/payouts/${payout.id}/notify`, {
        method: 'POST',
      })
      if (!res.ok) {
        const j = await res.json()
        setActionError(j.error ?? 'Failed to notify')
      } else {
        onRefresh()
      }
    } catch {
      setActionError('Network error')
    } finally {
      setNotifying(false)
    }
  }

  async function handlePaid() {
    setPaying(true)
    setActionError(null)
    try {
      const today = format(new Date(), 'yyyy-MM-dd')
      const res = await fetch(`/api/agreements/${payout.agreement_id}/payouts/${payout.id}/paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paid_date: today }),
      })
      if (!res.ok) {
        const j = await res.json()
        setActionError(j.error ?? 'Failed to mark paid')
      } else {
        onRefresh()
      }
    } catch {
      setActionError('Network error')
    } finally {
      setPaying(false)
    }
  }

  return (
    <div className={`border border-slate-700 border-l-4 ${borderColor(payout.status, payout.due_by)} rounded-lg bg-slate-800/50 overflow-hidden`}>
      {/* Summary row */}
      <button
        className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-slate-700/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <UrgencyLabel dueBy={payout.due_by} status={payout.status} />
        <span className="text-xs text-slate-400 w-24 shrink-0">{format(parseISO(payout.due_by), 'dd MMM yyyy')}</span>
        <span className="text-sm font-medium text-slate-100 flex-1 flex items-center gap-2">
          {payout.investor_name}
          {payout.is_draft && (
            <span className="text-xs font-bold text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded">DRAFT</span>
          )}
        </span>
        <span className="text-xs text-slate-400 capitalize">{payout.payout_frequency}</span>
        <span className="text-xs font-medium text-slate-100">{fmt(payout.net_interest)}</span>
        <span className="text-xs text-red-400">TDS {fmt(payout.tds_amount)}</span>
        <div className="flex items-center gap-3 ml-4">
          <CheckBubble done={step1Done} label="Reminded" />
          <CheckBubble done={step2Done} label="Notified" />
          <CheckBubble done={step3Done} label="Paid" />
        </div>
        <svg className={`w-4 h-4 text-slate-400 ml-2 transition-transform ${expanded ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-slate-700/50 bg-slate-800">
          <div className="space-y-3 mt-3">
            {/* Step 1 */}
            <div className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${step1Done ? 'bg-green-500' : 'bg-slate-700 border border-slate-600'}`}>
                <span className="text-white text-xs font-bold">1</span>
              </div>
              <div>
                <p className={`text-xs font-medium ${step1Done ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                  {step1Done ? 'Reminder email sent' : `Reminder email — scheduled for ${format(new Date(new Date(payout.due_by).getTime() - 14 * 24 * 60 * 60 * 1000), 'dd MMM yyyy')}`}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {step1Done
                    ? '(auto-scheduled 14 days before due date)'
                    : `Due ${format(parseISO(payout.due_by), 'dd MMM yyyy')} — reminder not yet sent.`}
                </p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${step2Done ? 'bg-green-500' : 'bg-slate-700 border border-slate-600'}`}>
                <span className="text-white text-xs font-bold">2</span>
              </div>
              <div className="flex-1">
                <p className={`text-xs font-medium ${step2Done ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                  Accounts team notified via email
                </p>
                {!step2Done && (
                  <button
                    onClick={handleNotify}
                    disabled={notifying}
                    className="mt-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs px-3 py-1 rounded-lg transition-colors"
                  >
                    {notifying ? 'Sending…' : 'Notify Accounts'}
                  </button>
                )}
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${step3Done ? 'bg-green-500' : 'bg-slate-700 border border-slate-600'}`}>
                <span className="text-white text-xs font-bold">3</span>
              </div>
              <div className="flex-1">
                <p className={`text-xs font-medium ${step3Done ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                  Mark payment as done
                </p>
                {!step3Done && (
                  <div className="flex gap-2 mt-1.5">
                    <button
                      onClick={handlePaid}
                      disabled={paying}
                      className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs px-3 py-1 rounded-lg transition-colors"
                    >
                      {paying ? 'Saving…' : 'Mark as Paid'}
                    </button>
                    {step2Done && (
                      <button
                        onClick={handleNotify}
                        disabled={notifying}
                        className="bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-xs px-3 py-1 rounded-lg transition-colors"
                      >
                        Re-notify Accounts
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {actionError && (
              <p className="text-xs text-red-400 mt-1">{actionError}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface Props {
  payouts: PayoutRow[]
}

export default function UpcomingPayouts({ payouts }: Props) {
  const [list, setList] = useState<PayoutRow[]>(payouts)
  const [refreshing, setRefreshing] = useState(false)

  async function refresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/kpi')
      const json = await res.json()
      if (json.forecast?.payouts) {
        setList(json.forecast.payouts)
      }
    } catch {
      // ignore
    } finally {
      setRefreshing(false)
    }
  }

  // Sort: overdue first, then by due_by
  const sorted = [...list].sort((a, b) => {
    if (a.status === 'overdue' && b.status !== 'overdue') return -1
    if (b.status === 'overdue' && a.status !== 'overdue') return 1
    return a.due_by.localeCompare(b.due_by)
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-100">Upcoming Payouts</h2>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="text-xs text-slate-400 hover:text-slate-200 disabled:opacity-50 transition-colors"
        >
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {sorted.length === 0 ? (
        <div className="text-center text-slate-500 text-sm py-8">No upcoming payouts.</div>
      ) : (
        <div className="space-y-2">
          {sorted.map((p, i) => (
            <PayoutRowItem key={`${p.agreement_id}-${p.due_by}-${i}`} payout={p} onRefresh={refresh} />
          ))}
        </div>
      )}
    </div>
  )
}
