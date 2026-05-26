# Calculator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a calculator-based path for creating agreements from scratch inside `/agreements/new`, alongside the existing upload/scan path.

**Architecture:** `/agreements/new` becomes a two-option entry screen. "Enter Details" opens a new `/agreements/new/calculator` page with a `CalculatorForm` component — three compact input sections (Agreement, Investor, Investment) above a live payout schedule table. "Create Agreement" posts directly to the existing `POST /api/agreements` endpoint. "Export PDF" hits a new API route that returns a downloadable info sheet.

**Tech Stack:** Next.js 14 App Router · React · Tailwind CSS · `@react-pdf/renderer` (Task 5) · existing `calculatePayoutSchedule()` · existing `POST /api/agreements`

---

## Before You Start

Create the feature branch:

```bash
git checkout -b feature/batch-d-calculator
```

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `src/app/(app)/agreements/new/page.tsx` | Modify | Replace single-step with two-option entry screen |
| `src/app/(app)/agreements/new/calculator/page.tsx` | Create | Thin shell — fetches team members, renders CalculatorForm |
| `src/components/agreements/CalculatorForm.tsx` | Create | Form inputs + live schedule + Create Agreement + Export PDF |
| `src/app/api/agreements/pdf-info-sheet/route.ts` | Create | POST endpoint — accepts agreement data, returns PDF download |
| `src/lib/pdf-info-sheet.tsx` | Create | `@react-pdf/renderer` template for the info sheet |
| `src/__tests__/calculator-form.test.ts` | Create | Unit tests for form validation helpers |

---

## Task 1: Update `/agreements/new` entry screen

**Files:**
- Modify: `src/app/(app)/agreements/new/page.tsx`

- [ ] **Read the current file**

Read `src/app/(app)/agreements/new/page.tsx` in full before making any changes.

- [ ] **Replace the page content**

The page currently renders `<UploadStep>` directly. Replace the entire page so that when `step === 'upload'` and `entryChoice === null`, it shows two equal option cards. Selecting "Upload Document" sets `entryChoice = 'upload'` and proceeds to the existing `<UploadStep>`. Selecting "Enter Details" navigates to `/agreements/new/calculator`.

Replace the full file content with:

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, FileText, Calculator } from 'lucide-react'
import UploadStep from '@/components/agreements/UploadStep'
import ExtractionReview from '@/components/agreements/ExtractionReview'
import type { ExtractedAgreement } from '@/lib/claude'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
}

type Step = 'choose' | 'upload' | 'loading' | 'review'

interface ExtractResult {
  extracted: ExtractedAgreement
  file_url: string
  temp_path: string
}

export default function NewAgreementPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('choose')
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [teamLoading, setTeamLoading] = useState(true)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isDraft, setIsDraft] = useState(false)
  const [salespersonId, setSalespersonId] = useState<string | null>(null)
  const [salespersonCustom, setSalespersonCustom] = useState<string | null>(null)
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/team')
      .then(r => r.json())
      .then((data: TeamMember[]) => setTeamMembers(Array.isArray(data) ? data : []))
      .catch(() => setTeamMembers([]))
      .finally(() => setTeamLoading(false))
  }, [])

  async function handleExtract(params: {
    file: File
    isDraft: boolean
    salespersonId: string | null
    salespersonCustom: string | null
  }) {
    setUploadError(null)
    setFile(params.file)
    setIsDraft(params.isDraft)
    setSalespersonId(params.salespersonId)
    setSalespersonCustom(params.salespersonCustom)
    setStep('loading')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const formData = new FormData()
      formData.append('file', params.file)
      formData.append('is_draft', String(params.isDraft))

      const res = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      if (res.redirected) { window.location.href = res.url; return }

      const contentType = res.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Extraction failed (${res.status})`)
        setExtractResult(data as ExtractResult)
        setStep('review')
      } else {
        const text = await res.text()
        const isErrorPage = text.includes('An error occurred') || text.includes('<!DOCTYPE html>')
        throw new Error(isErrorPage ? `Server error (${res.status}).` : `Unexpected response: ${text.slice(0, 50)}...`)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setUploadError(err instanceof Error ? err.message : 'Extraction failed. Please try again.')
      setStep('upload')
    } finally {
      abortRef.current = null
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
    abortRef.current = null
    setExtractResult(null)
    setUploadError(null)
    setStep('choose')
  }

  function handleBack() {
    setExtractResult(null)
    setStep('choose')
  }

  return (
    <div className="p-8 min-h-screen bg-canvas">
      <div className="mb-6 border-b border-ink-1 pb-3">
        <h1 className="text-[28px] font-semibold text-ink-1 font-serif tracking-tight">New Agreement</h1>
        <p className="text-xs text-ink-4 mt-0.5">Create a new investment agreement record</p>
      </div>

      {step === 'choose' && (
        <div className="max-w-2xl">
          <p className="text-sm text-ink-3 mb-6">Choose how to add this agreement</p>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setStep('upload')}
              className="text-left bg-surface border border-hairline rounded-sm p-6 hover:border-forest hover:bg-surface-2 transition-all group"
            >
              <div className="w-9 h-9 bg-surface-2 rounded-sm flex items-center justify-center mb-4">
                <FileText className="w-4 h-4 text-ink-3 group-hover:text-forest" />
              </div>
              <div className="font-bold text-ink-1 text-sm mb-1">Upload Document</div>
              <div className="text-xs text-ink-4 leading-relaxed">Scan an existing signed agreement — Gemini extracts all details automatically.</div>
              <div className="mt-4 text-[10px] font-bold text-forest uppercase tracking-wide">Scan PDF / DOCX →</div>
            </button>

            <button
              onClick={() => router.push('/agreements/new/calculator')}
              className="text-left bg-surface border border-hairline rounded-sm p-6 hover:border-forest hover:bg-surface-2 transition-all group"
            >
              <div className="w-9 h-9 bg-surface-2 rounded-sm flex items-center justify-center mb-4">
                <Calculator className="w-4 h-4 text-ink-3 group-hover:text-forest" />
              </div>
              <div className="font-bold text-ink-1 text-sm mb-1">Enter Details</div>
              <div className="text-xs text-ink-4 leading-relaxed">Fill in investor and investment details — calculator generates the payout schedule live.</div>
              <div className="mt-4 text-[10px] font-bold text-forest uppercase tracking-wide">Open Calculator →</div>
            </button>
          </div>
        </div>
      )}

      {step === 'upload' && (
        <UploadStep
          teamMembers={teamLoading ? [] : teamMembers}
          onExtract={handleExtract}
          isLoading={false}
          error={uploadError}
          onBack={() => setStep('choose')}
        />
      )}

      {step === 'loading' && (
        <div className="flex flex-col items-center justify-center py-32 space-y-6">
          <Loader2 className="w-12 h-12 text-forest animate-spin" />
          <div className="text-center space-y-1">
            <p className="text-ink-2 text-base font-medium">Reading the agreement...</p>
            <p className="text-ink-4 text-sm">This usually takes 10–30 seconds</p>
          </div>
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-sm border border-hairline-strong text-ink-3 hover:text-ink-1 hover:bg-surface-2 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {step === 'review' && extractResult && file && (
        <ExtractionReview
          extracted={extractResult.extracted}
          fileUrl={extractResult.file_url}
          tempPath={extractResult.temp_path}
          fileName={file.name}
          file={file}
          isDraft={isDraft}
          salespersonId={salespersonId}
          salespersonCustom={salespersonCustom}
          teamMembers={teamMembers}
          onBack={handleBack}
        />
      )}
    </div>
  )
}
```

- [ ] **Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Commit**

```bash
git add src/app/\(app\)/agreements/new/page.tsx
git commit -m "feat: add two-option entry screen to /agreements/new"
```

---

## Task 2: Create `CalculatorForm` component

**Files:**
- Create: `src/components/agreements/CalculatorForm.tsx`

This is the largest component. It owns all form state, live schedule computation, validation, and the two action handlers (Export PDF, Create Agreement).

- [ ] **Create the file**

```tsx
'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { calculatePayoutSchedule } from '@/lib/payout-calculator'
import type { PayoutRow } from '@/lib/payout-calculator'

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

export function validateCalculatorForm(form: FormState): string[] {
  const errors: string[] = []
  if (!form.investor_name.trim()) errors.push('Investor name is required')
  const principal = parseFloat(form.principal_amount)
  if (!form.principal_amount || isNaN(principal) || principal <= 0) errors.push('Principal amount must be a positive number')
  const roi = parseFloat(form.roi_percentage)
  if (!form.roi_percentage || isNaN(roi) || roi <= 0) errors.push('ROI % must be a positive number')
  if (!form.investment_start_date) errors.push('Start date is required')
  if (!form.maturity_date) errors.push('Maturity date is required')
  if (form.investment_start_date && form.maturity_date && form.maturity_date <= form.investment_start_date) {
    errors.push('Maturity date must be after start date')
  }
  return errors
}

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
        payout_schedule: schedule.filter(r => !r.is_tds_only && !r.is_principal_repayment).map(r => ({
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
  const sectionClass = 'mb-6'
  const sectionHeadClass = 'text-[9px] font-bold uppercase tracking-widest text-ink-4 border-b border-hairline pb-2 mb-4'

  return (
    <div className="space-y-6">
      {/* Section: Agreement */}
      <div className={sectionClass}>
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
      <div className={sectionClass}>
        <div className={sectionHeadClass}>Investor</div>
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-1">
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
      <div className={sectionClass}>
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
```

- [ ] **Verify TypeScript compiles**

```bash
npm run build 2>&1 | grep -E "error|warning" | head -10
```

Expected: no errors referencing `CalculatorForm.tsx`.

---

## Task 3: Create the calculator page shell

**Files:**
- Create: `src/app/(app)/agreements/new/calculator/page.tsx`

- [ ] **Create the file**

```tsx
import { createAdminClient } from '@/lib/supabase/admin'
import { headers } from 'next/headers'
import CalculatorForm from '@/components/agreements/CalculatorForm'

interface TeamMember {
  id: string
  name: string
  role: string
  is_active: boolean
}

export default async function CalculatorPage() {
  const supabase = createAdminClient()
  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, name, role, is_active')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="p-8 min-h-screen bg-canvas">
      <div className="mb-6 border-b border-ink-1 pb-3">
        <h1 className="text-[28px] font-semibold text-ink-1 font-serif tracking-tight">New Agreement</h1>
        <p className="text-xs text-ink-4 mt-0.5">Enter investment details — payout schedule updates live</p>
      </div>
      <div className="max-w-5xl">
        <CalculatorForm teamMembers={(teamMembers ?? []) as TeamMember[]} />
      </div>
    </div>
  )
}
```

- [ ] **Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Run dev server and verify the flow works end-to-end**

```bash
npm run dev
```

1. Open http://localhost:3000/agreements/new — confirm two cards appear
2. Click "Upload Document" — confirms it goes to existing upload step
3. Click "← Back" — returns to two-option screen
4. Click "Enter Details" — opens /agreements/new/calculator
5. Fill in Principal=5000000, ROI=12.5, Payout=Quarterly, Start=2025-01-01, Maturity=2028-01-01
6. Confirm payout schedule table appears with 12 rows
7. Change Payout to Cumulative — confirm table updates to 1 row

- [ ] **Commit**

```bash
git add src/app/\(app\)/agreements/new/calculator/page.tsx src/components/agreements/CalculatorForm.tsx
git commit -m "feat: calculator form with live payout schedule"
```

---

## Task 4: Wire up Create Agreement and write tests

**Files:**
- Create: `src/__tests__/calculator-form.test.ts`

The `handleCreate` function is already wired in `CalculatorForm.tsx` from Task 2. This task adds tests for the exported `validateCalculatorForm` helper and tests the actual agreement creation end-to-end in dev.

- [ ] **Create test file**

```ts
import { describe, it, expect } from 'vitest'
import { validateCalculatorForm } from '@/components/agreements/CalculatorForm'

const base = {
  agreement_type: 'Investment Agreement',
  agreement_date: '',
  lock_in_years: '3',
  salesperson_id: '',
  investor_name: 'Ramesh Kumar',
  investor_pan: '',
  investor_aadhaar: '',
  principal_amount: '5000000',
  roi_percentage: '12.5',
  payout_frequency: 'quarterly' as const,
  interest_type: 'simple' as const,
  investment_start_date: '2025-01-01',
  maturity_date: '2028-01-01',
}

describe('validateCalculatorForm', () => {
  it('returns no errors for a valid form', () => {
    expect(validateCalculatorForm(base)).toEqual([])
  })

  it('requires investor name', () => {
    const errors = validateCalculatorForm({ ...base, investor_name: '' })
    expect(errors).toContain('Investor name is required')
  })

  it('requires positive principal', () => {
    const errors = validateCalculatorForm({ ...base, principal_amount: '0' })
    expect(errors.some(e => e.includes('Principal'))).toBe(true)
  })

  it('requires positive ROI', () => {
    const errors = validateCalculatorForm({ ...base, roi_percentage: '-1' })
    expect(errors.some(e => e.includes('ROI'))).toBe(true)
  })

  it('requires start date', () => {
    const errors = validateCalculatorForm({ ...base, investment_start_date: '' })
    expect(errors.some(e => e.includes('Start date'))).toBe(true)
  })

  it('requires maturity date', () => {
    const errors = validateCalculatorForm({ ...base, maturity_date: '' })
    expect(errors.some(e => e.includes('Maturity date'))).toBe(true)
  })

  it('rejects maturity before start', () => {
    const errors = validateCalculatorForm({ ...base, maturity_date: '2024-01-01' })
    expect(errors.some(e => e.includes('after start date'))).toBe(true)
  })
})
```

- [ ] **Run tests**

```bash
npx vitest run src/__tests__/calculator-form.test.ts
```

Expected: 7 tests pass.

- [ ] **Test Create Agreement in dev**

With `npm run dev` running:
1. Go to `/agreements/new/calculator`
2. Fill all required fields with valid data
3. Click "Create Agreement →"
4. Confirm redirect to `/agreements/[id]` with a new agreement created
5. Confirm payout schedule is populated on the detail page

- [ ] **Commit**

```bash
git add src/__tests__/calculator-form.test.ts
git commit -m "test: validateCalculatorForm unit tests"
```

---

## Task 5: PDF info sheet — library, template, API route

**Files:**
- Create: `src/lib/pdf-info-sheet.tsx`
- Create: `src/app/api/agreements/pdf-info-sheet/route.ts`

- [ ] **Install `@react-pdf/renderer`**

```bash
npm install @react-pdf/renderer
npm install --save-dev @types/react-pdf
```

Expected: installs cleanly.

- [ ] **Create the PDF template**

```tsx
// src/lib/pdf-info-sheet.tsx
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'
import type { PayoutRow } from './payout-calculator'

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a18' },
  header: { marginBottom: 24, borderBottom: '1pt solid #ccc', paddingBottom: 12 },
  org: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: '#2d4a2d', marginBottom: 2 },
  title: { fontSize: 11, color: '#888' },
  section: { marginBottom: 16 },
  sectionLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', letterSpacing: 1, color: '#888', marginBottom: 6, borderBottom: '0.5pt solid #eee', paddingBottom: 3 },
  row: { flexDirection: 'row', marginBottom: 4 },
  fieldLabel: { width: 140, color: '#888' },
  fieldValue: { flex: 1, fontFamily: 'Helvetica-Bold' },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f4f3f0', padding: '5 4', marginBottom: 1 },
  tableRow: { flexDirection: 'row', padding: '4 4', borderBottom: '0.5pt solid #f0f0ee' },
  tableFooter: { flexDirection: 'row', padding: '5 4', backgroundColor: '#f4f3f0', borderTop: '1pt solid #ccc', marginTop: 2 },
  col1: { width: 20 },
  col2: { flex: 2 },
  col3: { width: 36, textAlign: 'right' },
  col4: { width: 70, textAlign: 'right' },
  col5: { width: 60, textAlign: 'right' },
  col6: { width: 70, textAlign: 'right' },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#888' },
  tdText: { fontSize: 9, color: '#555' },
  tdBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: '#1a1a18' },
  footer: { marginTop: 24, paddingTop: 8, borderTop: '0.5pt solid #eee', fontSize: 8, color: '#bbb', textAlign: 'center' },
})

function fmt(n: number) {
  return '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n)
}

function fmtDate(d: string) {
  if (!d) return '—'
  try { return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) }
  catch { return d }
}

interface SheetData {
  investor_name: string
  investor_pan: string
  agreement_type: string
  agreement_date: string
  principal_amount: number
  roi_percentage: number
  payout_frequency: string
  interest_type: string
  investment_start_date: string
  maturity_date: string
  lock_in_years: number
  schedule: PayoutRow[]
}

export function InfoSheetDocument({ data }: { data: SheetData }) {
  const totalGross = data.schedule.reduce((s, r) => s + r.gross_interest, 0)
  const totalTds = data.schedule.reduce((s, r) => s + r.tds_amount, 0)
  const totalNet = data.schedule.reduce((s, r) => s + r.net_interest, 0)

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.org}>Good Earth</Text>
          <Text style={styles.title}>Investment Information Sheet</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Investor</Text>
          <View style={styles.row}><Text style={styles.fieldLabel}>Name</Text><Text style={styles.fieldValue}>{data.investor_name}</Text></View>
          {data.investor_pan ? <View style={styles.row}><Text style={styles.fieldLabel}>PAN</Text><Text style={styles.fieldValue}>{data.investor_pan}</Text></View> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Agreement</Text>
          <View style={styles.row}><Text style={styles.fieldLabel}>Type</Text><Text style={styles.fieldValue}>{data.agreement_type || 'Investment Agreement'}</Text></View>
          {data.agreement_date ? <View style={styles.row}><Text style={styles.fieldLabel}>Date</Text><Text style={styles.fieldValue}>{fmtDate(data.agreement_date)}</Text></View> : null}
          {data.lock_in_years ? <View style={styles.row}><Text style={styles.fieldLabel}>Lock-in Period</Text><Text style={styles.fieldValue}>{data.lock_in_years} years</Text></View> : null}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Investment Terms</Text>
          <View style={styles.row}><Text style={styles.fieldLabel}>Principal Amount</Text><Text style={styles.fieldValue}>{fmt(data.principal_amount)}</Text></View>
          <View style={styles.row}><Text style={styles.fieldLabel}>Rate of Interest</Text><Text style={styles.fieldValue}>{data.roi_percentage}% per annum</Text></View>
          <View style={styles.row}><Text style={styles.fieldLabel}>Interest Type</Text><Text style={styles.fieldValue}>{data.interest_type === 'compound' ? 'Compound' : 'Simple'}</Text></View>
          <View style={styles.row}><Text style={styles.fieldLabel}>Payout Frequency</Text><Text style={styles.fieldValue}>{data.payout_frequency.charAt(0).toUpperCase() + data.payout_frequency.slice(1)}</Text></View>
          <View style={styles.row}><Text style={styles.fieldLabel}>Start Date</Text><Text style={styles.fieldValue}>{fmtDate(data.investment_start_date)}</Text></View>
          <View style={styles.row}><Text style={styles.fieldLabel}>Maturity Date</Text><Text style={styles.fieldValue}>{fmtDate(data.maturity_date)}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Payout Schedule</Text>
          <View style={styles.tableHeader}>
            <Text style={[styles.thText, styles.col1]}>#</Text>
            <Text style={[styles.thText, styles.col2]}>Period</Text>
            <Text style={[styles.thText, styles.col3]}>Days</Text>
            <Text style={[styles.thText, styles.col4]}>Gross</Text>
            <Text style={[styles.thText, styles.col5]}>TDS (10%)</Text>
            <Text style={[styles.thText, styles.col6]}>Net</Text>
          </View>
          {data.schedule.map((row, i) => (
            <View key={i} style={styles.tableRow}>
              <Text style={[styles.tdText, styles.col1]}>{i + 1}</Text>
              <Text style={[styles.tdText, styles.col2]}>{fmtDate(row.period_from)} – {fmtDate(row.period_to)}</Text>
              <Text style={[styles.tdText, styles.col3]}>{row.no_of_days}</Text>
              <Text style={[styles.tdText, styles.col4]}>{fmt(row.gross_interest)}</Text>
              <Text style={[styles.tdText, styles.col5]}>{fmt(row.tds_amount)}</Text>
              <Text style={[styles.tdBold, styles.col6]}>{fmt(row.net_interest)}</Text>
            </View>
          ))}
          <View style={styles.tableFooter}>
            <Text style={[styles.thText, styles.col1]}></Text>
            <Text style={[styles.thText, styles.col2]}>Total</Text>
            <Text style={[styles.thText, styles.col3]}></Text>
            <Text style={[styles.thText, styles.col4]}>{fmt(totalGross)}</Text>
            <Text style={[styles.thText, styles.col5]}>{fmt(totalTds)}</Text>
            <Text style={[styles.thText, styles.col6]}>{fmt(totalNet)}</Text>
          </View>
        </View>

        <Text style={styles.footer}>This is an indicative information sheet only and does not constitute a legally binding agreement. TDS deducted at 10% as per applicable regulations.</Text>
      </Page>
    </Document>
  )
}
```

- [ ] **Create the API route**

```ts
// src/app/api/agreements/pdf-info-sheet/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { InfoSheetDocument } from '@/lib/pdf-info-sheet'
import React from 'react'

export async function POST(request: NextRequest) {
  try {
    const { form, schedule } = await request.json()

    if (!form?.investor_name || !form?.principal_amount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const data = {
      investor_name: form.investor_name,
      investor_pan: form.investor_pan ?? '',
      agreement_type: form.agreement_type || 'Investment Agreement',
      agreement_date: form.agreement_date ?? '',
      principal_amount: Number(form.principal_amount),
      roi_percentage: Number(form.roi_percentage),
      payout_frequency: form.payout_frequency,
      interest_type: form.interest_type,
      investment_start_date: form.investment_start_date,
      maturity_date: form.maturity_date,
      lock_in_years: Number(form.lock_in_years) || 0,
      schedule: schedule ?? [],
    }

    const buffer = await renderToBuffer(
      React.createElement(InfoSheetDocument, { data })
    )

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="Investment-Info-${data.investor_name.replace(/\s+/g, '-')}.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'PDF generation failed' },
      { status: 500 }
    )
  }
}
```

- [ ] **Verify build passes**

```bash
npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Test PDF export in dev**

With `npm run dev` running:
1. Go to `/agreements/new/calculator`
2. Fill all required fields
3. Click "Export PDF"
4. Confirm a PDF file downloads with investor name in filename
5. Open PDF — confirm all sections render correctly with payout schedule table

- [ ] **Commit**

```bash
git add src/lib/pdf-info-sheet.tsx src/app/api/agreements/pdf-info-sheet/route.ts package.json package-lock.json
git commit -m "feat: PDF info sheet export for calculator"
```

---

## Task 6: Final checks and branch wrap-up

- [ ] **Run full test suite**

```bash
npm test
```

Expected: all existing tests pass (31+7 = 38 tests).

- [ ] **Run production build**

```bash
npm run build 2>&1 | tail -10
```

Expected: clean build, no errors.

- [ ] **Update SESSION.md**

Update `SESSION.md`:
- Branch: `feature/batch-d-calculator`
- Phase: complete
- Active Batch: Calculator (Batch D partial)
- Work Completed: entry screen two-option, CalculatorForm with live schedule, Create Agreement flow, PDF info sheet export

- [ ] **Commit session files**

```bash
git add SESSION.md
git commit -m "chore: update SESSION.md — calculator feature complete"
```
