'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, Mail, AlertCircle, CheckCircle2, Loader2, X, Eye, Users, AlertTriangle, Calendar } from 'lucide-react'

interface MonthlySummaryData {
  payouts: Array<{
    investor_name: string
    reference_id: string
    due_by: string
    gross_interest: number
    tds_amount: number
    net_interest: number
    is_tds_only: boolean
    is_overdue?: boolean
  }>
  maturities: Array<{
    investor_name: string
    reference_id: string
    maturity_date: string
    principal_amount: number
    is_overdue?: boolean
  }>
}

const WINDOW_OPTIONS = [
  { value: 'month', label: 'This Month' },
  { value: '30days', label: 'Next 30 Days' },
  { value: 'quarter', label: 'Next Quarter' },
  { value: 'custom', label: 'Custom' },
]

export default function NotificationsClient({
  monthLabel,
  data,
  window: selectedWindow = 'month',
  from,
  to,
  displayRange,
  accountants = [],
}: {
  monthLabel: string
  data: MonthlySummaryData
  window?: string
  from?: string
  to?: string
  displayRange?: string
  accountants?: { name: string; email: string }[]
}) {
  const router = useRouter()
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [customFrom, setCustomFrom] = useState(from ?? '')
  const [customTo, setCustomTo] = useState(to ?? '')

  const interestPayouts = data.payouts.filter(p => !p.is_tds_only && !p.is_overdue)
  const tdsFilings = data.payouts.filter(p => p.is_tds_only && !p.is_overdue)
  const maturities = data.maturities.filter(m => !m.is_overdue)

  const overdueInterest = data.payouts.filter(p => !p.is_tds_only && p.is_overdue)
  const overdueTds = data.payouts.filter(p => p.is_tds_only && p.is_overdue)
  const overdueMaturities = data.maturities.filter(m => m.is_overdue)
  const totalOverdue = overdueInterest.length + overdueTds.length + overdueMaturities.length

  function buildApiUrl(preview = false) {
    const params = new URLSearchParams({ window: selectedWindow })
    if (selectedWindow === 'custom' && customFrom && customTo) {
      params.set('from', customFrom)
      params.set('to', customTo)
    }
    if (preview) params.set('preview', '1')
    return `/api/cron/monthly-summary?${params}`
  }

  async function handleOpenPreview() {
    setShowPreview(true)
    setPreviewHtml(null)
    setLoadingPreview(true)
    try {
      const res = await fetch(buildApiUrl(true))
      if (res.ok) {
        const d = await res.json()
        setPreviewHtml(d.html ?? null)
      }
    } catch {
      // preview load failure is non-fatal — modal still shows recipient info
    } finally {
      setLoadingPreview(false)
    }
  }

  async function handleSendEmail() {
    setSending(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch(buildApiUrl(false))
      if (res.ok) {
        setSuccess(true)
        setShowPreview(false)
      } else {
        const d = await res.json()
        setError(d.error || 'Failed to send email')
      }
    } catch {
      setError('Network error')
    } finally {
      setSending(false)
    }
  }

  function navigateWindow(w: string) {
    if (w === 'custom') {
      router.replace(`/notifications?window=custom${customFrom ? `&from=${customFrom}` : ''}${customTo ? `&to=${customTo}` : ''}`)
    } else {
      router.replace(`/notifications?window=${w}`)
    }
  }

  function applyCustomRange() {
    if (customFrom && customTo) {
      router.replace(`/notifications?window=custom&from=${customFrom}&to=${customTo}`)
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <Bell className="w-6 h-6 text-indigo-400" />
            Notification Reports
          </h1>
          <p className="text-slate-400 mt-1">{monthLabel}</p>
        </div>
        <button
          onClick={handleOpenPreview}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-indigo-900/20"
        >
          <Mail className="w-4 h-4" />
          Send Report to Accounts
        </button>
      </div>

      {/* Window selector */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {WINDOW_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => navigateWindow(opt.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all border ${
                selectedWindow === opt.value
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Custom date inputs */}
        {selectedWindow === 'custom' && (
          <div className="flex items-center gap-3 pt-1">
            <Calendar className="w-4 h-4 text-slate-500 flex-shrink-0" />
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <span className="text-slate-600 text-sm">→</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            />
            <button
              onClick={applyCustomRange}
              disabled={!customFrom || !customTo}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white text-sm font-semibold rounded-lg transition-all"
            >
              Apply
            </button>
          </div>
        )}

        {/* Actual date range display */}
        {displayRange && selectedWindow !== 'custom' && (
          <p className="text-xs text-slate-500 pl-1">{displayRange}</p>
        )}
      </div>

      {success && (
        <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-xl p-4 flex items-center gap-3 text-emerald-400">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm">Report sent to accounts team.</span>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* ── Overdue Card ── */}
      {totalOverdue > 0 && (
        <div className="bg-red-950/30 border border-red-900/50 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-red-900/40 bg-red-900/20 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <h2 className="text-sm font-bold text-red-300 uppercase tracking-wider">Overdue ({totalOverdue})</h2>
          </div>
          <div className="divide-y divide-red-900/30">
            {overdueInterest.length > 0 && (
              <div className="px-6 py-3">
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">Interest Payouts ({overdueInterest.length})</p>
                {overdueInterest.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <div>
                      <span className="text-sm font-semibold text-slate-200">{p.investor_name}</span>
                      <span className="ml-2 text-[10px] text-slate-500 font-mono">{p.reference_id}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-red-400">{p.due_by}</span>
                      <span className="text-sm font-bold font-mono text-emerald-400">₹{p.net_interest.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {overdueTds.length > 0 && (
              <div className="px-6 py-3">
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">TDS Filings ({overdueTds.length})</p>
                {overdueTds.map((p, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <div>
                      <span className="text-sm font-semibold text-slate-200">{p.investor_name}</span>
                      <span className="ml-2 text-[10px] text-slate-500 font-mono">{p.reference_id}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-red-400">{p.due_by}</span>
                      <span className="text-sm font-bold font-mono text-sky-400">₹{p.tds_amount.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {overdueMaturities.length > 0 && (
              <div className="px-6 py-3">
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-2">Maturities ({overdueMaturities.length})</p>
                {overdueMaturities.map((m, i) => (
                  <div key={i} className="flex items-center justify-between py-1.5">
                    <div>
                      <span className="text-sm font-semibold text-slate-200">{m.investor_name}</span>
                      <span className="ml-2 text-[10px] text-slate-500 font-mono">{m.reference_id}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-red-400">{m.maturity_date}</span>
                      <span className="text-sm font-bold font-mono text-amber-400">₹{m.principal_amount.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Interest Payouts ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/30">
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Interest Payouts ({interestPayouts.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800">
                <th className="px-6 py-3 font-medium">Investor</th>
                <th className="px-6 py-3 font-medium">Due By</th>
                <th className="px-6 py-3 text-right font-medium">Net Interest</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {interestPayouts.map((p, i) => (
                <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-6 py-4">
                    <span className="font-semibold text-slate-200">{p.investor_name}</span>
                    <div className="text-[10px] text-slate-500 font-mono">{p.reference_id}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-400">{p.due_by}</td>
                  <td className="px-6 py-4 text-right text-emerald-400 font-mono font-bold">
                    ₹{p.net_interest.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
              {interestPayouts.length === 0 && (
                <tr><td colSpan={3} className="px-6 py-8 text-center text-slate-500 italic">No interest payouts in this window.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Maturities */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/30">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">Maturities ({maturities.length})</h2>
          </div>
          <div className="p-0">
            {maturities.map((m, i) => (
              <div key={i} className="px-6 py-4 flex items-center justify-between border-b border-slate-800 last:border-0 hover:bg-slate-800/30">
                <div>
                  <span className="font-semibold text-slate-200 text-sm">{m.investor_name}</span>
                  <div className="text-[10px] text-slate-500">{m.maturity_date}</div>
                </div>
                <div className="text-amber-500 font-bold font-mono text-sm">₹{m.principal_amount.toLocaleString('en-IN')}</div>
              </div>
            ))}
            {maturities.length === 0 && (
              <p className="px-6 py-8 text-center text-slate-500 italic text-sm">No maturities in this window.</p>
            )}
          </div>
        </div>

        {/* TDS Filings */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/30">
            <h2 className="text-sm font-bold text-slate-200 uppercase tracking-wider">TDS Filings ({tdsFilings.length})</h2>
          </div>
          <div className="p-0">
            {tdsFilings.map((p, i) => (
              <div key={i} className="px-6 py-4 flex items-center justify-between border-b border-slate-800 last:border-0 hover:bg-slate-800/30">
                <div>
                  <span className="font-semibold text-slate-200 text-sm">{p.investor_name}</span>
                  <div className="text-[10px] text-slate-500">{p.due_by}</div>
                </div>
                <div className="text-sky-500 font-bold font-mono text-sm">₹{p.tds_amount.toLocaleString('en-IN')}</div>
              </div>
            ))}
            {tdsFilings.length === 0 && (
              <p className="px-6 py-8 text-center text-slate-500 italic text-sm">No TDS filings in this window.</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Preview Modal ── */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/30 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-2 text-indigo-400">
                <Eye className="w-5 h-5" />
                <h2 className="font-bold text-slate-100">Review & Send</h2>
              </div>
              <button
                onClick={() => setShowPreview(false)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="overflow-y-auto custom-scrollbar flex-1">
              {/* Recipients */}
              <div className="p-6 border-b border-slate-800">
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-indigo-400 font-bold uppercase tracking-wider">Sending To</p>
                    {accountants.length > 0 ? (
                      accountants.map(a => (
                        <p key={a.email} className="text-sm font-semibold text-slate-200 mt-0.5">{a.name} ({a.email})</p>
                      ))
                    ) : (
                      <p className="text-sm text-red-400 mt-0.5">No active accountants found in team settings.</p>
                    )}
                    <p className="text-xs text-slate-500 mt-1">
                      {monthLabel} · {data.payouts.length + data.maturities.length} investment events
                    </p>
                  </div>
                </div>
              </div>

              {/* Email HTML preview */}
              <div className="p-6">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Email Preview</p>
                {loadingPreview ? (
                  <div className="flex items-center justify-center py-12 text-slate-500 gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading preview…</span>
                  </div>
                ) : previewHtml ? (
                  <div
                    className="bg-white rounded-xl p-6 text-sm overflow-auto max-h-96"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                ) : (
                  <p className="text-sm text-slate-500 italic">Preview unavailable.</p>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-800 bg-slate-800/30 flex gap-3 flex-shrink-0">
              <button
                onClick={() => setShowPreview(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-semibold hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={sending || accountants.length === 0}
                className="flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-900/20"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {sending ? 'Sending…' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
