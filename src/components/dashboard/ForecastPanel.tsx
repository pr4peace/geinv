'use client'

import React, { useState } from 'react'
import { format, parseISO } from 'date-fns'
import type { QuarterlyForecast } from '@/lib/kpi'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

// Generate list of available quarters (current + 3 ahead, 1 behind)
function generateQuarterOptions(): string[] {
  const quarters: string[] = []
  const now = new Date()
  // Go back 2 quarters, forward 4
  for (let offset = -2; offset <= 4; offset++) {
    const d = new Date(now.getFullYear(), now.getMonth() + offset * 3, 1)
    const month = d.getMonth()
    const year = d.getFullYear()
    let label: string
    if (month >= 3 && month <= 5) label = `Q1-${year}-${String(year + 1).slice(2)}`
    else if (month >= 6 && month <= 8) label = `Q2-${year}-${String(year + 1).slice(2)}`
    else if (month >= 9 && month <= 11) label = `Q3-${year}-${String(year + 1).slice(2)}`
    else label = `Q4-${year - 1}-${String(year).slice(2)}`
    if (!quarters.includes(label)) quarters.push(label)
  }
  return quarters
}

function quarterDisplayLabel(q: string) {
  // "Q1-2026-27" → "Q1 2026-27"
  return q.replace('-', ' ')
}

type PayoutRow = QuarterlyForecast['payouts'][number]
type MaturityRow = QuarterlyForecast['maturities'][number]

interface Props {
  initialForecast: QuarterlyForecast
}

export default function ForecastPanel({ initialForecast }: Props) {
  const [currentQuarter, setCurrentQuarter] = useState(initialForecast.quarter)
  const [forecast, setForecast] = useState<QuarterlyForecast>(initialForecast)
  const [loading, setLoading] = useState(false)
  const [sendLoading, setSendLoading] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const quarterOptions = generateQuarterOptions()

  async function loadQuarter(q: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/kpi?quarter=${q}`)
      const json = await res.json()
      if (json.forecast) {
        setForecast(json.forecast)
        setCurrentQuarter(q)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  async function handleSendToAccounts() {
    setSendLoading(true)
    try {
      const res = await fetch('/api/email/quarterly-forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarter: currentQuarter }),
      })
      if (res.ok) {
        setToast({ type: 'success', message: 'Quarterly forecast sent to accounts team.' })
      } else {
        const j = await res.json()
        setToast({ type: 'error', message: j.error ?? 'Failed to send email.' })
      }
    } catch {
      setToast({ type: 'error', message: 'Network error — could not send email.' })
    } finally {
      setSendLoading(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  // Group payouts by month
  const grouped = forecast.payouts.reduce<Record<string, PayoutRow[]>>((acc, p) => {
    const month = format(parseISO(p.due_by), 'MMMM yyyy')
    if (!acc[month]) acc[month] = []
    acc[month].push(p)
    return acc
  }, {})

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-100">Quarterly Cash Flow Forecast</h2>
          <select
            value={currentQuarter}
            onChange={(e) => loadQuarter(e.target.value)}
            className="bg-slate-700 border border-slate-600 text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {quarterOptions.map((q) => (
              <option key={q} value={q}>{quarterDisplayLabel(q)}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleSendToAccounts}
          disabled={sendLoading}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          {sendLoading ? 'Sending…' : 'Send to Accounts'}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`mb-3 text-xs px-3 py-2 rounded-lg ${toast.type === 'success' ? 'bg-green-900/50 text-green-300 border border-green-700' : 'bg-red-900/50 text-red-300 border border-red-700'}`}>
          {toast.message}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-slate-500 text-sm">Loading…</div>
      ) : (
        <>
          {/* Interest payouts table */}
          {forecast.payouts.length === 0 ? (
            <div className="py-6 text-center text-slate-500 text-sm">No payouts for this quarter.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 font-medium pb-2 pr-4">Investor</th>
                    <th className="text-left text-slate-400 font-medium pb-2 pr-4">Due Date</th>
                    <th className="text-right text-slate-400 font-medium pb-2 pr-4">Gross Interest</th>
                    <th className="text-right text-slate-400 font-medium pb-2 pr-4">TDS</th>
                    <th className="text-right text-slate-400 font-medium pb-2">Net Interest</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(grouped).map(([month, rows]) => {
                    const monthGross = rows.reduce((s, r) => s + r.gross_interest, 0)
                    const monthTds = rows.reduce((s, r) => s + r.tds_amount, 0)
                    const monthNet = rows.reduce((s, r) => s + r.net_interest, 0)
                    return (
                      <React.Fragment key={month}>
                        {rows.map((row, i) => (
                          <tr key={`${row.agreement_id}-${row.due_by}-${i}`} className="border-b border-slate-700/50">
                            <td className="py-2 pr-4 text-slate-200">{row.investor_name}</td>
                            <td className="py-2 pr-4 text-slate-400">{format(parseISO(row.due_by), 'dd MMM yyyy')}</td>
                            <td className="py-2 pr-4 text-right text-slate-200">{fmt(row.gross_interest)}</td>
                            <td className="py-2 pr-4 text-right text-red-400">{fmt(row.tds_amount)}</td>
                            <td className="py-2 text-right text-slate-100 font-medium">{fmt(row.net_interest)}</td>
                          </tr>
                        ))}
                        {/* Month subtotal */}
                        <tr className="border-b border-slate-600">
                          <td colSpan={2} className="py-1.5 pr-4 text-slate-400 italic text-xs">{month} subtotal</td>
                          <td className="py-1.5 pr-4 text-right text-slate-300 font-medium">{fmt(monthGross)}</td>
                          <td className="py-1.5 pr-4 text-right text-red-400 font-medium">{fmt(monthTds)}</td>
                          <td className="py-1.5 text-right text-slate-100 font-semibold">{fmt(monthNet)}</td>
                        </tr>
                      </React.Fragment>
                    )
                  })}
                  {/* Grand total */}
                  <tr className="border-t border-slate-600">
                    <td colSpan={2} className="pt-2 pr-4 text-slate-300 font-semibold text-xs uppercase tracking-wide">Quarter Total</td>
                    <td className="pt-2 pr-4 text-right text-slate-100 font-semibold">{fmt(forecast.totals.gross_interest)}</td>
                    <td className="pt-2 pr-4 text-right text-red-400 font-semibold">{fmt(forecast.totals.tds_amount)}</td>
                    <td className="pt-2 text-right text-emerald-400 font-bold">{fmt(forecast.totals.net_interest)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* Maturity Repayments */}
          {forecast.maturities.length > 0 && (
            <div className="mt-6">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Maturity Repayments</h3>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left text-slate-400 font-medium pb-2 pr-4">Investor</th>
                    <th className="text-left text-slate-400 font-medium pb-2 pr-4">Ref</th>
                    <th className="text-left text-slate-400 font-medium pb-2 pr-4">Maturity Date</th>
                    <th className="text-right text-slate-400 font-medium pb-2">Principal</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.maturities.map((m: MaturityRow) => (
                    <tr key={m.agreement_id} className="border-b border-slate-700/50">
                      <td className="py-2 pr-4 text-slate-200">{m.investor_name}</td>
                      <td className="py-2 pr-4 text-slate-400">{m.reference_id}</td>
                      <td className="py-2 pr-4 text-slate-400">{format(parseISO(m.maturity_date), 'dd MMM yyyy')}</td>
                      <td className="py-2 text-right text-amber-400 font-semibold">{fmt(m.principal_amount)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={3} className="pt-2 pr-4 text-slate-300 font-semibold text-xs uppercase tracking-wide">Total Principal Maturing</td>
                    <td className="pt-2 text-right text-amber-400 font-bold">{fmt(forecast.totals.principal_maturing)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
