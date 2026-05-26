'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { calculatePayoutSchedule } from '@/lib/payout-calculator'
import type { PayoutRow } from '@/lib/payout-calculator'
import { validateCalculatorForm as _validateCalculatorForm } from '@/lib/calculator-validation'

interface TeamMember {
  id: string
  name: string
  role: string
  is_active: boolean
}

interface Props {
  teamMembers: TeamMember[]
}

interface FormState {
  agreement_type: string
  agreement_date: string
  lock_in_years: string
  salesperson_id: string
  investor_name: string
  investor_pan: string
  investor_aadhaar: string
  principal_amount: string
  roi_percentage: string
  payout_frequency: 'quarterly' | 'annual' | 'biannual' | 'monthly' | 'cumulative'
  interest_type: 'simple' | 'compound'
  investment_start_date: string
  maturity_date: string
}

const INITIAL: FormState = {
  agreement_type: 'Investment Agreement',
  agreement_date: '',
  lock_in_years: '',
  salesperson_id: '',
  investor_name: '',
  investor_pan: '',
  investor_aadhaar: '',
  principal_amount: '',
  roi_percentage: '',
  payout_frequency: 'quarterly',
  interest_type: 'simple',
  investment_start_date: '',
  maturity_date: '',
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return d }
}

export const validateCalculatorForm = _validateCalculatorForm

export default function CalculatorForm({ teamMembers }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(INITIAL)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(f => ({ ...f, [key]: value }))
    setSaveError(null)
    setValidationErrors([])
  }

  const schedule = useMemo((): PayoutRow[] => {
    const principal = parseFloat(form.principal_amount)
    const roi = parseFloat(form.roi_percentage)
    if (isNaN(principal) || principal <= 0 || isNaN(roi) || roi <= 0 ||
        !form.investment_start_date || !form.maturity_date ||
        form.maturity_date <= form.investment_start_date) {
      return []
    }
    try {
      return calculatePayoutSchedule({
        principal,
        roiPercentage: roi,
        payoutFrequency: form.payout_frequency,
        interestType: form.interest_type,
        startDate: form.investment_start_date,
        maturityDate: form.maturity_date,
      })
    } catch { return [] }
  }, [form.principal_amount, form.roi_percentage, form.payout_frequency, form.interest_type, form.investment_start_date, form.maturity_date])

  const interestRows = schedule.filter(r => !r.is_tds_only && !r.is_principal_repayment)
  const totalGross = interestRows.reduce((s, r) => s + r.gross_interest, 0)
  const totalTds = interestRows.reduce((s, r) => s + r.tds_amount, 0)
  const totalNet = interestRows.reduce((s, r) => s + r.net_interest, 0)

  async function handleCreate() {
    const errors = validateCalculatorForm(form)
    if (errors.length > 0) { setValidationErrors(errors); return }
    if (schedule.length === 0) { setValidationErrors(['Unable to compute payout schedule — check your dates and amounts']); return }

    setSaving(true)
    setSaveError(null)
    try {
      const lockIn = form.lock_in_years ? parseInt(form.lock_in_years, 10) : 0
      const body = {
        agreement_type: form.agreement_type || 'Investment Agreement',
        agreement_date: form.agreement_date || null,
        investment_start_date: form.investment_start_date,
        is_draft: false,
        investor_name: form.investor_name.trim(),
        investor_pan: form.investor_pan.trim() || null,
        investor_aadhaar: form.investor_aadhaar.trim() || null,
        investor_address: null,
        investor2_name: null,
        investor2_pan: null,
        investor2_aadhaar: null,
        investor2_address: null,
        tds_filing_name: null,
        nominees: [],
        principal_amount: parseFloat(form.principal_amount),
        roi_percentage: parseFloat(form.roi_percentage),
        payout_frequency: form.payout_frequency,
        interest_type: form.interest_type,
        lock_in_years: isNaN(lockIn) ? 0 : lockIn,
        maturity_date: form.maturity_date,
        payments: [],
        salesperson_id: form.salesperson_id || null,
        salesperson_custom: null,
        temp_path: null,
        payout_schedule: interestRows.map(r => ({
          period_from: r.period_from,
          period_to: r.period_to,
          due_by: r.due_by,
          no_of_days: r.no_of_days,
          gross_interest: r.gross_interest,
          tds_amount: r.tds_amount,
          net_interest: r.net_interest,
          is_principal_repayment: false,
          is_tds_only: false,
        })),
        mark_historical_paid: false,
      }

      const res = await fetch('/api/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Save failed (${res.status})`)
      }

      const created = await res.json()
      if (!created?.id) throw new Error('Agreement saved but ID missing in response.')
      router.push(`/agreements/${created.id}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unknown error saving agreement')
    } finally {
      setSaving(false)
    }
  }

  async function handleExportPdf() {
    const errors = validateCalculatorForm(form)
    if (errors.length > 0) { setValidationErrors(errors); return }
    if (schedule.length === 0) { setValidationErrors(['Unable to compute payout schedule — check your dates and amounts']); return }

    setExporting(true)
    try {
      const res = await fetch('/api/agreements/pdf-info-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form, schedule: interestRows }),
      })
      if (!res.ok) throw new Error('PDF generation failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Investment-Info-${form.investor_name.trim() || 'Sheet'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'PDF export failed')
    } finally {
      setExporting(false)
    }
  }

  const inputClass = 'w-full bg-surface border border-hairline rounded-sm px-3 py-2 text-sm text-ink-1 focus:outline-none focus:border-forest focus:ring-1 focus:ring-forest/20 placeholder:text-ink-5'
  const labelClass = 'block text-[10px] font-bold uppercase tracking-widest text-ink-4 mb-1'
  const sectionHeadClass = 'text-[9px] font-bold uppercase tracking-widest text-ink-4 border-b border-hairline pb-2 mb-4'

  return (
    <div className="space-y-6">
      {/* Section: Agreement */}
      <div>
        <div className={sectionHeadClass}>Agreement</div>
        <div className="grid grid-cols-4 gap-4">
          <div className="col-span-2">
            <label className={labelClass}>Agreement Type</label>
            <input className={inputClass} value={form.agreement_type} onChange={e => update('agreement_type', e.target.value)} placeholder="Investment Agreement" />
          </div>
          <div>
            <label className={labelClass}>Agreement Date</label>
            <input type="date" className={inputClass} value={form.agreement_date} onChange={e => update('agreement_date', e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Lock-in (years)</label>
            <input type="number" min="0" className={inputClass} value={form.lock_in_years} onChange={e => update('lock_in_years', e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="grid grid-cols-4 gap-4 mt-4">
          <div>
            <label className={labelClass}>Salesperson</label>
            <select className={inputClass} value={form.salesperson_id} onChange={e => update('salesperson_id', e.target.value)}>
              <option value="">None</option>
              {teamMembers.filter(m => m.is_active && m.role === 'salesperson').map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Section: Investor */}
      <div>
        <div className={sectionHeadClass}>Investor</div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Investor Name *</label>
            <input className={inputClass} value={form.investor_name} onChange={e => update('investor_name', e.target.value)} placeholder="Full name" />
          </div>
          <div>
            <label className={labelClass}>PAN</label>
            <input className={inputClass} value={form.investor_pan} onChange={e => update('investor_pan', e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
          </div>
          <div>
            <label className={labelClass}>Aadhaar</label>
            <input className={inputClass} value={form.investor_aadhaar} onChange={e => update('investor_aadhaar', e.target.value)} placeholder="Optional" maxLength={12} />
          </div>
        </div>
      </div>

      {/* Section: Investment */}
      <div>
        <div className={sectionHeadClass}>Investment</div>
        <div className="grid grid-cols-5 gap-4">
          <div>
            <label className={labelClass}>Principal (₹) *</label>
            <input type="number" min="0" className={inputClass} value={form.principal_amount} onChange={e => update('principal_amount', e.target.value)} placeholder="5000000" />
          </div>
          <div>
            <label className={labelClass}>ROI % *</label>
            <input type="number" min="0" step="0.01" className={inputClass} value={form.roi_percentage} onChange={e => update('roi_percentage', e.target.value)} placeholder="12.5" />
          </div>
          <div>
            <label className={labelClass}>Payout</label>
            <select className={inputClass} value={form.payout_frequency} onChange={e => update('payout_frequency', e.target.value as FormState['payout_frequency'])}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="biannual">Biannual (6-monthly)</option>
              <option value="annual">Annual</option>
              <option value="cumulative">Cumulative</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Interest Type</label>
            <select className={inputClass} value={form.interest_type} onChange={e => update('interest_type', e.target.value as 'simple' | 'compound')}>
              <option value="simple">Simple</option>
              <option value="compound">Compound</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Start Date *</label>
            <input type="date" className={inputClass} value={form.investment_start_date} onChange={e => update('investment_start_date', e.target.value)} />
          </div>
        </div>
        <div className="grid grid-cols-5 gap-4 mt-4">
          <div>
            <label className={labelClass}>Maturity Date *</label>
            <input type="date" className={inputClass} value={form.maturity_date} onChange={e => update('maturity_date', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Live Payout Schedule */}
      {interestRows.length > 0 && (
        <div className="bg-surface border border-hairline rounded-sm overflow-hidden">
          <div className="px-4 py-3 bg-surface-2 border-b border-hairline flex items-center justify-between">
            <span className="text-[9px] font-bold uppercase tracking-widest text-ink-4">Payout Schedule — Live</span>
            <span className="text-[11px] font-bold text-forest num">{interestRows.length} rows · {fmtCurrency(totalNet)} total net</span>
          </div>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-surface-2/50">
                <th className="px-4 py-2 text-left text-ink-4 font-semibold">#</th>
                <th className="px-4 py-2 text-left text-ink-4 font-semibold">Period</th>
                <th className="px-4 py-2 text-right text-ink-4 font-semibold">Days</th>
                <th className="px-4 py-2 text-right text-ink-4 font-semibold">Gross</th>
                <th className="px-4 py-2 text-right text-ink-4 font-semibold">TDS</th>
                <th className="px-4 py-2 text-right text-ink-4 font-semibold">Net</th>
              </tr>
            </thead>
            <tbody>
              {interestRows.map((row, i) => (
                <tr key={i} className="border-t border-hairline hover:bg-surface-2/30">
                  <td className="px-4 py-2 text-ink-4">{i + 1}</td>
                  <td className="px-4 py-2 text-ink-3">{fmtDate(row.period_from)} – {fmtDate(row.period_to)}</td>
                  <td className="px-4 py-2 text-right num text-ink-3">{row.no_of_days}</td>
                  <td className="px-4 py-2 text-right num text-ink-3">{fmtCurrency(row.gross_interest)}</td>
                  <td className="px-4 py-2 text-right num text-rust/70">{fmtCurrency(row.tds_amount)}</td>
                  <td className="px-4 py-2 text-right num font-bold text-ink-1">{fmtCurrency(row.net_interest)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline-strong bg-surface-2/50">
                <td colSpan={3} className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-ink-4">Total</td>
                <td className="px-4 py-2 text-right num font-bold text-ink-3">{fmtCurrency(totalGross)}</td>
                <td className="px-4 py-2 text-right num font-bold text-rust/70">{fmtCurrency(totalTds)}</td>
                <td className="px-4 py-2 text-right num font-bold text-ink-1">{fmtCurrency(totalNet)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {schedule.length === 0 && (form.principal_amount || form.roi_percentage || form.investment_start_date || form.maturity_date) && (
        <div className="bg-surface border border-hairline rounded-sm px-4 py-6 text-center text-ink-4 text-sm">
          Fill in Principal, ROI %, Start Date, and Maturity Date to see the payout schedule.
        </div>
      )}

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="bg-rust-soft/20 border border-rust/20 rounded-sm px-4 py-3">
          {validationErrors.map((e, i) => (
            <p key={i} className="text-sm text-rust">{e}</p>
          ))}
        </div>
      )}

      {saveError && (
        <div className="bg-rust-soft/20 border border-rust/20 rounded-sm px-4 py-3">
          <p className="text-sm text-rust">{saveError}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-hairline">
        <button
          onClick={() => router.push('/agreements/new')}
          className="px-4 py-2 text-sm font-medium text-ink-3 hover:text-ink-1 border border-hairline rounded-sm hover:bg-surface-2 transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={handleExportPdf}
          disabled={exporting || saving}
          className="px-4 py-2 text-sm font-bold text-forest border border-forest/40 rounded-sm hover:bg-forest/5 transition-colors disabled:opacity-50"
        >
          {exporting ? 'Generating…' : 'Export PDF'}
        </button>
        <button
          onClick={handleCreate}
          disabled={saving || exporting}
          className="px-6 py-2 text-sm font-bold text-paper bg-forest rounded-sm hover:bg-forest/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Create Agreement →'}
        </button>
      </div>
    </div>
  )
}
