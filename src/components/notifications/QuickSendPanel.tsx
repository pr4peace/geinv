'use client'

import { useState, useMemo } from 'react'
import type { NotificationQueue, NotificationType } from '@/types/database'
import type { BatchedEmail } from '@/lib/batch-notifications'

type EnrichedItem = NotificationQueue & {
  agreement?: {
    id: string
    investor_name: string
    reference_id: string
    salesperson?: { id?: string; name: string; email?: string } | null
  } | null
  gross_interest?: number | null
  tds_amount?: number | null
  net_interest?: number | null
}

type PresetKey =
  | 'this-week'
  | 'this-fortnight'
  | 'this-month'
  | 'this-quarter'
  | 'this-fy'
  | 'red-flags'
  | 'monthly-summary'
  | 'quarterly-forecast'
  | 'yearly-review'
  | 'custom'
  | 'none'

const DATE_PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'this-week', label: 'This Week' },
  { key: 'this-fortnight', label: 'This Fortnight' },
  { key: 'this-month', label: 'This Month' },
  { key: 'this-quarter', label: 'This Quarter' },
  { key: 'this-fy', label: 'This FY' },
  { key: 'custom', label: 'Custom' },
]

const TYPE_FILTERS: { key: NotificationType; label: string; color: string }[] = [
  { key: 'payout', label: 'Interest', color: 'bg-emerald-900/30 border-emerald-700 text-emerald-300' },
  { key: 'tds_filing', label: 'TDS', color: 'bg-amber-900/30 border-amber-700 text-amber-300' },
  { key: 'maturity', label: 'Maturity', color: 'bg-purple-900/30 border-purple-700 text-purple-300' },
  { key: 'doc_return', label: 'Doc Return', color: 'bg-blue-900/30 border-blue-700 text-blue-300' },
]

const TYPE_LABELS: Record<NotificationType, string> = {
  payout: 'Interest',
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

function fmtCurrency(n: number) {
  return `₹${n.toLocaleString('en-IN')}`
}

function getCalendarWindow(preset: PresetKey): { from: string; to: string; types?: NotificationType[] } | null {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()

  // Financial year: Apr 1 to Mar 31
  const fyStart = month >= 3 ? year : year - 1
  const fyFrom = `${fyStart}-04-01`
  const fyTo = `${fyStart + 1}-03-31`

  // Calendar month
  const monthFrom = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const monthTo = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  // Calendar quarter
  const quarterStart = Math.floor(month / 3) * 3
  const qFrom = `${year}-${String(quarterStart + 1).padStart(2, '0')}-01`
  const qLastDay = new Date(year, quarterStart + 3, 0).getDate()
  const qTo = `${year}-${String(quarterStart + 3).padStart(2, '0')}-${String(qLastDay).padStart(2, '0')}`

  const todayStr = now.toISOString().split('T')[0]
  const plus7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
  const plus14 = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]

  switch (preset) {
    case 'this-week':
      return { from: todayStr, to: plus7, types: ['payout', 'tds_filing'] }
    case 'this-fortnight':
      return { from: todayStr, to: plus14 }
    case 'this-month':
      return { from: monthFrom, to: monthTo }
    case 'this-quarter':
      return { from: qFrom, to: qTo }
    case 'this-fy':
      return { from: fyFrom, to: fyTo }
    case 'monthly-summary':
      return { from: monthFrom, to: monthTo, types: ['payout'] }
    case 'quarterly-forecast':
      return { from: qFrom, to: qTo }
    case 'yearly-review':
      return { from: fyFrom, to: fyTo }
    default:
      return null
  }
}

export default function QuickSendPanel({
  pending,
  onSend,
  salespersons,
  sending = false,
}: {
  pending: EnrichedItem[]
  onSend: (ids: string[], grouping: 'single' | 'per-person', recipientOverrides: Record<string, boolean>) => void
  salespersons: { id: string; name: string }[]
  sending?: boolean
}) {
  const [datePreset, setDatePreset] = useState<PresetKey>('none')
  const [selectedTypes, setSelectedTypes] = useState<Set<NotificationType>>(new Set())
  const [selectedPersons, setSelectedPersons] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<{
    items: EnrichedItem[]
    totals: { gross: number; tds: number; net: number }
    byPerson: Record<string, { gross: number; tds: number; net: number }>
  } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [batches, setBatches] = useState<BatchedEmail[]>([])
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [grouping, setGrouping] = useState<'single' | 'per-person'>('single')
  const [customOpen, setCustomOpen] = useState(false)
  const [customDays, setCustomDays] = useState(7)
  const [confirmRecipientOverrides, setConfirmRecipientOverrides] = useState<Record<string, boolean>>({})

  function toggleType(type: NotificationType) {
    const next = new Set(selectedTypes)
    if (next.has(type)) next.delete(type)
    else next.add(type)
    setSelectedTypes(next)
  }

  function togglePerson(personId: string) {
    const next = new Set(selectedPersons)
    if (next.has(personId)) next.delete(personId)
    else next.add(personId)
    setSelectedPersons(next)
  }

  function applyFilters() {
    const filtered = pending.filter(item => {
      // Date filter
      if (datePreset !== 'none') {
        if (datePreset === 'custom' && customOpen) {
          const now = new Date()
          const to = new Date(Date.now() + customDays * 86400000).toISOString().split('T')[0]
          const from = now.toISOString().split('T')[0]
          if (!item.due_date || item.due_date < from || item.due_date > to) return false
        } else {
          const window = getCalendarWindow(datePreset)
          if (!window) return false
          if (!item.due_date || item.due_date < window.from || item.due_date > window.to) return false
        }
      }

      // Type filter (empty set = all types)
      if (selectedTypes.size > 0 && !selectedTypes.has(item.notification_type)) return false

      // Person filter (empty set = all persons)
      if (selectedPersons.size > 0) {
        const spId = item.agreement?.salesperson?.id
        if (!spId || !selectedPersons.has(spId)) return false
      }

      return true
    })

    setGrouping(filtered.some(i => i.agreement?.salesperson?.name) ? 'per-person' : 'single')
    computeTotals(filtered)
  }

  function handlePreset(key: PresetKey) {
    if (key === 'custom') {
      setCustomOpen(o => !o)
      return
    }
    setDatePreset(key)
  }

  function clearFilters() {
    setDatePreset('none')
    setSelectedTypes(new Set())
    setSelectedPersons(new Set())
    setResults(null)
  }

  function computeTotals(items: EnrichedItem[]) {
    const totals = { gross: 0, tds: 0, net: 0 }
    const byPerson: Record<string, { gross: number; tds: number; net: number }> = {}

    for (const item of items) {
      if (item.notification_type === 'payout' || item.notification_type === 'tds_filing') {
        const g = item.gross_interest ?? 0
        const t = item.tds_amount ?? 0
        const n = item.net_interest ?? 0
        totals.gross += g
        totals.tds += t
        totals.net += n

        const key = item.agreement?.salesperson?.name ?? 'Unassigned'
        if (!byPerson[key]) byPerson[key] = { gross: 0, tds: 0, net: 0 }
        byPerson[key].gross += g
        byPerson[key].tds += t
        byPerson[key].net += n
      }
    }

    setResults({ items, totals, byPerson })
  }

  function handleApplyCustom() {
    setCustomOpen(false)
    setDatePreset('custom')
  }

  async function handleReviewSend() {
    if (!results || results.items.length === 0) return

    setPreviewLoading(true)
    setShowConfirmModal(true)
    setConfirmError(null)

    try {
      const res = await fetch('/api/notifications/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: results.items.map(i => i.id), grouping }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to load preview')
      }
      const data = await res.json()
      setBatches(data.batches ?? [])

      // Initialize recipient overrides from default checked state
      const overrides: Record<string, boolean> = {}
      for (const batch of data.batches ?? []) {
        for (const r of batch.recipients) {
          if (!overrides.hasOwnProperty(r.key)) {
            overrides[r.key] = r.checked
          }
        }
      }
      setConfirmRecipientOverrides(overrides)
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setPreviewLoading(false)
    }
  }

  function handleSendConfirmed() {
    setConfirmError(null)
    onSend(results!.items.map(i => i.id), grouping, confirmRecipientOverrides)
    clearFilters()
    setBatches([])
  }

  function toggleRecipient(key: string) {
    setConfirmRecipientOverrides(prev => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  // Get the active recipients count for the button text
  const activeRecipients = useMemo(() => {
    return new Set(
      batches.flatMap(b => b.recipients.filter(r => confirmRecipientOverrides[r.key]).map(r => r.key))
    ).size
  }, [batches, confirmRecipientOverrides])

  const activeFilterCount = [
    datePreset !== 'none',
    selectedTypes.size > 0,
    selectedPersons.size > 0,
  ].filter(Boolean).length

  const dateRangeText = datePreset !== 'none' && datePreset !== 'custom'
    ? (() => {
        const w = getCalendarWindow(datePreset)
        if (!w) return ''
        const fmt = (d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        return `${fmt(w.from)} – ${fmt(w.to)}, ${new Date(w.to).getFullYear()}`
      })()
    : null

  return (
    <>
      {/* Cascading Filters */}
      <div className="space-y-3">
        {/* Row 1: Date range */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide font-medium mr-1">When</span>
          {DATE_PRESETS.map(p => (
            <button
              key={p.key}
              onClick={() => handlePreset(p.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                datePreset === p.key
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Custom date expand */}
        {customOpen && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500 uppercase tracking-wide">Days ahead</label>
                <select
                  value={customDays}
                  onChange={e => setCustomDays(Number(e.target.value))}
                  className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 w-full"
                >
                  {[7, 14, 21, 30, 60, 90].map(d => (
                    <option key={d} value={d}>{d} days</option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={handleApplyCustom}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Apply
            </button>
          </div>
        )}

        {/* Row 2: Type filter */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide font-medium mr-1">Type</span>
          {TYPE_FILTERS.map(tf => {
            const isActive = selectedTypes.has(tf.key)
            return (
              <button
                key={tf.key}
                onClick={() => toggleType(tf.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                  isActive ? tf.color : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              >
                {tf.label}
              </button>
            )
          })}
        </div>

        {/* Row 3: Salesperson filter */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-[10px] text-slate-500 uppercase tracking-wide font-medium mr-1">Who</span>
          {salespersons.map(sp => {
            const isActive = selectedPersons.has(sp.id)
            return (
              <button
                key={sp.id}
                onClick={() => togglePerson(sp.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border ${
                  isActive
                    ? 'bg-violet-600 border-violet-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {sp.name}
              </button>
            )
          })}
        </div>

        {/* Filter summary + Apply/Clear */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} active
              </span>
              {dateRangeText && (
                <span className="text-xs text-indigo-400 font-medium">· {dateRangeText}</span>
              )}
              {selectedTypes.size > 0 && (
                <span className="text-xs text-emerald-400 font-medium">
                  · {Array.from(selectedTypes).map(t => TYPE_LABELS[t]).join(', ')}
                </span>
              )}
              {selectedPersons.size > 0 && (
                <span className="text-xs text-violet-400 font-medium">
                  · {Array.from(selectedPersons).map(id => salespersons.find(s => s.id === id)?.name).join(', ')}
                </span>
              )}
            </div>
            <button
              onClick={applyFilters}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Apply
            </button>
            <button
              onClick={clearFilters}
              className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Results section */}
      {results && (
        <div className="mt-4 space-y-3">
          {/* Header with totals */}
          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h3 className="text-sm font-semibold text-slate-200">
                  {dateRangeText ?? 'Filtered'} — {results.items.length} item{results.items.length !== 1 ? 's' : ''}
                </h3>
                {results.totals.net > 0 && (
                  <div className="flex gap-4 mt-1 text-xs text-slate-400">
                    <span>Gross: <strong className="text-slate-200">{fmtCurrency(results.totals.gross)}</strong></span>
                    <span>TDS: <strong className="text-slate-200">{fmtCurrency(results.totals.tds)}</strong></span>
                    <span>Net: <strong className="text-slate-200">{fmtCurrency(results.totals.net)}</strong></span>
                  </div>
                )}
              </div>

              {/* By person breakdown */}
              {Object.keys(results.byPerson).length > 1 && (
                <div className="text-[11px] text-slate-500 space-y-0.5">
                  {Object.entries(results.byPerson).map(([name, amounts]) => (
                    <div key={name}>{name}: {fmtCurrency(amounts.net)} net</div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Items table */}
          <div className="overflow-x-auto border border-slate-700 rounded-xl">
            <table className="min-w-full text-sm text-slate-300">
              <thead>
                <tr className="border-b border-slate-700 text-[10px] text-slate-400 uppercase tracking-wide">
                  <th className="pb-2 px-4 text-left">Investor</th>
                  <th className="pb-2 px-4 text-left">Ref</th>
                  <th className="pb-2 px-4 text-left">Type</th>
                  <th className="pb-2 px-4 text-left whitespace-nowrap">Due</th>
                  <th className="pb-2 px-4 text-right">Net</th>
                  <th className="pb-2 px-4 text-left">Salesperson</th>
                </tr>
              </thead>
              <tbody>
                {results.items.map(item => (
                  <tr key={item.id} className="border-b border-slate-700/40 hover:bg-slate-800/20">
                    <td className="py-2.5 px-4 font-medium text-slate-100">
                      {item.agreement?.investor_name ?? <span className="italic text-slate-500">—</span>}
                    </td>
                    <td className="py-2.5 px-4 font-mono text-[10px] text-slate-500">
                      {item.agreement?.reference_id ?? '—'}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-400 capitalize">
                      {TYPE_LABELS[item.notification_type] ?? item.notification_type}
                    </td>
                    <td className="py-2.5 px-4 whitespace-nowrap text-xs">
                      {fmtDate(item.due_date)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-slate-200">
                      {item.notification_type === 'payout' || item.notification_type === 'tds_filing'
                        ? fmtCurrency(item.net_interest ?? 0)
                        : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-xs text-slate-400">
                      {item.agreement?.salesperson?.name ?? <span className="italic">Unassigned</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Grouping toggle */}
          {results.items.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="text-xs text-slate-400">Send as:</label>
              <button
                onClick={() => setGrouping('single')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors border ${
                  grouping === 'single'
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              >
                1 batch email
              </button>
              <button
                onClick={() => setGrouping('per-person')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors border ${
                  grouping === 'per-person'
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Per salesperson
              </button>
            </div>
          )}

          {/* Review & Send button */}
          {results.items.length > 0 && (
            <button
              onClick={handleReviewSend}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              Review & Send
            </button>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto py-8">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-100">Review Before Sending</h2>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-slate-200 text-lg"
              >
                ✕
              </button>
            </div>

            {/* Recipient checkboxes */}
            <div className="px-6 py-3 border-b border-slate-700/40">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-2">Recipients (check/uncheck anyone)</p>
              <div className="flex flex-wrap gap-2">
                {batches.length > 0 && batches[0].recipients.map(r => (
                  <label
                    key={r.key}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                      confirmRecipientOverrides[r.key]
                        ? 'bg-indigo-900/40 border-indigo-700 text-indigo-300'
                        : 'bg-slate-800 border-slate-700 text-slate-500'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={!!confirmRecipientOverrides[r.key]}
                      onChange={() => toggleRecipient(r.key)}
                      className="accent-indigo-500"
                    />
                    {r.name}
                    <span className="text-[10px] text-slate-600">({r.role})</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Email previews */}
            <div className="px-6 py-4 max-h-[50vh] overflow-y-auto space-y-4">
              {previewLoading ? (
                <div className="text-center text-slate-500 text-sm py-8">Loading preview…</div>
              ) : confirmError ? (
                <div className="text-center text-red-400 text-sm py-4">{confirmError}</div>
              ) : batches.length === 0 ? (
                <div className="text-center text-slate-500 text-sm py-8">No items to send</div>
              ) : (
                batches.map((batch, idx) => {
                  const visibleRecipients = batch.recipients.filter(r => confirmRecipientOverrides[r.key])
                  return (
                    <div key={batch.groupKey} className="border border-slate-700 rounded-xl overflow-hidden">
                      <div className="bg-slate-800/60 px-4 py-2.5 flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <span className="text-sm font-semibold text-slate-200">
                            {batches.length > 1 ? `Email ${idx + 1}: ${batch.groupLabel}` : batch.groupLabel}
                          </span>
                          <span className="text-xs text-slate-500 ml-2">
                            {batch.items.length} item{batch.items.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">
                          To: {visibleRecipients.length > 0 ? visibleRecipients.map(r => r.name).join(', ') : 'None selected'}
                        </div>
                      </div>

                      <div className="px-4 py-2 border-b border-slate-700/40">
                        <span className="text-[10px] text-slate-500 font-medium mr-2">Subject:</span>
                        <span className="text-xs text-slate-300">{batch.subject}</span>
                      </div>

                      {/* Amount summary if applicable */}
                      {batch.amounts.net > 0 && (
                        <div className="px-4 py-2 border-b border-slate-700/40 flex gap-4 text-xs">
                          <span className="text-slate-500">Gross: <strong className="text-slate-300">{fmtCurrency(batch.amounts.gross)}</strong></span>
                          <span className="text-slate-500">TDS: <strong className="text-slate-300">{fmtCurrency(batch.amounts.tds)}</strong></span>
                          <span className="text-slate-500">Net: <strong className="text-slate-200">{fmtCurrency(batch.amounts.net)}</strong></span>
                        </div>
                      )}

                      {/* Items table */}
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-slate-300">
                          <thead>
                            <tr className="border-b border-slate-700 text-[10px] text-slate-400 uppercase tracking-wide">
                              <th className="pb-2 px-4 text-left">Investor</th>
                              <th className="pb-2 px-4 text-left">Ref</th>
                              <th className="pb-2 px-4 text-left">Type</th>
                              <th className="pb-2 px-4 text-left">Due</th>
                              <th className="pb-2 px-4 text-right">Net</th>
                            </tr>
                          </thead>
                          <tbody>
                            {batch.items.map(item => (
                              <tr key={item.id} className="border-b border-slate-700/40 hover:bg-slate-800/20">
                                <td className="py-2 px-4 font-medium text-slate-100 text-xs">
                                  {item.agreement?.investor_name ?? '—'}
                                </td>
                                <td className="py-2 px-4 font-mono text-[10px] text-slate-500">
                                  {item.agreement?.reference_id ?? '—'}
                                </td>
                                <td className="py-2 px-4 text-[10px] text-slate-400 capitalize">
                                  {TYPE_LABELS[item.notification_type] ?? item.notification_type}
                                </td>
                                <td className="py-2 px-4 whitespace-nowrap text-[10px]">
                                  {fmtDate(item.due_date)}
                                </td>
                                <td className="py-2 px-4 text-right font-mono text-[10px] text-slate-200">
                                  {item.notification_type === 'payout' || item.notification_type === 'tds_filing'
                                    ? fmtCurrency(item.net_interest ?? 0)
                                    : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Body preview */}
                      <div className="px-4 py-3 border-t border-slate-700/40">
                        <span className="text-[10px] text-slate-500 font-medium block mb-1.5">Email body preview:</span>
                        <div
                          className="text-xs text-slate-300 bg-slate-800/40 rounded-lg p-3 max-h-40 overflow-y-auto"
                          dangerouslySetInnerHTML={{ __html: batch.body }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-between gap-4">
              <div className="text-xs text-slate-500">
                {batches.length} email{batches.length !== 1 ? 's' : ''} → {activeRecipients} recipient{activeRecipients !== 1 ? 's' : ''}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendConfirmed}
                  disabled={sending || activeRecipients === 0}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors"
                >
                  {sending ? 'Sending…' : `Confirm & Send ${batches.length} email${batches.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
