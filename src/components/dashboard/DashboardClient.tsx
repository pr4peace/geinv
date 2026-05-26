'use client'

import { useState } from 'react'
import { 
  CheckCircle2, 
  Loader2, 
  Clock, 
  FileSignature,
  Activity as ActivityIcon,
} from 'lucide-react'
import { format } from 'date-fns'
import Link from 'next/link'
import { Dispatch, SetStateAction } from 'react'

interface PayoutWithAgreement {
  id: string
  agreement_id: string
  due_by: string
  gross_interest: number
  tds_amount: number
  net_interest: number
  status: string
  agreement: {
    id: string
    investor_name: string
    reference_id: string
    payout_frequency: string
  }
}

interface MaturingItem {
  id: string
  investor_name: string
  reference_id: string
  maturity_date: string
  principal_amount: number
  daysLeft: number
}

interface DocPendingItem {
  id: string
  investor_name: string
  reference_id: string
  doc_status: string
  doc_sent_to_client_date: string | null
  doc_return_reminder_days: number
  daysSince: number
}

interface ActivityItem {
  sent_at: string
  email_subject: string
  reminder_type: string
}

interface Props {
  overdue: PayoutWithAgreement[]
  thisWeek: PayoutWithAgreement[]
  laterThisMonth: PayoutWithAgreement[]
  maturingSoon: MaturingItem[]
  docsPending: DocPendingItem[]
  activity: ActivityItem[]
}

export default function DashboardClient({ 
  overdue, 
  thisWeek, 
  laterThisMonth, 
  maturingSoon, 
  docsPending, 
  activity 
}: Props) {
  // Simple local state for optimistic updates
  const [localOverdue, setLocalOverdue] = useState(overdue)
  const [localThisWeek, setLocalThisWeek] = useState(thisWeek)
  const [localLater, setLocalLater] = useState(laterThisMonth)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const handleNotify = async (
    payout: PayoutWithAgreement, 
    list: PayoutWithAgreement[], 
    setList: Dispatch<SetStateAction<PayoutWithAgreement[]>>
  ) => {
    setActionLoading(`notify-${payout.id}`)
    try {
      const res = await fetch(`/api/agreements/${payout.agreement_id}/payouts/${payout.id}/notify`, { method: 'POST' })
      if (res.ok) {
        setList(list.map(p => p.id === payout.id ? { ...p, status: 'notified' } : p))
      }
    } catch (err) {
      console.error('Notify failed:', err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleMarkPaid = async (
    payout: PayoutWithAgreement, 
    list: PayoutWithAgreement[], 
    setList: Dispatch<SetStateAction<PayoutWithAgreement[]>>
  ) => {
    setActionLoading(`paid-${payout.id}`)
    try {
      const res = await fetch(`/api/agreements/${payout.agreement_id}/payouts/${payout.id}/paid`, { method: 'POST' })
      if (res.ok) {
        // Move to paid state
        setList(list.map(p => p.id === payout.id ? { ...p, status: 'paid' } : p))
      }
    } catch (err) {
      console.error('Mark paid failed:', err)
    } finally {
      setActionLoading(null)
    }
  }

  // KPIs
  const openActionsCount = localOverdue.length + localThisWeek.length
  const netToDisburse = localOverdue.concat(localThisWeek).reduce((sum, p) => sum + p.net_interest, 0)
  const maturingAmount = maturingSoon.reduce((sum, m) => sum + m.principal_amount, 0)
  const docsPendingCount = docsPending.length

  return (
    <div className="p-8 max-w-[1400px] mx-auto space-y-10">
      {/* Row 1: KPI Tiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPITile 
          label="Open actions" 
          value={openActionsCount.toString()} 
          sub="across queues" 
        />
        <KPITile 
          label="Net to disburse" 
          value={`₹${(netToDisburse / 100000).toFixed(2)}L`} 
          sub="this week" 
        />
        <KPITile 
          label="Maturing in 90d" 
          value={`₹${(maturingAmount / 10000000).toFixed(2)}Cr`} 
          sub={`${maturingSoon.length} agreements`} 
        />
        <KPITile 
          label="Docs pending" 
          value={docsPendingCount.toString()} 
          sub="awaiting return" 
        />
      </div>

      {/* Row 2: Kanban Payout Lanes */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-fit">
        <Lane 
          title="Overdue" 
          items={localOverdue} 
          list={localOverdue}
          setList={setLocalOverdue}
          accentColor="text-earth-ochre" 
          laneColor="bg-rust-soft/30"
          actionLoading={actionLoading}
          onNotify={handleNotify}
          onMarkPaid={handleMarkPaid}
        />
        <Lane 
          title="This Week" 
          items={localThisWeek} 
          list={localThisWeek}
          setList={setLocalThisWeek}
          accentColor="text-earth-green-mid" 
          laneColor="bg-gain-soft/30"
          actionLoading={actionLoading}
          onNotify={handleNotify}
          onMarkPaid={handleMarkPaid}
        />
        <Lane 
          title="Later this month" 
          items={localLater} 
          list={localLater}
          setList={setLocalLater}
          accentColor="text-earth-green" 
          laneColor="bg-canvas/50"
          actionLoading={actionLoading}
          onNotify={handleNotify}
          onMarkPaid={handleMarkPaid}
        />
      </div>

      {/* Row 3: Bottom Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Maturing soon" icon={<Clock className="w-3.5 h-3.5" />}>
          <div className="space-y-3">
            {maturingSoon.map(m => (
              <div key={m.id} className="flex items-center justify-between group">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-ink-1 truncate">{m.investor_name}</p>
                  <p className="text-[11px] text-ink-4 font-mono">{m.reference_id} · {m.maturity_date}</p>
                </div>
                <div className="text-right flex-shrink-0 flex items-center gap-3">
                  <span className="text-[13px] font-bold num text-earth-brown">₹{(m.principal_amount / 100000).toFixed(1)}L</span>
                  <span className={`px-1.5 py-0.5 rounded-sm text-[10px] font-bold num ${m.daysLeft < 0 ? 'bg-rust-soft text-rust' : 'bg-clay-soft text-clay'}`}>
                    {m.daysLeft}d
                  </span>
                </div>
              </div>
            ))}
            {maturingSoon.length === 0 && <p className="text-xs italic text-ink-5 py-4">No agreements maturing soon.</p>}
          </div>
        </Panel>

        <Panel title="Docs pending" icon={<FileSignature className="w-3.5 h-3.5" />}>
          <div className="space-y-3">
            {docsPending.map(d => (
              <div key={d.id} className="flex items-center justify-between group">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-ink-1 truncate">{d.investor_name}</p>
                  <p className="text-[11px] text-ink-4">sent {d.doc_sent_to_client_date} · <span className="num text-[10px]">{d.reference_id}</span></p>
                </div>
                <span className={`px-1.5 py-0.5 rounded-sm text-[10px] font-bold num ${d.daysSince > d.doc_return_reminder_days ? 'bg-rust-soft text-rust' : 'bg-gain-soft text-gain'}`}>
                  {d.daysSince}d
                </span>
              </div>
            ))}
            {docsPending.length === 0 && <p className="text-xs italic text-ink-5 py-4">No documents awaiting return.</p>}
          </div>
        </Panel>

        <Panel title="Today's activity" icon={<ActivityIcon className="w-3.5 h-3.5" />}>
          <div className="space-y-3">
            {activity.map((a, i) => {
              let dotClass = 'bg-ink-5'
              if (a.email_subject.toLowerCase().includes('paid')) dotClass = 'bg-gain'
              if (a.reminder_type === 'batch_notification' || a.reminder_type === 'payout') dotClass = 'bg-ink-2'
              
              return (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${dotClass}`} />
                  <div className="min-w-0">
                    <p className="text-[12px] text-ink-2 leading-snug">{a.email_subject}</p>
                    <p className="text-[10px] text-ink-4 mt-0.5">{format(new Date(a.sent_at), 'HH:mm')}</p>
                  </div>
                </div>
              )
            })}
            {activity.length === 0 && <p className="text-xs italic text-ink-5 py-4">No activity logged today.</p>}
          </div>
        </Panel>
      </div>
    </div>
  )
}

function KPITile({ label, value, sub }: { label: string, value: string, sub: string }) {
  return (
    <div className="bg-surface border border-hairline p-5 rounded-sm shadow-sm hover:shadow-md transition-shadow">
      <p className="lbl mb-3">{label}</p>
      <p className="num text-2xl font-medium text-ink-1 leading-none">{value}</p>
      <p className="text-[11px] text-ink-4 mt-2 font-medium">{sub}</p>
    </div>
  )
}

function Lane({ 
  title, items, list, setList, accentColor, laneColor, actionLoading, onNotify, onMarkPaid 
}: { 
  title: string, 
  items: PayoutWithAgreement[], 
  list: PayoutWithAgreement[],
  setList: Dispatch<SetStateAction<PayoutWithAgreement[]>>,
  accentColor: string, 
  laneColor: string,
  actionLoading: string | null,
  onNotify: (payout: PayoutWithAgreement, list: PayoutWithAgreement[], setList: Dispatch<SetStateAction<PayoutWithAgreement[]>>) => Promise<void>,
  onMarkPaid: (payout: PayoutWithAgreement, list: PayoutWithAgreement[], setList: Dispatch<SetStateAction<PayoutWithAgreement[]>>) => Promise<void>
}) {
  const activeItems = items.filter(i => i.status !== 'paid')
  const last8 = activeItems.slice(0, 8).map(i => i.net_interest)
  const maxNet = Math.max(...last8, 1)
  const sparklineClass =
    accentColor === 'text-earth-ochre'
      ? 'bg-earth-ochre/40'
      : accentColor === 'text-earth-green-mid'
      ? 'bg-earth-green-mid/40'
      : 'bg-earth-green/40'

  return (
    <div className={`flex flex-col h-full min-h-[500px] ${laneColor} rounded-sm overflow-hidden border border-hairline/30`}>
      <div className="p-5 border-b border-hairline/30 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[17px] font-semibold text-ink-1 font-serif tracking-tight">{title}</h3>
            <span className={`text-[15px] font-bold num ${accentColor}`}>{activeItems.length}</span>
          </div>
          <p className="text-[11px] text-ink-4 font-medium mt-0.5">items needing action</p>
        </div>

        {/* Simple sparkline visualization */}
        <div className="flex items-end gap-0.5 h-6">
          {last8.map((val, idx) => (
            <div
              key={idx}
              className={`w-1 rounded-t-full ${sparklineClass}`}
              style={{ height: `${(val / maxNet) * 100}%` }}
            />
          ))}
        </div>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto custom-scrollbar flex-1">
        {activeItems.map(p => (
          <div key={p.id} className="bg-surface/80 rounded-sm p-4 border border-hairline shadow-sm hover:shadow transition-all group">
            <div className="flex items-start justify-between gap-4 mb-1">
              <Link href={`/agreements/${p.agreement_id}`} className="text-[13px] font-semibold text-ink-1 hover:text-forest transition-colors truncate">
                {p.agreement.investor_name}
              </Link>
              <span className="text-[13px] font-bold num text-ink-1">₹{p.net_interest.toLocaleString('en-IN')}</span>
            </div>
            
            <div className="flex items-center justify-between text-[11px] text-ink-4 mb-4">
              <span>{p.agreement.reference_id} · {p.agreement.payout_frequency}</span>
              <span className="num text-earth-ochre opacity-80">TDS: ₹{p.tds_amount.toLocaleString('en-IN')}</span>
            </div>

            {/* 3-step progress pills */}
            <div className="grid grid-cols-3 gap-1 mb-5">
              <div className="bg-forest-soft text-forest text-[9px] font-bold text-center py-1 rounded-sm tracking-wider">REMINDED</div>
              <div className={`${p.status === 'notified' ? 'bg-ink-1 text-paper' : 'bg-canvas text-ink-5'} text-[9px] font-bold text-center py-1 rounded-sm tracking-wider`}>NOTIFIED</div>
              <div className="bg-canvas text-ink-5 text-[9px] font-bold text-center py-1 rounded-sm tracking-wider">PAID</div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className={`text-[10px] font-bold tracking-tight ${title === 'Overdue' ? 'text-rust' : 'text-ink-4'}`}>
                DUE {p.due_by}
              </span>
              
              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => onNotify(p, list, setList)}
                  disabled={!!actionLoading}
                  className="h-7 px-3 bg-forest-soft text-forest text-[10px] font-bold rounded-sm hover:bg-forest hover:text-paper transition-all disabled:opacity-50"
                >
                  {actionLoading === `notify-${p.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : p.status === 'notified' ? 'RE-NOTIFY' : 'NOTIFY'}
                </button>
                <button 
                  onClick={() => onMarkPaid(p, list, setList)}
                  disabled={!!actionLoading}
                  className="h-7 px-3 bg-forest text-paper text-[10px] font-bold rounded-sm hover:bg-ink-1 transition-all disabled:opacity-50"
                >
                  {actionLoading === `paid-${p.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : 'MARK PAID'}
                </button>
              </div>
            </div>
          </div>
        ))}
        {activeItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 opacity-40">
            <CheckCircle2 className="w-8 h-8 text-gain" />
            <p className="text-xs font-medium text-ink-4">Lane cleared</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Panel({ title, icon, children }: { title: string, icon: React.ReactNode, children: React.ReactNode }) {
  return (
    <div className="bg-surface-2 border border-hairline/60 p-6 rounded-sm">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-6 h-6 rounded-full bg-paper border border-hairline flex items-center justify-center text-ink-3">
          {icon}
        </div>
        <h3 className="lbl font-bold">{title}</h3>
      </div>
      {children}
    </div>
  )
}
