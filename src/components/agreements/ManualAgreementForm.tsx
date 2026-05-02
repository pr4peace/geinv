'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronLeft, Plus, X, ExternalLink } from 'lucide-react'
import { calculatePayoutSchedule } from '@/lib/payout-calculator'
import PayoutScheduleTable from './PayoutScheduleTable'

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
  is_draft: boolean
  salesperson_id: string
  salesperson_custom: string
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
}

interface ManualAgreementFormProps {
  teamMembers: TeamMember[]
  onBack: () => void
}

export default function ManualAgreementForm({ teamMembers, onBack }: ManualAgreementFormProps) {
  const router = useRouter()

  const [form, setForm] = useState<FormState>({
    reference_id: 'GEI-AUTO', // Placeholder, API generates real one
    agreement_date: '',
    investment_start_date: '',
    agreement_type: 'Investment Agreement',
    investor_name: '',
    investor_pan: '',
    investor_aadhaar: '',
    investor_address: '',
    tds_filing_name: '',
    nominees: [],
    principal_amount: '',
    roi_percentage: '',
    payout_frequency: 'quarterly',
    interest_type: 'simple',
    lock_in_years: '',
    maturity_date: '',
    payments: [],
    is_draft: false,
    salesperson_id: '',
    salesperson_custom: '',
  })

  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([])
  const [bypassDuplicate, setBypassDuplicate] = useState(false)

  // Live payout schedule calculation
  const payoutSchedule = useMemo(() => {
    const principal = parseFloat(form.principal_amount)
    const roi = parseFloat(form.roi_percentage)
    if (
      isNaN(principal) ||
      isNaN(roi) ||
      !form.payout_frequency ||
      !form.interest_type ||
      !form.investment_start_date ||
      !form.maturity_date
    ) {
      return []
    }

    try {
      const rows = calculatePayoutSchedule({
        principal,
        roiPercentage: roi,
        payoutFrequency: form.payout_frequency,
        interestType: form.interest_type,
        startDate: form.investment_start_date,
        maturityDate: form.maturity_date,
      })
      
      // Map to ExtractedPayoutRow (remove status)
      return rows.map((row) => ({
        period_from: row.period_from,
        period_to: row.period_to,
        due_by: row.due_by,
        no_of_days: row.no_of_days,
        gross_interest: row.gross_interest,
        tds_amount: row.tds_amount,
        net_interest: row.net_interest,
        is_principal_repayment: row.is_principal_repayment,
        is_tds_only: row.is_tds_only,
        tds_filed: row.tds_filed,
      }))
    } catch (err) {
      console.error('Failed to calculate payout schedule:', err)
      return []
    }
  }, [
    form.principal_amount,
    form.roi_percentage,
    form.payout_frequency,
    form.interest_type,
    form.investment_start_date,
    form.maturity_date,
  ])

  // Check for duplicate agreements when name and date change
  useEffect(() => {
    const name = form.investor_name.trim()
    const date = form.agreement_date.trim()
    if (!name || !date) {
      setDuplicates([])
      return
    }

    const params = new URLSearchParams({ investor_name: name, agreement_date: date })
    if (form.investor_pan.trim()) {
      params.set('investor_pan', form.investor_pan.trim())
    }

    const controller = new AbortController()
    fetch(`/api/agreements/check-duplicate?${params}`, { signal: controller.signal })
      .then(r => r.json())
      .then((d: { duplicates?: DuplicateMatch[] }) => {
        if (d.duplicates && d.duplicates.length > 0) setDuplicates(d.duplicates)
        else setDuplicates([])
      })
      .catch(() => {})

    return () => controller.abort()
  }, [form.investor_name, form.agreement_date, form.investor_pan])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => {
      const next = { ...prev, [key]: value }
      // Auto-fill TDS name if investor name changes and TDS name was empty or matched old investor name
      if (key === 'investor_name' && (prev.tds_filing_name === '' || prev.tds_filing_name === prev.investor_name)) {
        next.tds_filing_name = value as string
      }
      return next
    })
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

    // Validate dates: maturity must be after start date
    const start = new Date(form.investment_start_date)
    const maturity = new Date(form.maturity_date)
    if (maturity <= start) {
      setSaveError('Maturity Date must be after Investment Start Date.')
      return
    }

    // Validate payout schedule generated
    if (payoutSchedule.length === 0) {
      setSaveError('Could not generate a payout schedule with the current dates and frequency.')
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
    const lockInFloat = parseFloat(form.lock_in_years)
    const lockInVal = Math.round(lockInFloat)

    if (isNaN(principalVal) || isNaN(roiVal) || isNaN(lockInFloat)) {
      setSaveError('Principal Amount, ROI Percentage, and Lock-in Years must be valid numbers.')
      return
    }

    if (lockInFloat !== lockInVal) {
      setSaveError('Lock-in Years must be an integer.')
      return
    }

    setSaving(true)
    try {
      const body = {
        force: bypassDuplicate,
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
        document_url: null,
        payout_schedule: payoutSchedule,
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
      router.push(`/agreements/${created.id}`)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Unknown error saving agreement')
    } finally {
      setSaving(false)
    }
  }

  const salespersonOptions = teamMembers.filter(m => (m.role === 'salesperson' || m.role === 'coordinator') && m.is_active)

  const inputBaseClass = "w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-100 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        Back to Choice
      </button>

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

      {/* Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Agreement & Investor */}
        <div className="space-y-6">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Agreement Details</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Agreement Date *</label>
                <input
                  type="date"
                  value={form.agreement_date}
                  onChange={e => update('agreement_date', e.target.value)}
                  className={inputBaseClass}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Investment Start Date *</label>
                <input
                  type="date"
                  value={form.investment_start_date}
                  onChange={e => update('investment_start_date', e.target.value)}
                  className={inputBaseClass}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Agreement Type</label>
              <input
                type="text"
                value={form.agreement_type}
                onChange={e => update('agreement_type', e.target.value)}
                className={inputBaseClass}
              />
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Investor Details</h2>
            
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Investor Name *</label>
              <input
                type="text"
                value={form.investor_name}
                onChange={e => update('investor_name', e.target.value)}
                className={inputBaseClass}
                placeholder="Full Name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">PAN</label>
                <input
                  type="text"
                  value={form.investor_pan}
                  onChange={e => update('investor_pan', e.target.value)}
                  className={inputBaseClass}
                  placeholder="ABCDE1234F"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Aadhaar</label>
                <input
                  type="text"
                  value={form.investor_aadhaar}
                  onChange={e => update('investor_aadhaar', e.target.value)}
                  className={inputBaseClass}
                  placeholder="1234 5678 9012"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Address</label>
              <textarea
                rows={2}
                value={form.investor_address}
                onChange={e => update('investor_address', e.target.value)}
                className={inputBaseClass + " resize-none"}
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">TDS Filing Name</label>
              <input
                type="text"
                value={form.tds_filing_name}
                onChange={e => update('tds_filing_name', e.target.value)}
                className={inputBaseClass}
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

              <div className="space-y-3">
                {form.nominees.map((nominee, idx) => (
                  <div key={idx} className="relative bg-slate-900 border border-slate-700 rounded-lg p-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => removeNominee(idx)}
                      className="absolute top-2 right-2 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={nominee.name}
                        onChange={e => updateNominee(idx, 'name', e.target.value)}
                        placeholder="Nominee Name"
                        className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100"
                      />
                      <input
                        type="text"
                        value={nominee.pan}
                        onChange={e => updateNominee(idx, 'pan', e.target.value)}
                        placeholder="Nominee PAN"
                        className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100"
                      />
                      <input
                        type="text"
                        value={nominee.relationship}
                        onChange={e => updateNominee(idx, 'relationship', e.target.value)}
                        placeholder="Relationship"
                        className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100"
                      />
                      <input
                        type="number"
                        value={nominee.share}
                        onChange={e => updateNominee(idx, 'share', e.target.value)}
                        placeholder="Share %"
                        className="bg-slate-800 border border-slate-600 rounded px-2 py-1.5 text-xs text-slate-100"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Financial & Payment */}
        <div className="space-y-6">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Financial Terms</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Principal Amount (₹) *</label>
                <input
                  type="number"
                  value={form.principal_amount}
                  onChange={e => update('principal_amount', e.target.value)}
                  className={inputBaseClass}
                  placeholder="1000000"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">ROI % *</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.roi_percentage}
                  onChange={e => update('roi_percentage', e.target.value)}
                  className={inputBaseClass}
                  placeholder="12"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Payout Frequency *</label>
                <select
                  value={form.payout_frequency}
                  onChange={e => update('payout_frequency', e.target.value as PayoutFrequency)}
                  className={inputBaseClass}
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
                  className={inputBaseClass}
                >
                  <option value="simple">Simple</option>
                  <option value="compound">Compound</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Lock-in Years (Integer) *</label>
                <input
                  type="number"
                  step="1"
                  value={form.lock_in_years}
                  onChange={e => update('lock_in_years', e.target.value)}
                  className={inputBaseClass}
                  placeholder="1"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Maturity Date *</label>
                <input
                  type="date"
                  value={form.maturity_date}
                  onChange={e => update('maturity_date', e.target.value)}
                  className={inputBaseClass}
                />
              </div>
            </div>
          </div>

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

          <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">Agreement Settings</h2>
            
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_draft}
                onChange={e => update('is_draft', e.target.checked)}
                className="accent-amber-500 w-4 h-4"
              />
              <span className="text-sm text-slate-100">Is Draft (pending signature)</span>
            </label>

            <div className="space-y-1">
              <label className="text-xs text-slate-400">Salesperson</label>
              <select
                value={form.salesperson_id}
                onChange={e => update('salesperson_id', e.target.value)}
                className={inputBaseClass}
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
                  className={inputBaseClass + " mt-2"}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Payout Schedule Preview */}
      {payoutSchedule.length > 0 && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Live Payout Schedule
            <span className="ml-2 text-xs text-slate-500 normal-case font-normal">(computed from terms above)</span>
          </h2>
          <PayoutScheduleTable payouts={payoutSchedule} />
        </div>
      )}

      {/* Save Action */}
      <div className="space-y-4">
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

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-500/20 text-base"
        >
          {saving ? 'Creating Agreement...' : 'Create Agreement'}
        </button>
      </div>
    </div>
  )
}
