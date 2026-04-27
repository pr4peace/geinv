'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, dateFnsLocalizer, Views, type ToolbarProps, type View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay } from 'date-fns'
import { enUS } from 'date-fns/locale'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import 'react-big-calendar/lib/css/react-big-calendar.css'

export type CalendarEvent = {
  id: string
  date: string        // YYYY-MM-DD
  label: string
  type: 'payout_pending' | 'payout_overdue' | 'payout_paid' | 'maturity' | 'reminder'
  agreementId: string
  isDraft: boolean
}

type RBCEvent = {
  id: string
  title: string
  start: Date
  end: Date
  allDay: boolean
  resource: CalendarEvent
}

interface CalendarGridProps {
  events: CalendarEvent[]
  initialYear: number
  initialMonth: number // 0-indexed
}

const locales = {
  'en-US': enUS,
}

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
})

const TYPE_COLORS: Record<CalendarEvent['type'], string> = {
  payout_pending: '#f59e0b', // amber-500
  payout_overdue: '#ef4444', // red-500
  payout_paid: '#10b981',    // green-500
  maturity: '#f97316',       // orange-500
  reminder: '#3b82f6',       // blue-500
}

const LEGEND_ITEMS = [
  { type: 'payout_pending' as const, label: 'Payout due (pending/notified)', color: 'bg-amber-500' },
  { type: 'payout_overdue' as const, label: 'Payout overdue', color: 'bg-red-500' },
  { type: 'payout_paid' as const, label: 'Payout paid', color: 'bg-green-500' },
  { type: 'maturity' as const, label: 'Maturity date', color: 'bg-orange-500' },
  { type: 'reminder' as const, label: 'Reminder scheduled', color: 'bg-blue-500' },
]

export default function CalendarGrid({ events, initialYear, initialMonth }: CalendarGridProps) {
  const router = useRouter()
  const [date, setDate] = useState(new Date(initialYear, initialMonth, 1))
  const [view, setView] = useState<View>(Views.MONTH)

  const rbcEvents = useMemo(() => {
    return events.map(ev => {
      const start = new Date(ev.date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(ev.date)
      end.setHours(23, 59, 59, 999)
      
      return {
        id: ev.id,
        title: ev.label,
        start,
        end,
        allDay: true,
        resource: ev,
      }
    })
  }, [events])

  const eventPropGetter = (event: RBCEvent) => {
    const ev = event.resource
    return {
      style: {
        backgroundColor: TYPE_COLORS[ev.type],
        border: ev.isDraft ? '1px dashed rgba(255,255,255,0.6)' : 'none',
        fontSize: '0.75rem',
        padding: '1px 4px',
        borderRadius: '4px',
      }
    }
  }

  const handleSelectEvent = (event: RBCEvent) => {
    const ev = event.resource
    router.push(`/agreements/${ev.agreementId}`)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Legend */}
      <div className="px-6 py-3 border-b border-slate-800 flex items-center gap-6 flex-wrap bg-slate-900/50">
        {LEGEND_ITEMS.map(item => (
          <div key={item.type} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-sm ${item.color}`} />
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-sm bg-amber-500 border border-dashed border-white/60" />
          <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">Draft (dashed)</span>
        </div>
      </div>

      <div className="flex-1 p-6 rbc-dark-theme">
        <style jsx global>{`
          .rbc-dark-theme .rbc-calendar {
            background-color: transparent;
            color: #f1f5f9;
            font-family: inherit;
          }
          .rbc-dark-theme .rbc-header {
            border-bottom: 1px solid #1e293b;
            padding: 12px 0;
            color: #64748b;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .rbc-dark-theme .rbc-month-view, 
          .rbc-dark-theme .rbc-time-view,
          .rbc-dark-theme .rbc-agenda-view {
            border: 1px solid #1e293b;
            border-radius: 12px;
            background-color: #0f172a;
          }
          .rbc-dark-theme .rbc-day-bg + .rbc-day-bg,
          .rbc-dark-theme .rbc-month-row + .rbc-month-row {
            border-left: 1px solid #1e293b;
            border-top: 1px solid #1e293b;
          }
          .rbc-dark-theme .rbc-off-range-bg {
            background-color: #020617;
          }
          .rbc-dark-theme .rbc-today {
            background-color: rgba(79, 70, 229, 0.1);
          }
          .rbc-dark-theme .rbc-toolbar {
            margin-bottom: 20px;
          }
          .rbc-dark-theme .rbc-toolbar button {
            color: #94a3b8;
            border: 1px solid #334155;
            background-color: #1e293b;
            font-size: 0.875rem;
            padding: 6px 12px;
            border-radius: 6px;
            transition: all 0.2s;
          }
          .rbc-dark-theme .rbc-toolbar button:hover {
            background-color: #334155;
            color: white;
          }
          .rbc-dark-theme .rbc-toolbar button.rbc-active {
            background-color: #4f46e5;
            color: white;
            border-color: #4f46e5;
            box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);
          }
          .rbc-dark-theme .rbc-event {
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
          }
          .rbc-dark-theme .rbc-show-more {
            color: #6366f1;
            font-weight: 600;
            font-size: 0.75rem;
            background: transparent;
          }
          .rbc-dark-theme .rbc-agenda-view table.rbc-agenda-table {
            border: none;
          }
          .rbc-dark-theme .rbc-agenda-view table.rbc-agenda-table thead > tr > th {
            border-bottom: 2px solid #1e293b;
            color: #94a3b8;
          }
          .rbc-dark-theme .rbc-agenda-view .rbc-agenda-date-cell {
            color: #f1f5f9;
            font-weight: 600;
          }
          .rbc-dark-theme .rbc-agenda-view .rbc-agenda-event-cell {
            color: #94a3b8;
          }
        `}</style>
        
        <Calendar
          localizer={localizer}
          events={rbcEvents}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '100%' }}
          views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
          view={view}
          onView={(v) => setView(v)}
          date={date}
          onNavigate={(d) => setDate(d)}
          eventPropGetter={eventPropGetter}
          onSelectEvent={handleSelectEvent}
          popup
          components={{
            toolbar: CustomToolbar,
          }}
        />
      </div>
    </div>
  )
}

function CustomToolbar(toolbar: ToolbarProps<RBCEvent, object>) {
  const goToBack = () => {
    toolbar.onNavigate('PREV')
  }

  const goToNext = () => {
    toolbar.onNavigate('NEXT')
  }

  const goToToday = () => {
    toolbar.onNavigate('TODAY')
  }

  const viewNamesGroup = [
    { view: Views.MONTH, label: 'Month' },
    { view: Views.WEEK, label: 'Week' },
    { view: Views.AGENDA, label: 'Agenda' },
  ]

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-2">
        <button
          onClick={goToBack}
          className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={goToToday}
          className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700 transition-all"
        >
          Today
        </button>
        <button
          onClick={goToNext}
          className="p-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <span className="text-lg font-bold text-white uppercase tracking-tight">
        {toolbar.label}
      </span>

      <div className="flex items-center bg-slate-900 border border-slate-800 p-1 rounded-xl">
        {viewNamesGroup.map((item) => (
          <button
            key={item.view}
            onClick={() => toolbar.onView(item.view)}
            className={`
              px-4 py-1.5 text-xs font-bold rounded-lg transition-all
              ${toolbar.view === item.view 
                ? 'bg-indigo-600 text-white shadow-lg' 
                : 'text-slate-400 hover:text-slate-200'
              }
            `}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
