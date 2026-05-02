'use client'

import { useState } from 'react'
import { Bell, Mail, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

interface MonthlySummaryData {
  payouts: Array<{
    investor_name: string
    reference_id: string
    due_by: string
    gross_interest: number
    tds_amount: number
    net_interest: number
    is_tds_only: boolean
  }>
  maturities: Array<{
    investor_name: string
    reference_id: string
    maturity_date: string
    principal_amount: number
  }>
}

export default function NotificationsClient({
  monthLabel,
  data,
}: {
  monthLabel: string
  data: MonthlySummaryData
}) {
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const interestPayouts = data.payouts.filter(p => !p.is_tds_only)
  const tdsFilings = data.payouts.filter(p => p.is_tds_only)
  const maturities = data.maturities

  async function handleSendEmail() {
    setSending(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch('/api/cron/monthly-summary')
      if (res.ok) {
        setSuccess(true)
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

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <Bell className="w-6 h-6 text-indigo-400" />
            Monthly Notifications
          </h1>
          <p className="text-slate-400 mt-1">Summary for {monthLabel}</p>
        </div>
        <button
          onClick={handleSendEmail}
          disabled={sending}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-xl font-semibold transition-all shadow-lg shadow-indigo-900/20"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Mail className="w-4 h-4" />
          )}
          {sending ? 'Sending...' : 'Send Monthly Summary Email'}
        </button>
      </div>

      {success && (
        <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-xl p-4 flex items-center gap-3 text-emerald-400">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm">Summary email sent successfully to the accounts team!</span>
        </div>
      )}

      {error && (
        <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-4 flex items-center gap-3 text-red-400">
          <AlertCircle className="w-5 h-5" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Interest Payouts */}
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
                    <div className="font-semibold text-slate-200">{p.investor_name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{p.reference_id}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-400">{p.due_by}</td>
                  <td className="px-6 py-4 text-right text-emerald-400 font-mono font-bold">
                    ₹{p.net_interest.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
              {interestPayouts.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-slate-500 italic">No interest payouts pending this month.</td>
                </tr>
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
                  <div className="font-semibold text-slate-200 text-sm">{m.investor_name}</div>
                  <div className="text-[10px] text-slate-500">{m.maturity_date}</div>
                </div>
                <div className="text-amber-500 font-bold font-mono text-sm">₹{m.principal_amount.toLocaleString('en-IN')}</div>
              </div>
            ))}
            {maturities.length === 0 && (
              <p className="px-6 py-8 text-center text-slate-500 italic text-sm">No maturities this month.</p>
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
                  <div className="font-semibold text-slate-200 text-sm">{p.investor_name}</div>
                  <div className="text-[10px] text-slate-500">{p.due_by}</div>
                </div>
                <div className="text-sky-500 font-bold font-mono text-sm">₹{p.tds_amount.toLocaleString('en-IN')}</div>
              </div>
            ))}
            {tdsFilings.length === 0 && (
              <p className="px-6 py-8 text-center text-slate-500 italic text-sm">No TDS filings due this month.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
