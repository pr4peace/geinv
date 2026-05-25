'use client'

import { useState } from 'react'
import { Bell, Mail, AlertCircle, CheckCircle2, Loader2, Clock, History } from 'lucide-react'

interface PayoutItem {
  id: string
  investor_name: string
  reference_id: string
  due_by: string
  gross_interest: number
  tds_amount: number
  net_interest: number
  is_overdue?: boolean
}

interface TdsItem {
  id: string
  investor_name: string
  reference_id: string
  due_by: string
  tds_amount: number
  is_overdue?: boolean
}

interface MaturityItem {
  id: string
  investor_name: string
  reference_id: string
  maturity_date: string
  principal_amount: number
  is_overdue?: boolean
}

interface HistoryItem {
  id: string
  reminder_type: string
  sent_at: string
  email_subject: string
  email_to: string[]
}

interface Props {
  payouts: PayoutItem[]
  tdsFilings: TdsItem[]
  maturities: MaturityItem[]
  history: HistoryItem[]
}

type Tab = 'queue' | 'history'

function OverdueBadge() {
  return (
    <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 text-[9px] font-bold uppercase tracking-wider border border-red-800/50">
      Overdue
    </span>
  )
}

function useSection<T extends { id: string }>(items: T[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<{ success?: boolean; warned?: boolean; error?: string } | null>(null)

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))
    )
  }

  async function send(type: 'payouts' | 'maturities' | 'tds', ids: string[]) {
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type, ids }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult({ success: true, warned: data.warned })
        setSelected(new Set())
      } else {
        setResult({ error: data.error || 'Failed to send' })
      }
    } catch {
      setResult({ error: 'Network error' })
    } finally {
      setSending(false)
    }
  }

  return { selected, toggle, toggleAll, sending, result, send }
}

function SectionFeedback({ result }: { result: { success?: boolean; warned?: boolean; error?: string } | null }) {
  if (!result) return null
  if (result.error) {
    return (
      <div className="mt-3 flex items-center gap-2 text-red-400 text-sm bg-red-900/10 border border-red-900/20 rounded-xl px-4 py-3">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        {result.error}
      </div>
    )
  }
  return (
    <div className="mt-3 flex items-center gap-2 text-emerald-400 text-sm bg-emerald-900/10 border border-emerald-800/20 rounded-xl px-4 py-3">
      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
      Email sent to Valli.{result.warned ? ' Note: some items were notified within the last 7 days.' : ''}
    </div>
  )
}

export default function NotificationsClient({ payouts, tdsFilings, maturities, history }: Props) {
  const [tab, setTab] = useState<Tab>('queue')

  const payoutSection = useSection(payouts)
  const tdsSection = useSection(tdsFilings)
  const maturitySection = useSection(maturities)

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Bell className="w-6 h-6 text-indigo-400" />
        <h1 className="text-2xl font-bold text-slate-100">Notifications</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 w-fit">
        {(['queue', 'history'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize flex items-center gap-2 ${
              tab === t
                ? 'bg-slate-700 text-slate-100 shadow'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {t === 'queue' ? <Mail className="w-4 h-4" /> : <History className="w-4 h-4" />}
            {t === 'queue' ? 'Queue' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'queue' && (
        <div className="space-y-6">
          {/* Payouts Section */}
          <Section
            title="Interest Payouts"
            count={payouts.length}
            selected={payoutSection.selected}
            sending={payoutSection.sending}
            result={payoutSection.result}
            onNotifyAll={() => payoutSection.send('payouts', payouts.map((p) => p.id))}
            onNotifySelected={() => payoutSection.send('payouts', Array.from(payoutSection.selected))}
          >
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={payoutSection.selected.size === payouts.length && payouts.length > 0}
                      onChange={payoutSection.toggleAll}
                      className="rounded border-slate-600 bg-slate-800 text-indigo-500"
                    />
                  </th>
                  <th className="px-4 py-3">Investor</th>
                  <th className="px-4 py-3">Due By</th>
                  <th className="px-4 py-3 text-right">Gross</th>
                  <th className="px-4 py-3 text-right">TDS</th>
                  <th className="px-4 py-3 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {payouts.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => payoutSection.toggle(p.id)}
                    className={`cursor-pointer hover:bg-slate-800/40 transition-colors ${
                      payoutSection.selected.has(p.id) ? 'bg-indigo-900/10' : ''
                    } ${p.is_overdue ? 'bg-red-900/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={payoutSection.selected.has(p.id)}
                        onChange={() => payoutSection.toggle(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-slate-600 bg-slate-800 text-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{p.investor_name}</span>
                        {p.is_overdue && <OverdueBadge />}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">{p.reference_id}</div>
                    </td>
                    <td className={`px-4 py-3 text-sm ${p.is_overdue ? 'text-red-400' : 'text-slate-400'}`}>{p.due_by}</td>
                    <td className="px-4 py-3 text-right text-slate-400 font-mono text-sm">₹{p.gross_interest.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-slate-400 font-mono text-sm">₹{p.tds_amount.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-emerald-400 font-mono font-bold text-sm">₹{p.net_interest.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {payouts.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500 italic">No interest payouts pending.</td></tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* Maturities Section */}
          <Section
            title="Principal Maturities"
            count={maturities.length}
            selected={maturitySection.selected}
            sending={maturitySection.sending}
            result={maturitySection.result}
            onNotifyAll={() => maturitySection.send('maturities', maturities.map((m) => m.id))}
            onNotifySelected={() => maturitySection.send('maturities', Array.from(maturitySection.selected))}
          >
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={maturitySection.selected.size === maturities.length && maturities.length > 0}
                      onChange={maturitySection.toggleAll}
                      className="rounded border-slate-600 bg-slate-800 text-indigo-500"
                    />
                  </th>
                  <th className="px-4 py-3">Investor</th>
                  <th className="px-4 py-3">Maturity Date</th>
                  <th className="px-4 py-3 text-right">Principal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {maturities.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => maturitySection.toggle(m.id)}
                    className={`cursor-pointer hover:bg-slate-800/40 transition-colors ${
                      maturitySection.selected.has(m.id) ? 'bg-indigo-900/10' : ''
                    } ${m.is_overdue ? 'bg-red-900/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={maturitySection.selected.has(m.id)}
                        onChange={() => maturitySection.toggle(m.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-slate-600 bg-slate-800 text-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{m.investor_name}</span>
                        {m.is_overdue && <OverdueBadge />}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">{m.reference_id}</div>
                    </td>
                    <td className={`px-4 py-3 text-sm ${m.is_overdue ? 'text-red-400' : 'text-slate-400'}`}>{m.maturity_date}</td>
                    <td className="px-4 py-3 text-right text-amber-400 font-mono font-bold text-sm">₹{m.principal_amount.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {maturities.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500 italic">No maturities pending.</td></tr>
                )}
              </tbody>
            </table>
          </Section>

          {/* TDS Section */}
          <Section
            title="TDS Filings"
            count={tdsFilings.length}
            selected={tdsSection.selected}
            sending={tdsSection.sending}
            result={tdsSection.result}
            onNotifyAll={() => tdsSection.send('tds', tdsFilings.map((t) => t.id))}
            onNotifySelected={() => tdsSection.send('tds', Array.from(tdsSection.selected))}
          >
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800 text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={tdsSection.selected.size === tdsFilings.length && tdsFilings.length > 0}
                      onChange={tdsSection.toggleAll}
                      className="rounded border-slate-600 bg-slate-800 text-indigo-500"
                    />
                  </th>
                  <th className="px-4 py-3">Investor</th>
                  <th className="px-4 py-3">Due By</th>
                  <th className="px-4 py-3 text-right">TDS Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {tdsFilings.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => tdsSection.toggle(t.id)}
                    className={`cursor-pointer hover:bg-slate-800/40 transition-colors ${
                      tdsSection.selected.has(t.id) ? 'bg-indigo-900/10' : ''
                    } ${t.is_overdue ? 'bg-red-900/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={tdsSection.selected.has(t.id)}
                        onChange={() => tdsSection.toggle(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-slate-600 bg-slate-800 text-indigo-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-200">{t.investor_name}</span>
                        {t.is_overdue && <OverdueBadge />}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">{t.reference_id}</div>
                    </td>
                    <td className={`px-4 py-3 text-sm ${t.is_overdue ? 'text-red-400' : 'text-slate-400'}`}>{t.due_by}</td>
                    <td className="px-4 py-3 text-right text-sky-400 font-mono font-bold text-sm">₹{t.tds_amount.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {tdsFilings.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-500 italic">No TDS filings pending.</td></tr>
                )}
              </tbody>
            </table>
          </Section>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/30">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
              Sent (last 30 days) — {history.length}
            </h2>
          </div>
          <div className="divide-y divide-slate-800">
            {history.map((h) => (
              <div key={h.id} className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-200">{h.email_subject}</p>
                    <p className="text-xs text-slate-500 mt-0.5">To: {h.email_to.join(', ')}</p>
                  </div>
                </div>
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  {new Date(h.sent_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            ))}
            {history.length === 0 && (
              <p className="px-6 py-8 text-center text-slate-500 italic text-sm">No emails sent in the last 30 days.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// Shared section wrapper
function Section({
  title, count, selected, sending, result, onNotifyAll, onNotifySelected, children,
}: {
  title: string
  count: number
  selected: Set<string>
  sending: boolean
  result: { success?: boolean; warned?: boolean; error?: string } | null
  onNotifyAll: () => void
  onNotifySelected: () => void
  children: React.ReactNode
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/30 flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">
          {title} ({count})
        </h2>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={onNotifySelected}
              disabled={sending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-xs font-semibold rounded-lg transition-colors"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              Notify Selected ({selected.size})
            </button>
          )}
          {count > 0 && (
            <button
              onClick={onNotifyAll}
              disabled={sending || count === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              Notify All
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
      {result && (
        <div className="px-6 pb-4">
          <SectionFeedback result={result} />
        </div>
      )}
    </div>
  )
}
