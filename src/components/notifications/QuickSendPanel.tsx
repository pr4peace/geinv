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

export default function QuickSendPanel({
  pending,
  onSend,
  sending,
}: {
  pending: EnrichedItem[]
  onSend: (ids: string[]) => void
  sending: boolean
}) {
  const [open, setOpen] = useState(false)
  const [filterType, setFilterType] = useState<FilterType>('payout')
  const [timeframe, setTimeframe] = useState<Timeframe>(7)
  const [previewed, setPreviewed] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const todayStr = new Date().toISOString().split('T')[0]
  const cutoffStr = new Date(Date.now() + timeframe * 86400000).toISOString().split('T')[0]

  const matchedItems = useMemo(() => {
    const types = FILTER_TYPES[filterType]
    return pending.filter(item =>
      item.due_date != null &&
      item.due_date >= todayStr &&
      item.due_date <= cutoffStr &&
      types.includes(item.notification_type)
    )
  }, [pending, filterType, timeframe, todayStr, cutoffStr])

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

  function handlePreview() {
    const allIds = new Set(matchedItems.map(i => i.id))
    setSelected(allIds)
    setPreviewed(true)
  }

  function toggleAll() {
    if (selected.size === matchedItems.length && matchedItems.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(matchedItems.map(i => i.id)))
    }
  }

  function toggle(id: string) {
    setSelected(s => {
      const next = new Set(s)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function handleSend() {
    onSend(Array.from(selected))
    setPreviewed(false)
    setSelected(new Set())
  }

  function handleTypeChange(v: FilterType) {
    setFilterType(v)
    setPreviewed(false)
    setSelected(new Set())
  }

  function handleTimeframeChange(v: Timeframe) {
    setTimeframe(v)
    setPreviewed(false)
    setSelected(new Set())
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
          <span className="text-[10px] text-slate-500 font-mono uppercase tracking-wide">preset bulk send</span>
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

            <button
              onClick={handlePreview}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors"
            >
              Preview
            </button>
          </div>

          {/* Preview table */}
          {previewed && (
            <>
              {matchedItems.length === 0 ? (
                <p className="text-slate-500 text-sm italic py-4 text-center">
                  No {TYPE_OPTIONS.find(o => o.value === filterType)?.label.toLowerCase()} due in the next {timeframe} days.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm text-slate-300">
                    <thead>
                      <tr className="border-b border-slate-700 text-xs text-slate-400">
                        <th className="pb-2 pr-3 text-left w-8">
                          <input
                            type="checkbox"
                            checked={selected.size === matchedItems.length && matchedItems.length > 0}
                            onChange={toggleAll}
                            className="accent-indigo-500"
                          />
                        </th>
                        <th className="pb-2 pr-4 text-left">Investor</th>
                        <th className="pb-2 pr-4 text-left">Ref</th>
                        <th className="pb-2 pr-4 text-left whitespace-nowrap">Due</th>
                        <th className="pb-2 text-left">Salesperson</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchedItems.map(item => (
                        <tr key={item.id} className="border-b border-slate-700/40 hover:bg-slate-800/20">
                          <td className="py-2.5 pr-3">
                            <input
                              type="checkbox"
                              checked={selected.has(item.id)}
                              onChange={() => toggle(item.id)}
                              className="accent-indigo-500"
                            />
                          </td>
                          <td className="py-2.5 pr-4 font-medium text-slate-100">
                            {item.agreement?.investor_name ?? <span className="italic text-slate-500">—</span>}
                          </td>
                          <td className="py-2.5 pr-4 font-mono text-[10px] text-slate-500">
                            {item.agreement?.reference_id ?? '—'}
                          </td>
                          <td className="py-2.5 pr-4 whitespace-nowrap text-xs">
                            {fmtDate(item.due_date)}
                          </td>
                          <td className="py-2.5 text-xs text-slate-400">
                            {item.agreement?.salesperson?.name ?? <span className="italic">Unassigned</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Summary bar */}
              {matchedItems.length > 0 && (
                <div className="flex items-center justify-between bg-slate-800/60 rounded-xl px-4 py-3 gap-4 flex-wrap">
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-300 font-medium">
                      {selected.size} of {matchedItems.length} selected
                    </p>
                    {spSummaryParts.length > 0 && (
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
                    {sending ? 'Sending…' : `Send ${selected.size > 0 ? selected.size : ''} notification${selected.size !== 1 ? 's' : ''}`}
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
