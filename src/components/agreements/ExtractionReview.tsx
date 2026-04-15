'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Download, ChevronLeft } from 'lucide-react'
import type { ExtractedAgreement } from '@/lib/claude'
import PayoutScheduleTable from './PayoutScheduleTable'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
}

interface ExtractionReviewProps {
  extracted: ExtractedAgreement
  fileUrl: string
  fileName: string
  isDraft: boolean
  salespersonId: string | null
  salespersonCustom: string | null
  teamMembers: TeamMember[]
  onBack: () => void
}

type PayoutFrequency = 'quarterly' | 'annual' | 'cumulative'
type InterestType = 'simple' | 'compound'

interface FormState {
  reference_id: string
  agreement_date: string
  investment_start_date: string
  agreement_type: string
  investor_name: string
  investor_pan: string
  investor_aadhaar: string
  investor_address: string
  investor_relationship: string
  investor_parent_name: string
  nominees_json: string
  principal_amount: string
  roi_percentage: string
  payout_frequency: PayoutFrequency
  interest_type: InterestType
  lock_in_years: string
  maturity_date: string
  payment_date: string
  payment_mode: string
  payment_bank: string
  is_draft: boolean
  salesperson_id: string
  salesperson_custom: string
}

function generateRefId(): string {
  const ts = Date.now().toString(36).toUpperCase()
  return `GEI-${ts}`
}

function toDateInput(val: string | null | undefined): string {
  if (!val) return ''
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
  try {
    return new Date(val).toISOString().split('T')[0]
  } catch {
    return ''
  }
}

const REQUIRED_FIELDS: Array<keyof FormState> = [
  'investor_name',
  'principal_amount',
  'roi_percentage',
  'payout_frequency',
  'lock_in_years',
  'maturity_date',
  'agreement_date',
  'investment_start_date',
  'reference_id',
]

const FIELD_LABELS: Partial<Record<keyof FormState, string>> = {
  investor_name: 'Investor Name',
  principal_amount: 'Principal Amount',
  roi_percentage: 'ROI Percentage',
  payout_frequency: 'Payout Frequency',
  lock_in_years: 'Lock-in Years',
  maturity_date: 'Maturity Date',
  agreement_date: 'Agreement Date',
  investment_start_date: 'Investment Start Date',
  reference_id: 'Reference ID',
}

function fieldMentionedInWarning(field: keyof FormState, warnings: string[]): boolean {
  const label = FIELD_LABELS[field] ?? field
  return warnings.some(w =>
    w.toLowerCase().includes(label.toLowerCase()) ||
    w.toLowerCase().includes(field.toLowerCase().replace('_', ' '))
  )
}

export default function ExtractionReview({
  extracted,
  fileUrl,
  fileName,
  isDraft,
  salespersonId,
  salespersonCustom,
  teamMembers,
  onBack,
}: ExtractionReviewProps) {
  const router = useRouter()
  const warnings: string[] = extracted.confidence_warnings ?? []

  const [form, setForm] = useState<FormState>({
    reference_id: generateRefId(),
    agreement_date: toDateInput(extracted.agreement_date),
    investment_start_date: toDateInput(extracted.investment_start_date),
    agreement_type: extracted.agreement_type ?? 'Investment Agreement',
    investor_name: extracted.investor_name ?? '',
    investor_pan: extracted.investor_pan ?? '',
    investor_aadhaar: extracted.investor_aadhaar ?? '',
    investor_address: extracted.investor_address ?? '',
    investor_relationship: extracted.investor_relationship ?? '',
    investor_parent_name: extracted.investor_parent_name ?? '',
    nominees_json: JSON.stringify(extracted.nominees ?? [], null, 2),
    principal_amount: extracted.principal_amount != null ? String(extracted.principal_amount) : '',
    roi_percentage: extracted.roi_percentage != null ? String(extracted.roi_percentage) : '',
    payout_frequency: extracted.payout_frequency ?? 'quarterly',
    interest_type: extracted.interest_type ?? 'simple',
    lock_in_years: extracted.lock_in_years != null ? String(extracted.lock_in_years) : '',
    maturity_date: toDateInput(extracted.maturity_date),
    payment_date: toDateInput(extracted.payment_date),
    payment_mode: extracted.payment_mode ?? '',
    payment_bank: extracted.payment_bank ?? '',
    is_draft: isDraft,
    salesperson_id: salespersonId ?? '',
    salesperson_custom: salespersonCustom ?? '',
  })

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function fieldClass(field: keyof FormState, base: string = ''): string {
    const warned = warnings.length > 0 && fieldMentionedInWarning(field, warnings)
    return `${base} bg-slate-900 border rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
      warned ? 'border-amber-500 ring-1 ring-amber-500/40' : 'border-slate-600'
    }`
  }

  async function handleSave() {
    setSaveError(null)
    setValidationErrors([])

    // Validate required
    const missing = REQUIRED_FIELDS.filter(f => {
      const val = form[f]
      return val === '' || val === null || val === undefined
    })

    if (missing.length > 0) {
      setValidationErrors(missing.map(f => FIELD_LABELS[f] ?? f))
      return
    }

    // Parse nominees JSON
    let nominees: unknown[] = []
    try {
      nominees = JSON.parse(form.nominees_json)
    } catch {
      setSaveError('Nominees JSON is invalid. Please fix it before saving.')
      return
    }

    if (!Array.isArray(nominees)) {
      setSaveError('Nominees must be a JSON array (e.g. []). Please fix it before saving.')
      return
    }

    // Validate numeric fields before POST
    const principalVal = parseFloat(form.principal_amount)
    const roiVal = parseFloat(form.roi_percentage)
    const lockInVal = parseInt(form.lock_in_years, 10)

    if (isNaN(principalVal) || isNaN(roiVal) || isNaN(lockInVal)) {
      setSaveError('Principal Amount, ROI Percentage, and Lock-in Years must be valid numbers.')
      return
    }

    setSaving(true)
    try {
      const body = {
        reference_id: form.reference_id,
        agreement_date: form.agreement_date,
        investment_start_date: form.investment_start_date,
        agreement_type: form.agreement_type,
        is_draft: form.is_draft,
        investor_name: form.investor_name,
        investor_pan: form.investor_pan || null,
        investor_aadhaar: form.investor_aadhaar || null,
        investor_address: form.investor_address || null,
        investor_relationship: form.investor_relationship || null,
        investor_parent_name: form.investor_parent_name || null,
        nominees,
        principal_amount: principalVal,
        roi_percentage: roiVal,
        payout_frequency: form.payout_frequency,
        interest_type: form.interest_type,
        lock_in_years: lockInVal,
        maturity_date: form.maturity_date,
        payment_date: form.payment_date || null,
        payment_mode: form.payment_mode || null,
        payment_bank: form.payment_bank || null,
        salesperson_id: (form.salesperson_id === '' || form.salesperson_id === 'other') ? null : (form.salesperson_id || null),
        salesperson_custom: form.salesperson_custom || null,
        document_url: fileUrl,
        payout_schedule: extracted.payout_schedule ?? [],
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

  const isPdf = fileName.toLowerCase().endsWith('.pdf')
  const salespersonOptions = teamMembers.filter(m => m.role === 'salesperson' && m.is_active)

  return (
    <div className="space-y-6">
      {/* Back link */}
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-100 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Upload
      </button>

      {/* Confidence warnings banner */}
      {warnings.length > 0 && (
        <div className="bg-amber-900/30 border border-amber-700 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-300 mb-1">
              Claude flagged some uncertainty — please verify the highlighted fields.
            </p>
            <ul className="text-xs text-amber-200/80 space-y-0.5 list-disc list-inside">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Draft badge */}
      {form.is_draft && (
        <div className="bg-amber-900/20 border border-amber-700 rounded-xl px-4 py-2 flex items-center gap-2">
          <span className="inline-block px-2 py-0.5 bg-amber-500/30 text-amber-400 text-xs rounded font-bold">DRAFT</span>
          <span className="text-xs text-amber-300">This agreement is being saved as a draft. It will be marked pending signature.</span>
        </div>
      )}

      {/* Two-column layout */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Left: Form (60%) */}
        <div className="xl:col-span-3 space-y-5">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Agreement Details</h2>

            {/* Reference ID */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Reference ID (auto-generated)</label>
              <input
                type="text"
                value={form.reference_id}
                readOnly
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 opacity-70 cursor-not-allowed"
              />
            </div>

            {/* Dates row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Agreement Date</label>
                <input
                  type="date"
                  value={form.agreement_date}
                  onChange={e => update('agreement_date', e.target.value)}
                  className={fieldClass('agreement_date', 'w-full')}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Investment Start Date</label>
                <input
                  type="date"
                  value={form.investment_start_date}
                  onChange={e => update('investment_start_date', e.target.value)}
                  className={fieldClass('investment_start_date', 'w-full')}
                />
              </div>
            </div>

            {/* Agreement Type */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Agreement Type</label>
              <input
                type="text"
                value={form.agreement_type}
                onChange={e => update('agreement_type', e.target.value)}
                className={fieldClass('agreement_type', 'w-full')}
              />
            </div>
          </div>

          {/* Investor Details */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Investor Details</h2>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Investor Name *</label>
              <input
                type="text"
                value={form.investor_name}
                onChange={e => update('investor_name', e.target.value)}
                className={fieldClass('investor_name', 'w-full')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">PAN</label>
                <input
                  type="text"
                  value={form.investor_pan}
                  onChange={e => update('investor_pan', e.target.value)}
                  className={fieldClass('investor_pan', 'w-full')}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Aadhaar</label>
                <input
                  type="text"
                  value={form.investor_aadhaar}
                  onChange={e => update('investor_aadhaar', e.target.value)}
                  className={fieldClass('investor_aadhaar', 'w-full')}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Address</label>
              <textarea
                rows={3}
                value={form.investor_address}
                onChange={e => update('investor_address', e.target.value)}
                className={fieldClass('investor_address', 'w-full resize-none')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Relationship (S/o, D/o, W/o)</label>
                <input
                  type="text"
                  value={form.investor_relationship}
                  onChange={e => update('investor_relationship', e.target.value)}
                  className={fieldClass('investor_relationship', 'w-full')}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Parent / Guardian Name</label>
                <input
                  type="text"
                  value={form.investor_parent_name}
                  onChange={e => update('investor_parent_name', e.target.value)}
                  className={fieldClass('investor_parent_name', 'w-full')}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Nominees (JSON)</label>
              <textarea
                rows={4}
                value={form.nominees_json}
                onChange={e => update('nominees_json', e.target.value)}
                className={fieldClass('nominees_json', 'w-full resize-none font-mono text-xs')}
                spellCheck={false}
              />
            </div>
          </div>

          {/* Financial Terms */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Financial Terms</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Principal Amount (₹) *</label>
                <input
                  type="number"
                  value={form.principal_amount}
                  onChange={e => update('principal_amount', e.target.value)}
                  className={fieldClass('principal_amount', 'w-full')}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">ROI % *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.roi_percentage}
                  onChange={e => update('roi_percentage', e.target.value)}
                  className={fieldClass('roi_percentage', 'w-full')}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Payout Frequency *</label>
                <select
                  value={form.payout_frequency}
                  onChange={e => update('payout_frequency', e.target.value as PayoutFrequency)}
                  className={fieldClass('payout_frequency', 'w-full')}
                >
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                  <option value="cumulative">Cumulative</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Interest Type</label>
                <select
                  value={form.interest_type}
                  onChange={e => update('interest_type', e.target.value as InterestType)}
                  className={fieldClass('interest_type', 'w-full')}
                >
                  <option value="simple">Simple</option>
                  <option value="compound">Compound</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Lock-in Years *</label>
                <input
                  type="number"
                  step="0.5"
                  value={form.lock_in_years}
                  onChange={e => update('lock_in_years', e.target.value)}
                  className={fieldClass('lock_in_years', 'w-full')}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Maturity Date *</label>
                <input
                  type="date"
                  value={form.maturity_date}
                  onChange={e => update('maturity_date', e.target.value)}
                  className={fieldClass('maturity_date', 'w-full')}
                />
              </div>
            </div>
          </div>

          {/* Payment Info */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Payment Info</h2>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Payment Date</label>
              <input
                type="date"
                value={form.payment_date}
                onChange={e => update('payment_date', e.target.value)}
                className={fieldClass('payment_date', 'w-full')}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Payment Mode</label>
                <input
                  type="text"
                  value={form.payment_mode}
                  onChange={e => update('payment_mode', e.target.value)}
                  className={fieldClass('payment_mode', 'w-full')}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Payment Bank</label>
                <input
                  type="text"
                  value={form.payment_bank}
                  onChange={e => update('payment_bank', e.target.value)}
                  className={fieldClass('payment_bank', 'w-full')}
                />
              </div>
            </div>
          </div>

          {/* Meta */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Meta</h2>

            {/* Is Draft checkbox */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_draft}
                onChange={e => update('is_draft', e.target.checked)}
                className="accent-amber-500 w-4 h-4"
              />
              <span className="text-sm text-slate-100">Is Draft</span>
            </label>

            {/* Salesperson */}
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Salesperson</label>
              <select
                value={form.salesperson_id}
                onChange={e => update('salesperson_id', e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— None —</option>
                {salespersonOptions.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
                <option value="other">Other (custom)</option>
              </select>
              {form.salesperson_id === 'other' && (
                <input
                  type="text"
                  placeholder="Enter salesperson name"
                  value={form.salesperson_custom}
                  onChange={e => update('salesperson_custom', e.target.value)}
                  className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 mt-2"
                />
              )}
            </div>
          </div>

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-4">
              <p className="text-sm font-semibold text-red-300 mb-1">Required fields missing:</p>
              <ul className="text-xs text-red-200/80 list-disc list-inside space-y-0.5">
                {validationErrors.map(f => <li key={f}>{f}</li>)}
              </ul>
            </div>
          )}

          {saveError && (
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-sm text-red-300">
              {saveError}
            </div>
          )}

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 px-6 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors text-sm"
          >
            {saving ? 'Saving...' : 'Save Agreement'}
          </button>
        </div>

        {/* Right: Document Preview (40%) */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3 sticky top-6">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Document Preview</h2>

            {isPdf ? (
              <iframe
                src={fileUrl}
                title="Agreement document preview"
                className="w-full rounded-lg bg-slate-900"
                style={{ height: '600px', border: 'none' }}
              />
            ) : (
              <div className="flex items-center justify-center rounded-lg bg-slate-900 border border-slate-700 py-16 text-center">
                <div>
                  <p className="text-slate-400 text-sm">DOCX preview not available</p>
                  <p className="text-slate-500 text-xs mt-1">Extraction complete</p>
                </div>
              </div>
            )}

            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download original document
            </a>
          </div>
        </div>
      </div>

      {/* Payout Schedule */}
      {(extracted.payout_schedule ?? []).length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Payout Schedule
            <span className="ml-2 text-xs text-slate-500 normal-case font-normal">(read-only — extracted from document)</span>
          </h2>
          <PayoutScheduleTable rows={extracted.payout_schedule ?? []} />
        </div>
      )}
    </div>
  )
}
