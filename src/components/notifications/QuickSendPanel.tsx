'use client'

import { useState, useMemo } from 'react'
import type { NotificationQueue, NotificationType } from '@/types/database'

type EnrichedItem = NotificationQueue & {
  agreement?: {
    id: string
    investor_name: string
    reference_id: string
    salesperson?: { name: string } | null
  } | null
}

type FilterType = 'all' | 'payout' | 'maturity' | 'tds_filing'
type Timeframe = 7 | 14 | 31 | 90 | 180 | 365
type SendMode = 'batched' | 'per-salesperson'

const TYPE_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'payout', label: 'Payouts' },
  { value: 'maturity', label: 'Maturity' },
  { value: 'tds_filing', label: 'TDS Filing' },
]

const TIMEFRAME_OPTIONS: { value: Timeframe; label: string }[] = [
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 31, label: '31 days' },
  { value: 90, label: 'Quarter (90d)' },
  { value: 180, label: '6 months (180d)' },
  { value: 365, label: '1 year (365d)' },
]

const FILTER_TYPES: Record<FilterType, NotificationType[]> = {
  all: ['payout', 'maturity', 'tds_filing'],
  payout: ['payout'],
  maturity: ['maturity'],
  tds_filing: ['tds_filing'],
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

type BatchPreview = {
  groupKey: string
  groupLabel: string
  recipients: string[]
  subject: string
  body: string
  items: EnrichedItem[]
}

export default function QuickSendPanel({
  pending,
  onSend,
  sending,
}: {
  pending: EnrichedItem[]
  onSend: (ids: string[], mode: SendMode) => void
  sending: boolean
}) {
  const [open, setOpen] = useState(false)
  const [filterType, setFilterType] = useState<FilterType>('payout')
  const [timeframe, setTimeframe] = useState<Timeframe>(7)
  const [previewed, setPreviewed] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<SendMode>('batched')
  const [batches, setBatches] = useState<BatchPreview[]>([])
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  const cutoffStr = new Date(Date.now() + timeframe * 86400000).toISOString().split('T')[0]

  const matchedItems = useMemo(() => {
    const types = FILTER_TYPES[filterType]
    return pending.filter(item =>
      item.due_date != null &&
      item.due_date <= cutoffStr &&
      types.includes(item.notification_type)
    )
  }, [pending, filterType, cutoffStr])

  const selectedItems = matchedItems.filter(item => selected.has(item.id))

  // Salesperson breakdown from selected items
  const spBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    let unassigned = 0
    for (const item of selectedItems) {
      const name = item.agreement?.salesperson?.name
      if (name) {
        counts[name] = (counts[name] ?? 0) + 1
      } else {
        unassigned++
      }
    }
    return { counts, unassigned }
  }, [selectedItems])

  async function handlePreview() {
    const allIds = matchedItems.map(i => i.id)
    setSelected(new Set(allIds))

    if (allIds.length === 0) {
      setPreviewed(true)
      setBatches([])
      return
    }

    setPreviewLoading(true)
    setPreviewError(null)
    try {
      const res = await fetch('/api/notifications/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: allIds, mode }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Failed to load preview')
      }
      const data = await res.json()
      setBatches(data.batches ?? [])
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setPreviewLoading(false)
    }
    setPreviewed(true)
  }

  function handleSend() {
    onSend(Array.from(selected), mode)
    setPreviewed(false)
    setBatches([])
    setSelected(new Set())
  }

  function handleTypeChange(v: FilterType) {
    setFilterType(v)
    setPreviewed(false)
    setBatches([])
    setSelected(new Set())
  }

  function handleTimeframeChange(v: Timeframe) {
    setTimeframe(v)
    setPreviewed(false)
    setBatches([])
    setSelected(new Set())
  }

  function handleModeChange(v: SendMode) {
    setMode(v)
    if (previewed && selected.size > 0) {
      // Re-fetch preview with new mode
      handlePreview()
    }
  }

  const spSummaryParts = [
    ...Object.entries(spBreakdown.counts).map(([name, count]) => `${name}: ${count}`),
    ...(spBreakdown.unassigned > 0 ? [`Unassigned: ${spBreakdown.unassigned}`] : []),
  ]

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header toggle */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-slate-800/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-200">Quick Send</span>
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wide">batch email preview</span>
        </div>
        <span className="text-slate-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-slate-800">
          {/* Configure row */}
          <div className="flex items-center gap-3 pt-4 flex-wrap">
            <select
              value={filterType}
              onChange={e => handleTypeChange(e.target.value as FilterType)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <select
              value={timeframe}
              onChange={e => handleTimeframeChange(Number(e.target.value) as Timeframe)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {TIMEFRAME_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>

            <select
              value={mode}
              onChange={e => handleModeChange(e.target.value as SendMode)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="batched">Batched (1 email)</option>
              <option value="per-salesperson">Per Salesperson</option>
            </select>

            <button
              onClick={handlePreview}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
              Preview
            </button>
          </div>

          {/* Email previews */}
          {previewed && (
            <>
              {matchedItems.length === 0 ? (
                <p className="text-slate-500 text-sm italic py-4 text-center">
                  No {TYPE_OPTIONS.find(o => o.value === filterType)?.label.toLowerCase()} due in the next {timeframe} days.
                </p>
              ) : previewLoading ? (
                <div className="py-8 text-center text-slate-500 text-sm">Loading preview…</div>
              ) : previewError ? (
                <div className="py-4 text-center text-red-400 text-sm">{previewError}</div>
              ) : batches.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-sm">No items selected</div>
              ) : (
                <div className="space-y-4">
                  {batches.map((batch, idx) => (
                    <div key={batch.groupKey} className="border border-slate-700 rounded-xl overflow-hidden">
                      {/* Batch header */}
                      <div className="bg-slate-800/60 px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <span className="text-sm font-semibold text-slate-200">
                            {batches.length > 1 ? `Email ${idx + 1}: ${batch.groupLabel}` : batch.groupLabel}
                          </span>
                          <span className="text-xs text-slate-500 ml-2">
                            {batch.items.length} item{batch.items.length !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400">
                          To: {batch.recipients.join(', ')}
                        </div>
                      </div>

                      {/* Subject */}
                      <div className="px-4 py-2 border-b border-slate-700/40">
                        <span className="text-xs text-slate-500 font-medium mr-2">Subject:</span>
                        <span className="text-sm text-slate-200">{batch.subject}</span>
                      </div>

                      {/* Items table */}
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-slate-300">
                          <thead>
                            <tr className="border-b border-slate-700 text-xs text-slate-400">
                              <th className="pb-2 px-4 text-left">Investor</th>
                              <th className="pb-2 px-4 text-left">Ref</th>
                              <th className="pb-2 px-4 text-left">Type</th>
                              <th className="pb-2 px-4 text-left whitespace-nowrap">Due</th>
                              <th className="pb-2 px-4 text-left">Salesperson</th>
                            </tr>
                          </thead>
                          <tbody>
                            {batch.items.map(item => (
                              <tr key={item.id} className="border-b border-slate-700/40 hover:bg-slate-800/20">
                                <td className="py-2.5 px-4 font-medium text-slate-100">
                                  {item.agreement?.investor_name ?? <span className="italic text-slate-500">—</span>}
                                </td>
                                <td className="py-2.5 px-4 font-mono text-[10px] text-slate-500">
                                  {item.agreement?.reference_id ?? '—'}
                                </td>
                                <td className="py-2.5 px-4 text-xs text-slate-400 capitalize">
                                  {item.notification_type.replace('_', ' ')}
                                </td>
                                <td className="py-2.5 px-4 whitespace-nowrap text-xs">
                                  {fmtDate(item.due_date)}
                                </td>
                                <td className="py-2.5 px-4 text-xs text-slate-400">
                                  {item.agreement?.salesperson?.name ?? <span className="italic">Unassigned</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Body preview */}
                      <div className="px-4 py-3 border-t border-slate-700/40">
                        <span className="text-xs text-slate-500 font-medium block mb-2">Email body preview:</span>
                        <div
                          className="text-sm text-slate-300 bg-slate-800/40 rounded-lg p-3 max-h-48 overflow-y-auto"
                          dangerouslySetInnerHTML={{ __html: batch.body }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Summary bar */}
              {matchedItems.length > 0 && !previewLoading && !previewError && (
                <div className="flex items-center justify-between bg-slate-800/60 rounded-xl px-4 py-3 gap-4 flex-wrap">
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-300 font-medium">
                      {selected.size} items → {batches.length} email{batches.length !== 1 ? 's' : ''} ({mode === 'batched' ? 'single batch' : 'per salesperson'})
                    </p>
                    {spSummaryParts.length > 0 && mode === 'per-salesperson' && (
                      <p className="text-[11px] text-slate-500">
                        {spSummaryParts.join(' · ')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleSend}
                    disabled={selected.size === 0 || sending}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors whitespace-nowrap"
                  >
                    {sending ? 'Sending…' : `Send ${batches.length} email${batches.length !== 1 ? 's' : ''}`}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
