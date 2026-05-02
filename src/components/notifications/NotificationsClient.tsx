'use client'

import { useState } from 'react'
import { Bell, Mail, AlertCircle, CheckCircle2, Loader2, X, Eye, Users } from 'lucide-react'

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
  const [showPreview, setShowPreview] = useState(false)

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

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
            <Bell className="w-6 h-6 text-indigo-400" />
            Monthly Notifications
          </h1>
          <p className="text-slate-400 mt-1">Summary for {monthLabel} (includes overdues)</p>
        </div>
        <button
          onClick={() => setShowPreview(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-all shadow-lg shadow-indigo-900/20"
        >
          <Mail className="w-4 h-4" />
          Send Monthly Summary
        </button>
      </div>

      {success && (
        <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-xl p-4 flex items-center gap-3 text-emerald-400">
          <CheckCircle2 className="w-5 h-5" />
          <span className="text-sm">Summary email sent successfully to Valli!</span>
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
                <tr key={i} className={`hover:bg-slate-800/30 transition-colors ${p.is_overdue ? 'bg-red-900/5' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-200">{p.investor_name}</span>
                      {p.is_overdue && <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 text-[9px] font-bold uppercase tracking-wider border border-red-800/50">Overdue</span>}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">{p.reference_id}</div>
                  </td>
                  <td className={`px-6 py-4 ${p.is_overdue ? 'text-red-400 font-medium' : 'text-slate-400'}`}>{p.due_by}</td>
                  <td className="px-6 py-4 text-right text-emerald-400 font-mono font-bold">
                    ₹{p.net_interest.toLocaleString('en-IN')}
                  </td>
                </tr>
              ))}
              {interestPayouts.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-slate-500 italic">No interest payouts pending.</td>
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
              <div key={i} className={`px-6 py-4 flex items-center justify-between border-b border-slate-800 last:border-0 hover:bg-slate-800/30 ${m.is_overdue ? 'bg-red-900/5' : ''}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200 text-sm">{m.investor_name}</span>
                    {m.is_overdue && <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 text-[9px] font-bold uppercase tracking-wider border border-red-800/50">Overdue</span>}
                  </div>
                  <div className={`text-[10px] ${m.is_overdue ? 'text-red-400 font-medium' : 'text-slate-500'}`}>{m.maturity_date}</div>
                </div>
                <div className="text-amber-500 font-bold font-mono text-sm">₹{m.principal_amount.toLocaleString('en-IN')}</div>
              </div>
            ))}
            {maturities.length === 0 && (
              <p className="px-6 py-8 text-center text-slate-500 italic text-sm">No maturities pending.</p>
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
              <div key={i} className={`px-6 py-4 flex items-center justify-between border-b border-slate-800 last:border-0 hover:bg-slate-800/30 ${p.is_overdue ? 'bg-red-900/5' : ''}`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200 text-sm">{p.investor_name}</span>
                    {p.is_overdue && <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 text-[9px] font-bold uppercase tracking-wider border border-red-800/50">Overdue</span>}
                  </div>
                  <div className={`text-[10px] ${p.is_overdue ? 'text-red-400 font-medium' : 'text-slate-500'}`}>{p.due_by}</div>
                </div>
                <div className="text-sky-500 font-bold font-mono text-sm">₹{p.tds_amount.toLocaleString('en-IN')}</div>
              </div>
            ))}
            {tdsFilings.length === 0 && (
              <p className="px-6 py-8 text-center text-slate-500 italic text-sm">No TDS filings due.</p>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-800/30 flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-400">
                <Eye className="w-5 h-5" />
                <h2 className="font-bold text-slate-100">Review & Confirm</h2>
              </div>
              <button 
                onClick={() => setShowPreview(false)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
              {/* Recipient Box */}
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-4 flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-xs text-indigo-400 font-bold uppercase tracking-wider">Sending To</p>
                  <p className="text-sm font-semibold text-slate-200 mt-0.5">Valli Sivakumar (valli.sivakumar@goodearth.org.in)</p>
                  <p className="text-xs text-slate-500 mt-1">This email contains a consolidated summary of {data.payouts.length + data.maturities.length} investment events.</p>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Email Summary Preview</h3>
                <div className="space-y-2">
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <span className="text-sm text-slate-400">Interest Payouts</span>
                    <span className="text-sm font-bold text-slate-100">{interestPayouts.length}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <span className="text-sm text-slate-400">Principal Maturities</span>
                    <span className="text-sm font-bold text-slate-100">{maturities.length}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
                    <span className="text-sm text-slate-400">TDS Filings</span>
                    <span className="text-sm font-bold text-slate-100">{tdsFilings.length}</span>
                  </div>
                </div>

                {(interestPayouts.some(p => p.is_overdue) || maturities.some(m => m.is_overdue) || tdsFilings.some(t => p.is_overdue)) && (
                  <div className="bg-red-900/10 border border-red-900/20 rounded-xl p-4">
                    <p className="text-xs text-red-400 leading-relaxed font-medium">
                      Note: This email includes <strong>Overdue</strong> items from previous months that have not yet been marked as paid.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-slate-800 bg-slate-800/30 flex gap-3">
              <button
                onClick={() => setShowPreview(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 font-semibold hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSendEmail}
                disabled={sending}
                className="flex-[2] flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-900/20"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {sending ? 'Sending...' : 'Confirm & Send Email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
