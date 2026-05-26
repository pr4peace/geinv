'use client'

import { useState } from 'react'
import { Bell, ChevronDown, ChevronUp } from 'lucide-react'

type TimelineItem = {
  id: string
  type: string
  dueDate: string | null
  status: string
  sentAt: string | null
  subject: string | null
}

interface Props {
  items: TimelineItem[]
}

const typeLabelMap: Record<string, string> = {
  payout: 'Payout',
  maturity: 'Maturity',
  tds_filing: 'TDS Filing',
  doc_return: 'Doc Return',
  monthly_summary: 'Monthly Summary',
  quarterly_forecast: 'Quarterly Forecast',
  payout_monthly_summary: 'Monthly Summary',
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch { return dateStr }
}

const FILTERS = ['All', 'Pending', 'Sent', 'Overdue', 'Dismissed'] as const
type Filter = (typeof FILTERS)[number]

const filterColors: Record<Filter, { chip: string; active: string }> = {
  All: { chip: 'bg-surface-2 text-ink-4', active: 'bg-ink-1 text-paper border-ink-2' },
  Pending: { chip: 'bg-clay-soft text-clay', active: 'bg-clay-soft text-clay border-clay/30' },
  Sent: { chip: 'bg-gain-soft text-gain', active: 'bg-gain-soft text-gain border-gain/30' },
  Overdue: { chip: 'bg-rust-soft text-rust', active: 'bg-rust-soft text-rust border-rust/30' },
  Dismissed: { chip: 'bg-surface-2 text-ink-5', active: 'bg-surface-2 text-ink-4 border-hairline-strong' },
}

export default function Timeline({ items }: Props) {
  const [filter, setFilter] = useState<Filter>('All')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const todayStr = new Date().toISOString().split('T')[0]

  const enriched = items.map(item => {
    const isOverdue = item.status === 'pending' && item.dueDate && item.dueDate < todayStr
    return { ...item, isOverdue, effectiveDate: item.dueDate ?? item.sentAt ?? '' }
  })

  const filtered = enriched.filter(item => {
    if (filter === 'All') return true
    if (filter === 'Pending') return item.status === 'pending' && !item.isOverdue
    if (filter === 'Sent') return item.status === 'sent'
    if (filter === 'Overdue') return item.isOverdue === true
    if (filter === 'Dismissed') return item.status === 'dismissed'
    return true
  })

  const upcoming = filtered.filter(item => item.effectiveDate >= todayStr).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
  const past = filtered.filter(item => item.effectiveDate < todayStr).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))

  function renderRow(item: typeof enriched[number]) {
    const isExpanded = expandedId === item.id
    return (
      <div
        key={item.id}
        className={`rounded-sm border transition-colors cursor-pointer ${
          item.isOverdue
            ? 'bg-rust-soft/40 border-rust/20 hover:bg-rust-soft/60'
            : item.status === 'sent'
            ? 'bg-gain-soft/30 border-gain/20 hover:bg-gain-soft/50'
            : 'bg-surface border-hairline hover:bg-surface-2'
        }`}
        onClick={() => setExpandedId(isExpanded ? null : item.id)}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <Bell className={`w-3.5 h-3.5 flex-shrink-0 ${item.isOverdue ? 'text-rust' : 'text-ink-4'}`} />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-medium ${item.isOverdue ? 'text-rust' : 'text-ink-1'}`}>
                {typeLabelMap[item.type] ?? item.type}
              </span>
              <span className={`px-1.5 py-0.5 rounded-sm text-[10px] font-semibold capitalize ${
                item.status === 'sent' ? 'bg-gain-soft text-gain' :
                item.isOverdue ? 'bg-rust-soft text-rust' :
                item.status === 'dismissed' ? 'bg-surface-2 text-ink-4' :
                'bg-clay-soft text-clay'
              }`}>{item.isOverdue ? 'overdue' : item.status}</span>
            </div>
            <p className="text-xs text-ink-4 mt-0.5 truncate">{item.subject ?? '—'}</p>
          </div>

          <div className="text-right flex-shrink-0">
            <p className={`text-xs ${item.isOverdue ? 'text-rust font-medium' : 'text-ink-4'}`}>
              {fmtDate(item.dueDate ?? item.sentAt)}
              {item.isOverdue && <span className="ml-1 text-[10px] font-bold uppercase">(overdue)</span>}
            </p>
          </div>

          {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />}
        </div>

        {isExpanded && item.subject && (
          <div className="px-4 pb-3 pt-0 border-t border-hairline mt-0">
            <p className="text-xs text-ink-3 mt-2 whitespace-pre-wrap leading-relaxed">{item.subject}</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => {
          const count = f === 'All' ? enriched.length :
            f === 'Pending' ? enriched.filter(i => i.status === 'pending' && !i.isOverdue).length :
            f === 'Sent' ? enriched.filter(i => i.status === 'sent').length :
            f === 'Overdue' ? enriched.filter(i => i.isOverdue).length :
            enriched.filter(i => i.status === 'dismissed').length

          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                filter === f ? filterColors[f].active : `${filterColors[f].chip} border-transparent hover:border-hairline-strong`
              }`}
            >
              {f} <span className="ml-1 opacity-60">{count}</span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <p className="text-ink-4 text-sm italic text-center py-8">No notifications match this filter.</p>
      ) : (
        <>
          {upcoming.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-ink-4 uppercase tracking-widest">Upcoming ({upcoming.length})</p>
              {upcoming.map(renderRow)}
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold text-ink-4 uppercase tracking-widest">Past ({past.length})</p>
              {past.map(renderRow)}
            </div>
          )}
        </>
      )}
    </div>
  )
}
