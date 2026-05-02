'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Download, ChevronLeft, Plus, X, ExternalLink } from 'lucide-react'
import type { ExtractedAgreement, ExtractedPayoutRow } from '@/lib/claude'
import PayoutScheduleTable from './PayoutScheduleTable'
import { validateExtraction } from '@/lib/extraction-validator'
import type { ExtractionFlag } from '@/lib/extraction-validator'
import { calculatePayoutSchedule } from '@/lib/payout-calculator'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
}

interface DuplicateMatch {
  id: string
  reference_id: string
  investor_name: string
  agreement_date: string
  principal_amount: number
  status: string
}

interface NomineeRow {
  name: string
  relationship: string
  share: string
  pan: string
}

interface PaymentEntryRow {
  date: string | null
  mode: string | null
  bank: string | null
  amount: number | null
}

interface ExtractionReviewProps {
  extracted: ExtractedAgreement
  fileUrl: string
  tempPath: string
  fileName: string
  file: File
  isDraft: boolean
  salespersonId: string | null
  salespersonCustom: string | null
  teamMembers: TeamMember[]
  onBack: () => void
}

type PayoutFrequency = 'quarterly' | 'annual' | 'cumulative' | 'monthly' | 'biannual'
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
  tds_filing_name: string
  nominees: NomineeRow[]
  principal_amount: string
  roi_percentage: string
  payout_frequency: PayoutFrequency
  interest_type: InterestType
  lock_in_years: string
  maturity_date: string
  payments: PaymentEntryRow[]
  payout_schedule: ExtractedPayoutRow[]
  is_draft: boolean
  mark_historical_paid: boolean
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

function FlagsPanel({
  flags,
  onFix,
  onAcceptAll,
  onReUpload,
}: {
  flags: ExtractionFlag[]
  onFix: (flagId: string, rowIndex: number) => void
  onAcceptAll: () => void
  onReUpload: () => void
}) {
  const pending = flags.filter(f => f.resolution === 'pending')
  if (pending.length === 0) return null

  const errors = pending.filter(f => f.severity === 'error')
  const warnings = pending.filter(f => f.severity === 'warning')
  const infos = pending.filter(f => f.severity === 'info')

  return (
    <div className="mb-6 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 bg-slate-800/50 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold text-slate-200">
            {pending.length} item{pending.length !== 1 ? 's' : ''} to review
          </h3>
          <div className="flex items-center gap-1.5 ml-2">
            {errors.length > 0 && <span className="px-1.5 py-0.5 rounded bg-red-900/40 text-red-400 text-[10px] font-bold uppercase">{errors.length} Errors</span>}
            {warnings.length > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-400 text-[10px] font-bold uppercase">{warnings.length} Warnings</span>}
            {infos.length > 0 && <span className="px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400 text-[10px] font-bold uppercase">{infos.length} Info</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onAcceptAll}
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Mark all as correct
          </button>
          <button
            type="button"
            onClick={onReUpload}
            className="text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
          >
            Re-upload
          </button>
        </div>
      </div>
      <div className="max-h-48 overflow-y-auto px-5 py-3 space-y-2.5">
        {pending.map(flag => (
          <div key={flag.id} className="flex items-start justify-between gap-4 group">
            <div className="space-y-0.5">
              <p className={`text-xs ${flag.severity === 'error' ? 'text-red-400' : flag.severity === 'warning' ? 'text-amber-400' : 'text-slate-300'}`}>
                {flag.message}
              </p>
              <p className="text-[10px] text-slate-500">
                Expected: <span className="text-emerald-500/80">{flag.expected}</span> · Found: <span className="text-red-500/80">{flag.found}</span>
              </p>
            </div>
            {flag.rowIndex !== null && (
              <button
                type="button"
                onClick={() => onFix(flag.id, flag.rowIndex!)}
                className="text-[10px] font-bold uppercase text-indigo-400 hover:text-indigo-300 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                Locate
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ExtractionReview({
  extracted,
  fileUrl,
  tempPath,
  fileName,
  file,
  isDraft,
  salespersonId,
  salespersonCustom,
  teamMembers,
  onBack,
}: ExtractionReviewProps) {
  const router = useRouter()
  const warnings: string[] = extracted.confidence_warnings ?? []

  const [form, setForm] = useState<FormState>(() => {
    const baseSchedule = [...(extracted.payout_schedule ?? [])]
    return {
      reference_id: generateRefId(),
      agreement_date: toDateInput(extracted.agreement_date),
      investment_start_date: toDateInput(extracted.investment_start_date),
      agreement_type: extracted.agreement_type ?? 'Investment Agreement',
      investor_name: extracted.investor_name ?? '',
      investor_pan: extracted.investor_pan ?? '',
      investor_aadhaar: extracted.investor_aadhaar ?? '',
      investor_address: extracted.investor_address ?? '',
      tds_filing_name: extracted.tds_filing_name ?? extracted.investor_name ?? '',
      nominees: (extracted.nominees ?? []).map(n => ({
        name: n.name ?? '',
        relationship: '',
        share: '',
        pan: n.pan ?? '',
      })),
      principal_amount: extracted.principal_amount != null ? String(extracted.principal_amount) : '',
      roi_percentage: extracted.roi_percentage != null ? String(extracted.roi_percentage) : '',
      payout_frequency: extracted.interest_type === 'compound' ? 'cumulative' : (extracted.payout_frequency ?? 'quarterly'),
      interest_type: extracted.interest_type ?? 'simple',
      lock_in_years: extracted.lock_in_years != null ? String(extracted.lock_in_years) : '',
      maturity_date: toDateInput(extracted.maturity_date),
      payments: (extracted.payments ?? []).map(p => ({
        date: toDateInput(p.date),
        mode: p.mode,
        bank: p.bank,
        amount: p.amount,
      })),
      payout_schedule: baseSchedule,
      is_draft: isDraft,
      mark_historical_paid: false,
      salesperson_id: salespersonId ?? '',
      salesperson_custom: salespersonCustom ?? '',
    }
  })

  const [flags, setFlags] = useState<ExtractionFlag[]>(() => validateExtraction({
    ...extracted,
    payout_schedule: form.payout_schedule
  }))

  // Re-validate and auto-generate schedule when core fields change
  useEffect(() => {
    let updatedSchedule = [...form.payout_schedule]
    let changed = false

    // Auto-generate full schedule if it's empty and we have enough data
    if (
      updatedSchedule.length === 0 &&
      form.principal_amount &&
      form.roi_percentage &&
      form.investment_start_date &&
      form.maturity_date
    ) {
      const generated = calculatePayoutSchedule({
        principal: Number(form.principal_amount),
        roiPercentage: Number(form.roi_percentage),
        payoutFrequency: form.payout_frequency,
        interestType: form.interest_type,
        startDate: form.investment_start_date,
        maturityDate: form.maturity_date,
      })
      updatedSchedule = generated.map(row => ({
        ...row,
        // Map PayoutRow to ExtractedPayoutRow (remove status)
        is_principal_repayment: row.is_principal_repayment,
      })) as ExtractedPayoutRow[]
      changed = true
    }

    // For cumulative/compound, ensure TDS-only rows are present if not already in the generated list
    const isCumulative = form.payout_frequency === 'cumulative' || form.interest_type === 'compound'
    if (isCumulative && form.investment_start_date && form.maturity_date) {
      // Dynamic import for the secondary TDS utility
      import('@/lib/tds-calculator').then(({ generateTdsOnlyRows }) => {
        const tdsRows = generateTdsOnlyRows({
          startDate: form.investment_start_date,
          maturityDate: form.maturity_date,
          principal: Number(form.principal_amount) || 0,
          roi: Number(form.roi_percentage) || 0,
          interestType: form.interest_type,
          agreementId: '',
        })

        let tdsChanged = false
        for (const tds of tdsRows) {
          if (!updatedSchedule.some(r => r.is_tds_only && r.period_to === tds.period_to)) {
            updatedSchedule.push({ ...tds, is_principal_repayment: false })
            tdsChanged = true
          }
        }
        if (tdsChanged) {
          updatedSchedule.sort((a, b) => a.due_by.localeCompare(b.due_by))
          setForm(f => ({ ...f, payout_schedule: updatedSchedule }))
        }
      })
    }

    if (changed) {
      setForm(f => ({ ...f, payout_schedule: updatedSchedule }))
    }

    setFlags(validateExtraction({
      ...extracted,
      agreement_date: form.agreement_date,
      investment_start_date: form.investment_start_date,
      maturity_date: form.maturity_date,
      principal_amount: Number(form.principal_amount) || 0,
      roi_percentage: Number(form.roi_percentage) || 0,
      payout_schedule: updatedSchedule
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.agreement_date, form.investment_start_date, form.maturity_date, form.principal_amount, form.roi_percentage, form.payout_frequency, form.interest_type, extracted])

  const unresolvedCount = flags.filter(f => f.resolution === 'pending').length

  function handleFlagFix(flagId: string, rowIndex: number) {
    const rowEl = document.getElementById(`payout-row-${rowIndex}`)
    rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    rowEl?.classList.add('ring-2', 'ring-red-500')
    setTimeout(() => rowEl?.classList.remove('ring-2', 'ring-red-500'), 3000)
    setFlags(prev => prev.map(f => f.id === flagId ? { ...f, resolution: 'fixed' } : f))
  }

  function handleAcceptAll() {
    setFlags(prev => prev.map(f => ({ ...f, resolution: 'accepted' })))
  }
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [docxHtml, setDocxHtml] = useState<string | null>(null)
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null)
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([])
  const [bypassDuplicate, setBypassDuplicate] = useState(false)

  // For PDF: create a local object URL so the iframe works without auth headers
  // For DOCX: convert to HTML via mammoth in the browser
  useEffect(() => {
    const isDocx = fileName.toLowerCase().endsWith('.docx')
    const isPdfFile = fileName.toLowerCase().endsWith('.pdf')

    if (isPdfFile) {
      const url = URL.createObjectURL(file)
      setPdfObjectUrl(url)
      return () => URL.revokeObjectURL(url)
    } else if (isDocx) {
      let cancelled = false
      file.arrayBuffer().then(async (buf) => {
        if (cancelled) return
        try {
          const mammoth = await import('mammoth')
          const result = await mammoth.convertToHtml({ arrayBuffer: buf })
          if (!cancelled) setDocxHtml(result.value)
        } catch {
          if (!cancelled) setDocxHtml('<p style="color:#94a3b8">Could not render DOCX preview.</p>')
        }
      })
      return () => { cancelled = true }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Check for duplicate agreements on mount
  useEffect(() => {
    const name = extracted.investor_name?.trim()
    const date = extracted.agreement_date?.trim()
    if (!name || !date) return

    const params = new URLSearchParams({ investor_name: name, agreement_date: date })
    if (extracted.investor_pan?.trim()) {
      params.set('investor_pan', extracted.investor_pan.trim())
    }

    fetch(`/api/agreements/check-duplicate?${params}`)
      .then(r => r.json())
      .then((d: { duplicates?: DuplicateMatch[] }) => {
        if (d.duplicates && d.duplicates.length > 0) setDuplicates(d.duplicates)
      })
      .catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function updateNominee(idx: number, field: keyof NomineeRow, value: string) {
    setForm(prev => {
      const nominees = [...prev.nominees]
      nominees[idx] = { ...nominees[idx], [field]: value }
      return { ...prev, nominees }
    })
  }

  function addNominee() {
    setForm(prev => ({
      ...prev,
      nominees: [...prev.nominees, { name: '', relationship: '', share: '', pan: '' }],
    }))
  }

  function removeNominee(idx: number) {
    setForm(prev => ({
      ...prev,
      nominees: prev.nominees.filter((_, i) => i !== idx),
    }))
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

    // Require duplicate confirmation before saving
    if (duplicates.length > 0 && !bypassDuplicate) {
      setSaveError('Possible duplicate detected. Please check the box below to confirm this is a new agreement.')
      return
    }

    // Build nominees array from structured rows (drop empty-name rows)
    const nominees = form.nominees
      .filter(n => n.name.trim())
      .map(n => ({
        name: n.name.trim(),
        ...(n.relationship.trim() ? { relationship: n.relationship.trim() } : {}),
        ...(n.pan.trim() ? { pan: n.pan.trim() } : {}),
        ...(n.share.trim() && !isNaN(parseFloat(n.share)) ? { share: parseFloat(n.share) } : {}),
      }))

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
        force: bypassDuplicate,
        reference_id: form.reference_id,
        agreement_date: form.agreement_date,
        investment_start_date: form.investment_start_date,
        agreement_type: form.agreement_type,
        is_draft: form.is_draft,
        investor_name: form.investor_name,
        investor_pan: form.investor_pan || null,
        investor_aadhaar: form.investor_aadhaar || null,
        investor_address: form.investor_address || null,
        tds_filing_name: form.tds_filing_name || null,
        nominees,
        principal_amount: principalVal,
        roi_percentage: roiVal,
        payout_frequency: form.payout_frequency,
        interest_type: form.interest_type,
        lock_in_years: lockInVal,
        maturity_date: form.maturity_date,
        payments: form.payments,
        salesperson_id: (form.salesperson_id === '' || form.salesperson_id === 'other') ? null : (form.salesperson_id || null),
        salesperson_custom: form.salesperson_custom || null,
        temp_path: tempPath,
        payout_schedule: form.payout_schedule,
        mark_historical_paid: form.mark_historical_paid,
      }

      const res = await fetch('/api/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.status === 409) {
        const data = await res.json().catch(() => ({}))
        if (data.duplicates?.length) setDuplicates(data.duplicates)
        setSaveError('Possible duplicate detected. Please check the box below to confirm this is a new agreement.')
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `Save failed (${res.status})`)
      }

      const created = await res.json()
      if (!created?.id) throw new Error('Agreement saved but ID missing in response.')
      router.push(`/agreements/${created.id}?new=1`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unknown error saving agreement')
    } finally {
      setSaving(false)
    }
  }

  const isPdf = fileName.toLowerCase().endsWith('.pdf')
  const isDocx = fileName.toLowerCase().endsWith('.docx')
  const salespersonOptions = teamMembers.filter(m => (m.role === 'salesperson' || m.role === 'coordinator') && m.is_active)

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
              Gemini flagged some uncertainty — please verify the highlighted fields.
            </p>
            <ul className="text-xs text-amber-200/80 space-y-0.5 list-disc list-inside">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <FlagsPanel
        flags={flags}
        onFix={handleFlagFix}
        onAcceptAll={handleAcceptAll}
        onReUpload={onBack}
      />

      {/* Duplicate warning banner */}
      {duplicates.length > 0 && (
        <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 space-y-3">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-300 mb-1">
                Possible duplicate — this investor already has an agreement on this date
              </p>
              <div className="space-y-1">
                {duplicates.map(d => (
                  <div key={d.id} className="flex items-center gap-2 text-xs text-red-200/80">
                    <span className="font-mono">{d.reference_id}</span>
                    <span>—</span>
                    <span>{d.investor_name}</span>
                    <span>·</span>
                    <span>{d.agreement_date}</span>
                    <span>·</span>
                    <span>₹{Number(d.principal_amount).toLocaleString('en-IN')}</span>
                    <a
                      href={`/agreements/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-1 inline-flex items-center gap-0.5 text-red-300 hover:text-red-100 transition-colors"
                    >
                      View <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer pl-8">
            <input
              type="checkbox"
              checked={bypassDuplicate}
              onChange={e => {
                setBypassDuplicate(e.target.checked)
                if (e.target.checked) setSaveError(null)
              }}
              className="accent-red-400 w-4 h-4 flex-shrink-0"
            />
            <span className="text-xs text-red-200">
              I confirm this is a new agreement and not a duplicate of the above
            </span>
          </label>
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
                {(() => {
                  if (!form.investment_start_date) return null
                  const firstPeriodFrom = extracted.payout_schedule?.[0]?.period_from
                  const paymentDates = (extracted.payments ?? []).map(p => p.date).filter(Boolean)
                  const matchesPeriodFrom = firstPeriodFrom && form.investment_start_date === toDateInput(firstPeriodFrom)
                  const differsFromAllPayments = paymentDates.length > 0 && paymentDates.every(d => toDateInput(d) !== form.investment_start_date)
                  if (matchesPeriodFrom || differsFromAllPayments) {
                    return (
                      <p className="text-xs text-amber-400 mt-1 flex items-start gap-1">
                        <span>⚠</span>
                        <span>
                          {matchesPeriodFrom
                            ? 'This matches the payout schedule start — verify it reflects when funds were actually received, not a calendar alignment date.'
                            : 'This date differs from the payment dates in the document — verify it is correct.'}
                          {paymentDates.length > 0 && ` Payment date(s) found: ${paymentDates.map(d => toDateInput(d)).join(', ')}`}
                        </span>
                      </p>
                    )
                  }
                  return null
                })()}
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

            <div className="space-y-1">
              <label className="text-xs text-slate-400">TDS Filing Name</label>
              <input
                type="text"
                value={form.tds_filing_name}
                onChange={e => update('tds_filing_name', e.target.value)}
                className={fieldClass('tds_filing_name', 'w-full')}
              />
            </div>

            {/* Nominees */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs text-slate-400">Nominees</label>
                <button
                  type="button"
                  onClick={addNominee}
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Nominee
                </button>
              </div>

              {form.nominees.length === 0 ? (
                <p className="text-xs text-slate-500 italic">No nominees — click &ldquo;Add Nominee&rdquo; to add one.</p>
              ) : (
                <div className="space-y-3">
                  {form.nominees.map((nominee, idx) => (
                    <div key={idx} className="relative bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2">
                      <button
                        type="button"
                        onClick={() => removeNominee(idx)}
                        className="absolute top-2 right-2 text-slate-500 hover:text-red-400 transition-colors"
                        title="Remove nominee"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <p className="text-xs font-medium text-slate-400">Nominee {idx + 1}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">Name</label>
                          <input
                            type="text"
                            value={nominee.name}
                            onChange={e => updateNominee(idx, 'name', e.target.value)}
                            placeholder="Full name"
                            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">PAN</label>
                          <input
                            type="text"
                            value={nominee.pan}
                            onChange={e => updateNominee(idx, 'pan', e.target.value)}
                            placeholder="PAN number"
                            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">Relationship</label>
                          <input
                            type="text"
                            value={nominee.relationship}
                            onChange={e => updateNominee(idx, 'relationship', e.target.value)}
                            placeholder="e.g. Spouse, Son"
                            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-0.5 block">Share %</label>
                          <input
                            type="number"
                            value={nominee.share}
                            onChange={e => updateNominee(idx, 'share', e.target.value)}
                            placeholder="e.g. 100"
                            min={0}
                            max={100}
                            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="biannual">Biannual (6-monthly)</option>
                  <option value="annual">Annual</option>
                  <option value="cumulative">Cumulative</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Interest Type</label>
                <select
                  value={form.interest_type}
                  onChange={e => {
                    const val = e.target.value as InterestType
                    update('interest_type', val)
                    if (val === 'compound') update('payout_frequency', 'cumulative')
                  }}
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
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Payments</h2>
              <button
                type="button"
                onClick={() => setForm(f => ({
                  ...f,
                  payments: [...f.payments, { date: null, mode: null, bank: null, amount: null }]
                }))}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
              >
                + Add payment
              </button>
            </div>

            {form.payments.length === 0 && (
              <p className="text-xs text-slate-600 italic">No payments recorded</p>
            )}

            <div className="space-y-3">
              {form.payments.map((p, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-start bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 relative group">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-semibold">Date</label>
                    <input
                      type="date"
                      value={p.date ?? ''}
                      onChange={e => {
                        const updated = [...form.payments]
                        updated[i] = { ...updated[i], date: e.target.value || null }
                        setForm(f => ({ ...f, payments: updated }))
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-semibold">Mode</label>
                    <input
                      type="text"
                      value={p.mode ?? ''}
                      onChange={e => {
                        const updated = [...form.payments]
                        updated[i] = { ...updated[i], mode: e.target.value || null }
                        setForm(f => ({ ...f, payments: updated }))
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                      placeholder="NEFT, RTGS..."
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase font-semibold">Bank</label>
                    <input
                      type="text"
                      value={p.bank ?? ''}
                      onChange={e => {
                        const updated = [...form.payments]
                        updated[i] = { ...updated[i], bank: e.target.value || null }
                        setForm(f => ({ ...f, payments: updated }))
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                      placeholder="Bank name"
                    />
                  </div>
                  <div className="space-y-1 pr-6">
                    <label className="text-[10px] text-slate-500 uppercase font-semibold">Amount (₹)</label>
                    <input
                      type="number"
                      value={p.amount ?? ''}
                      onChange={e => {
                        const updated = [...form.payments]
                        updated[i] = { ...updated[i], amount: e.target.value ? Number(e.target.value) : null }
                        setForm(f => ({ ...f, payments: updated }))
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white"
                      placeholder="0.00"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({
                      ...f,
                      payments: f.payments.filter((_, j) => j !== i)
                    }))}
                    className="absolute top-2 right-2 text-slate-600 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove payment"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Agreement Settings */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Agreement Settings</h2>

            <div className="pb-2">
              {/* Salesperson display */}
              <div className="space-y-0.5">
                <label className="text-[10px] text-slate-500 uppercase font-bold">Salesperson</label>
                <p className="text-sm text-slate-200">
                  {form.salesperson_id === 'other' || !form.salesperson_id
                    ? (form.salesperson_custom || '— None —')
                    : (salespersonOptions.find(m => m.id === form.salesperson_id)?.name || '— None —')
                  }
                </p>
              </div>
            </div>

            {/* Mark historical payouts as paid */}
            <label className="flex items-start gap-3 cursor-pointer border-t border-slate-700/50 pt-4">
              <input
                type="checkbox"
                checked={form.mark_historical_paid}
                onChange={e => update('mark_historical_paid', e.target.checked)}
                className="accent-emerald-500 w-4 h-4 mt-0.5"
              />
              <span className="text-sm text-slate-100">
                Mark all past payouts as paid
                <span className="block text-xs text-slate-400 mt-0.5">For existing agreements — marks all payout rows with due date before today as paid</span>
              </span>
            </label>
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

          {/* Save & Cancel buttons */}
          <div className="flex gap-3">
            <a
              href="/agreements"
              className="px-6 py-3 rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 text-sm font-semibold transition-colors flex items-center justify-center"
            >
              Cancel
            </a>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-3 px-6 bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors text-sm"
            >
              {saving
                ? 'Saving...'
                : unresolvedCount > 0
                ? `Save with ${unresolvedCount} item${unresolvedCount !== 1 ? 's' : ''} to review`
                : duplicates.length > 0 && !bypassDuplicate
                ? 'Duplicate Detected — Confirm Below First'
                : 'Save Agreement'}
            </button>
          </div>
        </div>

        {/* Right: Document Preview (40%) */}
        <div className="xl:col-span-2 space-y-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3 sticky top-6">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Document Preview</h2>

            {isPdf ? (
              <iframe
                src={pdfObjectUrl ?? fileUrl}
                title="Agreement document preview"
                className="w-full rounded-lg bg-slate-900"
                style={{ height: '600px', border: 'none' }}
              />
            ) : isDocx && docxHtml ? (
              <div
                className="w-full rounded-lg bg-white text-slate-900 overflow-auto p-4 text-sm"
                style={{ height: '600px' }}
                dangerouslySetInnerHTML={{ __html: docxHtml }}
              />
            ) : isDocx ? (
              <div className="flex items-center justify-center rounded-lg bg-slate-900 border border-slate-700 py-16 text-center">
                <div>
                  <p className="text-slate-400 text-sm">Rendering DOCX preview…</p>
                </div>
              </div>
            ) : null}

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
            <span className="ml-2 text-xs text-slate-500 normal-case font-normal">(extracted + auto-generated)</span>
          </h2>
          <PayoutScheduleTable payouts={form.payout_schedule} principalAmount={Number(form.principal_amount) || undefined} />
        </div>
      )}
    </div>
  )
}
