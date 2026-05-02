'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { NotificationQueue, NotificationType } from '@/types/database'
import { UndoToast } from '@/components/UndoToast'
import QuickSendPanel from '@/components/notifications/QuickSendPanel'

type EnrichedItem = NotificationQueue & {
  agreement?: {
    id: string
    investor_name: string
    reference_id: string
    salesperson?: { id?: string; name: string } | null
  } | null
  sent_by_member?: { name: string } | null
  gross_interest?: number | null
  tds_amount?: number | null
  net_interest?: number | null
}

type NotificationStats = {
  payouts: number
  maturities: number
  tdsFilings: number
  docsOverdue: number
  payoutAmounts: { gross: number; tds: number; net: number }
  maturityAmounts: { gross: number; tds: number; net: number }
  tdsAmounts: { gross: number; tds: number; net: number }
}

function fmtCurrency(n: number) {
  if (n === 0) return '₹0'
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1).replace('.0', '')}Cr`
  if (n >= 100000) return `₹${(n / 100000).toFixed(1).replace('.0', '')}L`
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`
  return `₹${n.toLocaleString('en-IN')}`
}

function KPISection({ stats, onPresetClick }: { stats: NotificationStats; onPresetClick: (preset: string) => void }) {
  const cards = [
    { label: 'Payouts', count: stats.payouts, amount: stats.payoutAmounts.net, preset: 'this-week', color: 'indigo' },
    { label: 'Maturities', count: stats.maturities, amount: stats.maturityAmounts.net, preset: 'this-month', color: 'amber' },
    { label: 'TDS Filing', count: stats.tdsFilings, amount: stats.tdsAmounts.net, preset: 'this-fortnight', color: 'violet' },
    { label: 'Docs Overdue', count: stats.docsOverdue, amount: null, preset: 'red-flags', color: 'orange' },
  ]

  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-900/20 border-indigo-800/40 text-indigo-400',
    amber: 'bg-amber-900/20 border-amber-800/40 text-amber-400',
    violet: 'bg-violet-900/20 border-violet-800/40 text-violet-400',
    orange: 'bg-orange-900/20 border-orange-800/40 text-orange-400',
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(card => (
        <button
          key={card.label}
          onClick={() => onPresetClick(card.preset)}
          className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border text-left transition-all hover:scale-[1.02] ${
            card.count > 0
              ? colorMap[card.color]
              : 'bg-slate-900 border-slate-800 text-slate-600'
          }`}
        >
          <span className="text-xs font-medium opacity-70">{card.label}</span>
          <span className="text-2xl font-bold">{card.count}</span>
          {card.amount != null && card.amount > 0 && (
            <span className="text-[11px] font-mono opacity-60">{fmtCurrency(card.amount)}</span>
          )}
        </button>
      ))}
    </div>
  )
}

const TYPE_LABELS: Record<NotificationType, string> = {
  payout: 'Payout',
  maturity: 'Maturity',
  tds_filing: 'TDS Filing',
  doc_return: 'Doc Return',
  monthly_summary: 'Monthly Summary',
  quarterly_forecast: 'Quarterly Forecast',
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function ActivityLog({ history }: { history: EnrichedItem[] }) {
  if (history.length === 0) {
    return <p className="text-slate-500 text-sm py-8 text-center italic">No sent notifications yet.</p>
  }

  // Group by sent date
  const byDate: Record<string, EnrichedItem[]> = {}
  for (const item of history) {
    const dateKey = item.sent_at ? fmtDate(item.sent_at) : 'Unknown'
    if (!byDate[dateKey]) byDate[dateKey] = []
    byDate[dateKey].push(item)
  }

  return (
    <div className="space-y-3">
      {Object.entries(byDate).map(([date, items]) => {
        const types = Array.from(new Set(items.map(i => i.notification_type)))
        const totalNet = 0
        const sentBy = Array.from(new Set(items.map(i => i.sent_by_member?.name).filter((n): n is string => Boolean(n)))).join(', ')

        return (
          <div key={date} className="flex items-start gap-3 text-sm">
            <span className="text-xs text-slate-500 font-mono whitespace-nowrap pt-0.5">{date}</span>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-300">
                Sent {items.length} {TYPE_LABELS[types[0]] ?? 'notification'}{items.length !== 1 ? 's' : ''}
              </span>
              {totalNet > 0 && (
                <span className="text-xs font-mono text-slate-400">{fmtCurrency(totalNet)}</span>
              )}
              <span className="text-xs text-slate-500">→ {sentBy || '—'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function NotificationsClient({
  pending, history, userRole, stats, salespersons,
}: {
  pending: EnrichedItem[]
  history: EnrichedItem[]
  userRole: string
  stats: NotificationStats
  salespersons: { id: string; name: string }[]
}) {
  const router = useRouter()
  const [refreshing, setRefreshing] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null)
  const isCoordinator = userRole !== 'salesperson'

  async function handleRefresh() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/reminders/process', { method: 'POST' })
      if (!res.ok) throw new Error('Refresh failed')
      router.refresh()
    } catch {
      setError('Failed to refresh queue')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleSend(ids: string[], grouping: 'single' | 'per-person', recipientOverrides: Record<string, boolean>) {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, grouping, recipients: recipientOverrides }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Send failed')
      else if (data.failed > 0) setError(`${data.failed} failed: ${data.errors?.join(', ')}`)
      else {
        setUndoToast({
          message: `Sent ${data.sent} notification${data.sent !== 1 ? 's' : ''} successfully`,
          onUndo: () => setUndoToast(null),
        })
      }
      router.refresh()
    } catch {
      setError('Send failed')
    } finally {
      setSending(false)
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function handlePresetFromKPI(_preset: string) {
    // Scroll to QuickSend
    setTimeout(() => {
      document.getElementById('quick-send-section')?.scrollIntoView({ behavior: 'smooth' })
    }, 100)
  }

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Notifications</h1>
          <p className="text-xs text-slate-500 mt-0.5">Pick a preset, review, confirm — nothing sends without your approval</p>
        </div>
        {isCoordinator && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition-colors disabled:opacity-50"
          >
            <span>{refreshing ? 'Refreshing…' : '↻ Refresh Queue'}</span>
          </button>
        )}
      </div>

      {/* KPI Cards → clickable preset triggers */}
      <KPISection stats={stats} onPresetClick={handlePresetFromKPI} />

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-4">✕</button>
        </div>
      )}

      {/* Quick Send Panel */}
      {isCoordinator && (
        <div id="quick-send-section" className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <QuickSendPanel
            pending={pending}
            onSend={handleSend}
            sending={sending}
            salespersons={salespersons}
          />
        </div>
      )}

      {/* Activity Log */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-4">Recent Activity</h3>
        <ActivityLog history={history} />
      </div>

      {undoToast && (
        <UndoToast
          message={undoToast.message}
          onUndo={undoToast.onUndo}
          onDismiss={() => setUndoToast(null)}
        />
      )}
    </div>
  )
}
