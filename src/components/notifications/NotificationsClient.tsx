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
    <span className="px-1.5 py-0.5 rounded-sm bg-rust-soft text-rust text-[9px] font-bold uppercase tracking-wider border border-rust/10">
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
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
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
      
      if (res.redirected) {
        window.location.href = res.url
        return
      }

      const contentType = res.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        const data = await res.json()
        if (res.ok) {
          setResult({ success: true, warned: data.warned })
          setSelected(new Set())
        } else {
          setResult({ error: data.error || 'Failed to send' })
        }
      } else {
        // Non-JSON response (likely a server crash or 404)
        const text = await res.text()
        const isErrorPage = text.includes('An error occurred') || text.includes('<!DOCTYPE html>')
        console.error('Non-JSON response:', text)
        setResult({ 
          error: isErrorPage 
            ? `Server error (${res.status}). The extraction service might be down.` 
            : `Unexpected response: ${text.slice(0, 50)}...` 
        })
      }
    } catch (err) {
      console.error('Fetch error:', err)
      setResult({ error: 'Network error or server unreachable' })
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
      <div className="mt-4 flex items-center gap-3 text-rust text-xs font-bold uppercase tracking-wider bg-rust-soft border border-rust/10 rounded-sm px-4 py-3 shadow-sm">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        {result.error}
      </div>
    )
  }
  return (
    <div className="mt-4 flex items-center gap-3 text-gain text-xs font-bold uppercase tracking-wider bg-gain-soft border border-gain/20 rounded-sm px-4 py-3 shadow-sm">
      <CheckCircle2 className="w-4 h-4 flex-shrink-0 stroke-[3]" />
      Notification Sent.{result.warned ? ' (Prior alert sent recently)' : ''}
    </div>
  )
}

export default function NotificationsClient({ payouts, tdsFilings, maturities, history }: Props) {
  const [tab, setTab] = useState<Tab>('queue')

  const payoutSection = useSection(payouts)
  const tdsSection = useSection(tdsFilings)
  const maturitySection = useSection(maturities)

  return (
    <div className="p-8 max-w-[1200px] mx-auto space-y-10">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-ink-1 pb-3 mb-5">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-forest rounded-sm flex items-center justify-center shadow-sm">
            <Bell className="w-5 h-5 text-paper" />
          </div>
          <div>
            <h1 className="text-[28px] font-semibold text-ink-1 font-serif tracking-tight leading-tight">Notifications</h1>
            <p className="text-xs text-ink-4 mt-0.5 font-medium italic">Coordinator Action Center</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-surface-2 border border-hairline rounded-sm p-1 shadow-inner">
          {(['queue', 'history'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-8 px-6 rounded-sm text-[11px] font-bold uppercase tracking-widest transition-all flex items-center gap-2 ${
                tab === t
                  ? 'bg-surface text-ink-1 border border-hairline shadow-sm'
                  : 'text-ink-5 hover:text-ink-2'
              }`}
            >
              {t === 'queue' ? <Mail className="w-3.5 h-3.5" /> : <History className="w-3.5 h-3.5" />}
              {t === 'queue' ? 'Queue' : 'History'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'queue' && (
        <div className="space-y-10">
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
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-surface-2 border-b border-hairline-strong">
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={payoutSection.selected.size === payouts.length && payouts.length > 0}
                      onChange={payoutSection.toggleAll}
                      className="rounded-sm border-hairline-strong text-forest focus:ring-forest/10"
                    />
                  </th>
                  <th className="px-4 py-2.5 lbl">Investor</th>
                  <th className="px-4 py-2.5 lbl">Due By</th>
                  <th className="px-4 py-2.5 lbl text-right">Gross</th>
                  <th className="px-4 py-2.5 lbl text-right">TDS</th>
                  <th className="px-4 py-2.5 lbl text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline bg-surface">
                {payouts.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => payoutSection.toggle(p.id)}
                    className={`cursor-pointer hover:bg-surface-2 transition-colors ${
                      payoutSection.selected.has(p.id) ? 'bg-forest-soft/30' : ''
                    } ${p.is_overdue ? 'bg-rust-soft/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={payoutSection.selected.has(p.id)}
                        onChange={() => payoutSection.toggle(p.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-sm border-hairline-strong text-forest focus:ring-forest/10"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink-2">{p.investor_name}</span>
                        {p.is_overdue && <OverdueBadge />}
                      </div>
                      <div className="text-[10px] text-ink-5 font-bold num mt-0.5 tracking-wider opacity-60">{p.reference_id}</div>
                    </td>
                    <td className={`px-4 py-3 num text-[11px] font-bold ${p.is_overdue ? 'text-rust' : 'text-ink-4'}`}>{p.due_by}</td>
                    <td className="px-4 py-3 text-right text-ink-4 num text-[11px]">₹{p.gross_interest.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-rust opacity-60 num text-[11px]">₹{p.tds_amount.toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right text-gain font-bold num text-[13px]">₹{p.net_interest.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {payouts.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-ink-5 italic bg-canvas/30 text-sm">No interest payouts pending.</td></tr>
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
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-surface-2 border-b border-hairline-strong">
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={maturitySection.selected.size === maturities.length && maturities.length > 0}
                      onChange={maturitySection.toggleAll}
                      className="rounded-sm border-hairline-strong text-forest focus:ring-forest/10"
                    />
                  </th>
                  <th className="px-4 py-2.5 lbl">Investor</th>
                  <th className="px-4 py-2.5 lbl">Maturity Date</th>
                  <th className="px-4 py-2.5 lbl text-right">Principal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline bg-surface">
                {maturities.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => maturitySection.toggle(m.id)}
                    className={`cursor-pointer hover:bg-surface-2 transition-colors ${
                      maturitySection.selected.has(m.id) ? 'bg-forest-soft/30' : ''
                    } ${m.is_overdue ? 'bg-rust-soft/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={maturitySection.selected.has(m.id)}
                        onChange={() => maturitySection.toggle(m.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-sm border-hairline-strong text-forest focus:ring-forest/10"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink-2">{m.investor_name}</span>
                        {m.is_overdue && <OverdueBadge />}
                      </div>
                      <div className="text-[10px] text-ink-5 font-bold num mt-0.5 tracking-wider opacity-60">{m.reference_id}</div>
                    </td>
                    <td className={`px-4 py-3 num text-[11px] font-bold ${m.is_overdue ? 'text-rust' : 'text-ink-4'}`}>{m.maturity_date}</td>
                    <td className="px-4 py-3 text-right text-earth-brown font-bold num text-[13px]">₹{m.principal_amount.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {maturities.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-ink-5 italic bg-canvas/30 text-sm">No maturities pending.</td></tr>
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
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-surface-2 border-b border-hairline-strong">
                  <th className="px-4 py-2.5 w-10">
                    <input
                      type="checkbox"
                      checked={tdsSection.selected.size === tdsFilings.length && tdsFilings.length > 0}
                      onChange={tdsSection.toggleAll}
                      className="rounded-sm border-hairline-strong text-forest focus:ring-forest/10"
                    />
                  </th>
                  <th className="px-4 py-2.5 lbl">Investor</th>
                  <th className="px-4 py-2.5 lbl">Due By</th>
                  <th className="px-4 py-2.5 lbl text-right">TDS Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline bg-surface">
                {tdsFilings.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => tdsSection.toggle(t.id)}
                    className={`cursor-pointer hover:bg-surface-2 transition-colors ${
                      tdsSection.selected.has(t.id) ? 'bg-forest-soft/30' : ''
                    } ${t.is_overdue ? 'bg-rust-soft/5' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={tdsSection.selected.has(t.id)}
                        onChange={() => tdsSection.toggle(t.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-sm border-hairline-strong text-forest focus:ring-forest/10"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-ink-2">{t.investor_name}</span>
                        {t.is_overdue && <OverdueBadge />}
                      </div>
                      <div className="text-[10px] text-ink-5 font-bold num mt-0.5 tracking-wider opacity-60">{t.reference_id}</div>
                    </td>
                    <td className={`px-4 py-3 num text-[11px] font-bold ${t.is_overdue ? 'text-rust' : 'text-ink-4'}`}>{t.due_by}</td>
                    <td className="px-4 py-3 text-right text-earth-ochre font-bold num text-[13px]">₹{t.tds_amount.toLocaleString('en-IN')}</td>
                  </tr>
                ))}
                {tdsFilings.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-12 text-center text-ink-5 italic bg-canvas/30 text-sm">No TDS filings pending.</td></tr>
                )}
              </tbody>
            </table>
          </Section>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-surface border border-hairline rounded-sm overflow-hidden shadow-sm animate-in fade-in duration-500">
          <div className="px-6 py-4 border-b border-hairline bg-surface-2 flex items-center justify-between">
            <h2 className="lbl font-bold text-ink-1 tracking-widest uppercase">
              Dispatch Log <span className="ml-2 opacity-40">— last 30 days</span>
            </h2>
            <span className="num text-[11px] font-bold text-ink-4 uppercase tracking-widest">{history.length} emails sent</span>
          </div>
          <div className="divide-y divide-hairline">
            {history.map((h) => (
              <div key={h.id} className="px-8 py-5 flex items-start justify-between gap-6 hover:bg-canvas transition-colors group">
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-sm bg-canvas border border-hairline flex items-center justify-center group-hover:bg-paper transition-all">
                    <Clock className="w-4 h-4 text-ink-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-ink-1 leading-snug">{h.email_subject}</p>
                    <p className="text-[11px] text-ink-4 font-medium mt-1 uppercase tracking-tight opacity-70">Recipients: {h.email_to.join(', ')}</p>
                  </div>
                </div>
                <span className="num text-[10px] font-bold text-ink-5 uppercase whitespace-nowrap bg-surface-2 px-2 py-1 rounded-sm border border-hairline">
                  {new Date(h.sent_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            ))}
            {history.length === 0 && (
              <div className="px-6 py-20 text-center bg-canvas/30">
                <p className="text-sm italic text-ink-5">No dispatched notifications found in the history window.</p>
              </div>
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
    <div className="bg-surface border border-hairline rounded-sm overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-hairline bg-surface-2 flex items-center justify-between">
        <h2 className="lbl font-bold text-ink-1 tracking-widest uppercase">
          {title} ({count})
        </h2>
        <div className="flex items-center gap-4">
          {selected.size > 0 && (
            <button
              onClick={onNotifySelected}
              disabled={sending}
              className="h-8 px-4 bg-surface border border-hairline-strong text-ink-1 hover:bg-surface-3 disabled:opacity-40 text-[10px] font-bold uppercase tracking-widest rounded-sm transition-all shadow-sm flex items-center gap-2"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              Notify Selected ({selected.size})
            </button>
          )}
          {count > 0 && (
            <button
              onClick={onNotifyAll}
              disabled={sending || count === 0}
              className="h-8 px-6 bg-forest hover:bg-forest-2 disabled:bg-ink-5 disabled:opacity-40 text-paper text-[10px] font-bold uppercase tracking-widest rounded-sm transition-all flex items-center gap-2 shadow-md"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
              Notify All
            </button>
          )}
        </div>
      </div>
      <div className="overflow-x-auto">{children}</div>
      {result && (
        <div className="px-6 pb-6">
          <SectionFeedback result={result} />
        </div>
      )}
    </div>
  )
}
