'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type CalendarEvent = {
  id: string
  date: string        // YYYY-MM-DD
  label: string
  type: 'payout_pending' | 'payout_overdue' | 'payout_paid' | 'maturity'
  agreementId: string
  isDraft: boolean
}

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const TYPE_COLORS: Record<CalendarEvent['type'], string> = {
  payout_pending: 'bg-amber-500 text-white',
  payout_overdue: 'bg-red-500 text-white',
  payout_paid: 'bg-green-500 text-white',
  maturity: 'bg-orange-500 text-white',
}

const LEGEND_ITEMS = [
  { type: 'payout_pending' as const, label: 'Payout due (pending/notified)', color: 'bg-amber-500' },
  { type: 'payout_overdue' as const, label: 'Payout overdue', color: 'bg-red-500' },
  { type: 'payout_paid' as const, label: 'Payout paid', color: 'bg-green-500' },
  { type: 'maturity' as const, label: 'Maturity date', color: 'bg-orange-500' },
]

function truncate(str: string, max: number) {
  return str.length > max ? str.slice(0, max) + '…' : str
}

/** Returns an array of day cells for the calendar grid.
 *  Each cell is either null (padding) or a Date object. */
function buildCalendarDays(year: number, month: number): (Date | null)[] {
  // month is 0-indexed
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)

  // Day of week: 0=Sun…6=Sat. We want Mon=0…Sun=6
  const startDow = (firstDay.getDay() + 6) % 7 // shift so Mon=0
  const totalDays = lastDay.getDate()

  const cells: (Date | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= totalDays; d++) cells.push(new Date(year, month, d))

  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function toYMD(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

interface CalendarGridProps {
  events: CalendarEvent[]
  initialYear: number
  initialMonth: number // 0-indexed
}

export default function CalendarGrid({ events, initialYear, initialMonth }: CalendarGridProps) {
  const router = useRouter()
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)

  const today = toYMD(new Date())

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const cells = buildCalendarDays(year, month)

  // Build a lookup: date string -> events[]
  const eventsByDate = new Map<string, CalendarEvent[]>()
  for (const ev of events) {
    const existing = eventsByDate.get(ev.date) ?? []
    existing.push(ev)
    eventsByDate.set(ev.date, existing)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <h1 className="text-xl font-semibold text-slate-100">Calendar</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={prevMonth}
            className="px-3 py-1.5 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white text-sm font-medium transition-colors"
          >
            ← Prev
          </button>
          <span className="text-slate-100 font-semibold text-base min-w-[140px] text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="px-3 py-1.5 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white text-sm font-medium transition-colors"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto p-6">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS_OF_WEEK.map(d => (
            <div key={d} className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wider py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        <div className="grid grid-cols-7 border-l border-t border-slate-800">
          {cells.map((date, idx) => {
            if (!date) {
              return (
                <div
                  key={`pad-${idx}`}
                  className="border-r border-b border-slate-800 bg-slate-950 min-h-[100px]"
                />
              )
            }

            const ymd = toYMD(date)
            const isToday = ymd === today
            const dayEvents = eventsByDate.get(ymd) ?? []
            const visibleEvents = dayEvents.slice(0, 3)
            const overflow = dayEvents.length - 3

            return (
              <div
                key={ymd}
                className="border-r border-b border-slate-800 bg-slate-900 min-h-[100px] p-1.5 flex flex-col gap-1"
              >
                {/* Day number */}
                <div className="flex items-center justify-end">
                  <span
                    className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400'
                    }`}
                  >
                    {date.getDate()}
                  </span>
                </div>

                {/* Event chips */}
                <div className="flex flex-col gap-0.5">
                  {visibleEvents.map(ev => (
                    <button
                      key={ev.id}
                      onClick={() => router.push(`/agreements/${ev.agreementId}`)}
                      title={ev.label}
                      className={`
                        px-1.5 py-0.5 rounded text-xs font-medium truncate max-w-full text-left
                        ${TYPE_COLORS[ev.type]}
                        ${ev.isDraft ? 'border border-dashed border-white/40' : ''}
                        hover:opacity-80 transition-opacity
                      `}
                    >
                      {truncate(ev.label, 15)}
                    </button>
                  ))}

                  {overflow > 0 && (
                    <span className="text-xs text-slate-500 px-1.5">
                      +{overflow} more
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-6 py-3 border-t border-slate-800 flex items-center gap-6 flex-wrap">
        {LEGEND_ITEMS.map(item => (
          <div key={item.type} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-sm ${item.color}`} />
            <span className="text-xs text-slate-400">{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-amber-500 border border-dashed border-white/60" />
          <span className="text-xs text-slate-400">Draft (dashed border)</span>
        </div>
      </div>
    </div>
  )
}
