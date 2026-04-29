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
    salesperson?: { name: string } | null
  } | null
  sent_by_member?: { name: string } | null
}

type NotificationStats = {
  payouts: number
  maturities: number
  tdsFilings: number
  docsOverdue: number
}

function StatsHeader({ stats }: { stats: NotificationStats }) {
  const pills = [
    { label: 'Payouts', count: stats.payouts, window: '30 days', icon: '📅' },
    { label: 'Maturities', count: stats.maturities, window: '90 days', icon: '🏁' },
    { label: 'TDS filing', count: stats.tdsFilings, window: '60 days', icon: '📋' },
    { label: 'Docs overdue', count: stats.docsOverdue, window: null, icon: '📄' },
  ]

  return (
    <div className="flex flex-wrap gap-3">
      {pills.map(pill => (
        <div
          key={pill.label}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm ${
            pill.count > 0
              ? 'bg-slate-800 border-slate-700 text-slate-200'
              : 'bg-slate-900 border-slate-800 text-slate-500'
          }`}
        >
          <span>{pill.icon}</span>
          <span className={pill.count > 0 ? 'font-semibold' : ''}>{pill.count}</span>
          <span className="text-slate-400">{pill.label}</span>
          {pill.window && pill.count > 0 && (
            <span className="text-[11px] text-slate-500">in {pill.window}</span>
          )}
        </div>
      ))}
    </div>
  )
}

function getTriggerLabel(item: EnrichedItem): string {
  const todayStr = new Date().toISOString().split('T')[0]
  const due = item.due_date
  if (!due) {
    if (item.notification_type === 'monthly_summary') return 'Monthly summary'
    if (item.notification_type === 'quarterly_forecast') return 'Quarterly forecast'
    return ''
  }

  const diffDays = Math.round(
    (new Date(due).getTime() - new Date(todayStr).getTime()) / 86400000
  )

  switch (item.notification_type) {
    case 'payout':
      return diffDays < 0
        ? `Overdue by ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''}`
        : `Due in ${diffDays} day${diffDays !== 1 ? 's' : ''}`
    case 'maturity':
      return `Matures in ${diffDays} day${diffDays !== 1 ? 's' : ''}`
    case 'tds_filing':
      return `Filing due in ${diffDays} day${diffDays !== 1 ? 's' : ''}`
    case 'doc_return':
      return `Sent ${Math.abs(diffDays)} day${Math.abs(diffDays) !== 1 ? 's' : ''} ago, not returned`
    case 'monthly_summary':
      return 'Monthly summary'
    case 'quarterly_forecast':
      return 'Quarterly forecast'
    default:
      return ''
  }
}

const TYPE_LABELS: Record<NotificationType, string> = {
  payout: 'Payout',
  maturity: 'Maturity',
  tds_filing: 'TDS Filing',
  doc_return: 'Doc Return',
  monthly_summary: 'Monthly Summary',
  quarterly_forecast: 'Quarterly Forecast',
}

const TYPE_COLORS: Record<NotificationType, string> = {
  payout: 'bg-indigo-900/40 text-indigo-400',
  maturity: 'bg-amber-900/40 text-amber-400',
  tds_filing: 'bg-violet-900/40 text-violet-400',
  doc_return: 'bg-orange-900/40 text-orange-400',
  monthly_summary: 'bg-slate-700 text-slate-300',
  quarterly_forecast: 'bg-slate-700 text-slate-300',
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function TypeBadge({ type }: { type: NotificationType }) {
  return (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${TYPE_COLORS[type]}`}>
      {TYPE_LABELS[type]}
    </span>
  )
}

function QueueTable({
  items,
  isReadOnly,
  onSend,
  onDismiss,
  sending,
}: {
  items: EnrichedItem[]
  isReadOnly?: boolean
  onSend: (ids: string[]) => void
  onDismiss: (id: string) => void
  sending: boolean
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const todayStr = new Date().toISOString().split('T')[0]

  function toggleAll() {
    setSelected(s => s.size === items.length ? new Set() : new Set(items.map(i => i.id)))
  }

  function toggle(id: string) {
    setSelected(s => {
      const next = new Set(s)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  if (items.length === 0) {
    return <p className="text-slate-500 text-sm py-12 text-center italic">Nothing here.</p>
  }

  return (
    <div className="space-y-4">
      {!isReadOnly && selected.size > 0 && (
        <div className="flex items-center justify-between bg-indigo-900/20 border border-indigo-800/40 rounded-xl px-4 py-3">
          <span className="text-sm text-slate-300">{selected.size} selected</span>
          <button
            onClick={() => { onSend(Array.from(selected)); setSelected(new Set()) }}
            disabled={sending}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg disabled:opacity-50 transition-colors"
          >
            {sending ? 'Sending…' : 'Send selected'}
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm text-slate-300">
          <thead>
            <tr className="border-b border-slate-700 text-xs text-slate-400">
              {!isReadOnly && (
                <th className="pb-2 pr-3 text-left w-8">
                  <input type="checkbox"
                    checked={selected.size === items.length && items.length > 0}
                    onChange={toggleAll}
                    className="accent-indigo-500"
                  />
                </th>
              )}
              <th className="pb-2 pr-4 text-left">Type</th>
              <th className="pb-2 pr-4 text-left">Investor / Detail</th>
              <th className="pb-2 pr-4 text-left whitespace-nowrap">Due Date</th>
              <th className="pb-2 pr-4 text-left">Recipients</th>
              {!isReadOnly && <th className="pb-2 text-left">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const urgent = item.due_date ? item.due_date <= todayStr : false
              return (
                <tr key={item.id}
                  className={`border-b border-slate-700/40 hover:bg-slate-800/20 ${urgent ? 'border-l-2 border-l-red-500 pl-2' : ''}`}
                >
                  {!isReadOnly && (
                    <td className="py-2.5 pr-3">
                      <input type="checkbox" checked={selected.has(item.id)}
                        onChange={() => toggle(item.id)} className="accent-indigo-500" />
                    </td>
                  )}
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <TypeBadge type={item.notification_type} />
                      {isReadOnly && <span className="text-[10px] text-red-400 font-bold">URGENT</span>}
                    </div>
                  </td>
                  <td className="py-2.5 pr-4">
                    {item.agreement ? (
                      <div>
                        <p className="text-slate-100 font-medium">{item.agreement.investor_name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{item.agreement.reference_id}</p>
                        {getTriggerLabel(item) && (
                          <p className="text-[10px] text-slate-500 mt-0.5">{getTriggerLabel(item)}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-400 italic text-xs">{TYPE_LABELS[item.notification_type]}</p>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 whitespace-nowrap text-xs">{fmtDate(item.due_date)}</td>
                  <td className="py-2.5 pr-4 text-xs text-slate-400">
                    {(item.recipients as { accounts: string[]; salesperson: string | null }).accounts.length} accounts
                    {(item.recipients as { accounts: string[]; salesperson: string | null }).salesperson ? ' + SP' : ''}
                  </td>
                  {!isReadOnly && (
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        <button onClick={() => onSend([item.id])} disabled={sending}
                          className="px-2 py-1 text-xs rounded bg-indigo-900/40 text-indigo-400 hover:bg-indigo-800/40 disabled:opacity-50 transition-colors whitespace-nowrap">
                          Send
                        </button>
                        <button onClick={() => onDismiss(item.id)}
                          className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-400 hover:bg-slate-700 transition-colors">
                          Dismiss
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function HistoryTable({ items, onResend, sending }: {
  items: EnrichedItem[]
  onResend: (id: string) => void
  sending: boolean
}) {
  if (items.length === 0) {
    return <p className="text-slate-500 text-sm py-12 text-center italic">No sent notifications in the last 30 days.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm text-slate-300">
        <thead>
          <tr className="border-b border-slate-700 text-xs text-slate-400">
            <th className="pb-2 pr-4 text-left">Type</th>
            <th className="pb-2 pr-4 text-left">Investor / Detail</th>
            <th className="pb-2 pr-4 text-left whitespace-nowrap">Sent</th>
            <th className="pb-2 pr-4 text-left">By</th>
            <th className="pb-2 text-left">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} className="border-b border-slate-700/40 hover:bg-slate-800/20">
              <td className="py-2.5 pr-4"><TypeBadge type={item.notification_type} /></td>
              <td className="py-2.5 pr-4">
                {item.agreement ? (
                  <div>
                    <p className="text-slate-100 font-medium">{item.agreement.investor_name}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{item.agreement.reference_id}</p>
                  </div>
                ) : (
                  <p className="text-slate-400 italic text-xs">{TYPE_LABELS[item.notification_type]}</p>
                )}
              </td>
              <td className="py-2.5 pr-4 whitespace-nowrap text-xs">{fmtDate(item.sent_at)}</td>
              <td className="py-2.5 pr-4 text-xs text-slate-400">{item.sent_by_member?.name ?? '—'}</td>
              <td className="py-2.5">
                <button onClick={() => onResend(item.id)} disabled={sending}
                  className="px-2 py-1 text-xs rounded bg-slate-800 text-slate-400 hover:bg-slate-700 disabled:opacity-50 transition-colors">
                  Re-send
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function NotificationsClient({
  pending, redFlags, history, userRole, stats,
}: {
  pending: EnrichedItem[]
  redFlags: EnrichedItem[]
  history: EnrichedItem[]
  userRole: string
  stats: NotificationStats
}) {
  const router = useRouter()
  const [tab, setTab] = useState<'queue' | 'flags' | 'history'>('queue')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null)
  const isCoordinator = userRole !== 'salesperson'

  async function handleSend(ids: string[]) {
    setSending(true)
    setError(null)
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Send failed')
      else if (data.failed > 0) setError(`${data.failed} failed: ${data.errors?.join(', ')}`)
      router.refresh()
    } finally {
      setSending(false)
    }
  }

  async function handleDismiss(id: string) {
    await fetch(`/api/notifications/${id}/dismiss`, { method: 'POST' })
    setUndoToast({
      message: 'Notification dismissed',
      onUndo: async () => {
        setUndoToast(null)
        await fetch(`/api/notifications/${id}/revert-dismiss`, { method: 'POST' })
        router.refresh()
      }
    })
    router.refresh()
  }

  const tabs = [
    { key: 'queue' as const, label: `Queue (${pending.length})` },
    { key: 'flags' as const, label: `🔴 Red Flags (${redFlags.length})` },
    { key: 'history' as const, label: 'History' },
  ]

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Notifications</h1>
        <p className="text-xs text-slate-500 mt-0.5">Review and send upcoming reminders — nothing sends without your approval</p>
      </div>

      <StatsHeader stats={stats} />

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl px-4 py-3 text-sm text-red-400 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200 ml-4">✕</button>
        </div>
      )}

      {isCoordinator && (
        <QuickSendPanel
          pending={pending}
          onSend={handleSend}
          sending={sending}
        />
      )}

      <div className="flex gap-1 border-b border-slate-800">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t.key
                ? 'border-indigo-500 text-indigo-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        {tab === 'queue' && (
          <QueueTable items={pending} onSend={handleSend} onDismiss={handleDismiss}
            sending={sending} isReadOnly={!isCoordinator} />
        )}
        {tab === 'flags' && (
          <QueueTable items={redFlags} onSend={handleSend} onDismiss={handleDismiss}
            sending={sending} isReadOnly={!isCoordinator} />
        )}
        {tab === 'history' && (
          <HistoryTable items={history} onResend={(id) => handleSend([id])} sending={sending} />
        )}
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
