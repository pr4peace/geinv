'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, X, AlertTriangle, Check } from 'lucide-react'
import type { ExtractedAgreement } from '@/lib/claude'
import type { PayoutFrequency, InterestType } from '@/types/database'

interface RescanModalProps {
  agreementId: string
}

export default function RescanModal({ agreementId }: RescanModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedAgreement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  async function handleRescan() {
    setLoading(true)
    setError(null)
    setExtracted(null)
    setIsOpen(true)

    try {
      const res = await fetch(`/api/agreements/${agreementId}/rescan`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to rescan document')
      }

      const data = await res.json()
      setExtracted(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error during rescan')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    if (!extracted) return
    setSaving(true)
    setError(null)

    try {
      const body = {
        agreement_date: extracted.agreement_date,
        investment_start_date: extracted.investment_start_date,
        agreement_type: extracted.agreement_type,
        investor_name: extracted.investor_name,
        investor_pan: extracted.investor_pan,
        investor_aadhaar: extracted.investor_aadhaar,
        investor_address: extracted.investor_address,
        tds_filing_name: extracted.tds_filing_name,
        nominees: extracted.nominees,
        principal_amount: extracted.principal_amount,
        roi_percentage: extracted.roi_percentage,
        payout_frequency: extracted.payout_frequency,
        interest_type: extracted.interest_type,
        lock_in_years: extracted.lock_in_years,
        maturity_date: extracted.maturity_date,
        payments: extracted.payments,
      }

      const res = await fetch(`/api/agreements/${agreementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to update agreement')
      }

      setIsOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error during update')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleRescan}
        className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors flex items-center gap-1.5"
      >
        <RefreshCw className="w-3 h-3" />
        Re-scan Doc
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
                Re-scan Agreement
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {loading && (
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                  <p className="text-slate-400 animate-pulse">Gemini is re-reading the document...</p>
                </div>
              )}

              {error && (
                <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 flex gap-3 mb-6">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              )}

              {extracted && !loading && (
                <div className="space-y-6">
                  <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-xl p-4 flex gap-3">
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-emerald-300">Extraction Complete</p>
                      <p className="text-xs text-emerald-400/70">Review the values below extracted from the document. Payout schedule will NOT be updated.</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                    <EditableDataPoint 
                      label="Investor Name" 
                      value={extracted.investor_name} 
                      onChange={(v) => setExtracted({ ...extracted, investor_name: v })}
                    />
                    <EditableDataPoint 
                      label="Principal" 
                      value={extracted.principal_amount} 
                      type="number"
                      onChange={(v) => setExtracted({ ...extracted, principal_amount: Number(v) })}
                    />
                    <EditableDataPoint 
                      label="Agreement Date" 
                      value={extracted.agreement_date} 
                      type="date"
                      onChange={(v) => setExtracted({ ...extracted, agreement_date: v })}
                    />
                    <EditableDataPoint 
                      label="Start Date" 
                      value={extracted.investment_start_date} 
                      type="date"
                      onChange={(v) => setExtracted({ ...extracted, investment_start_date: v })}
                    />
                    <EditableDataPoint 
                      label="Maturity Date" 
                      value={extracted.maturity_date} 
                      type="date"
                      onChange={(v) => setExtracted({ ...extracted, maturity_date: v })}
                    />
                    <EditableDataPoint 
                      label="ROI %" 
                      value={extracted.roi_percentage} 
                      type="number"
                      onChange={(v) => setExtracted({ ...extracted, roi_percentage: Number(v) })}
                    />
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Frequency</p>
                      <select
                        value={extracted.payout_frequency || ''}
                        onChange={(e) => setExtracted({ ...extracted, payout_frequency: e.target.value as PayoutFrequency })}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="biannual">Biannual</option>
                        <option value="annual">Annual</option>
                        <option value="cumulative">Cumulative</option>
                      </select>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Interest Type</p>
                      <select
                        value={extracted.interest_type || ''}
                        onChange={(e) => setExtracted({ ...extracted, interest_type: e.target.value as InterestType })}
                        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="simple">Simple</option>
                        <option value="compound">Compound</option>
                      </select>
                    </div>
                    <EditableDataPoint 
                      label="PAN" 
                      value={extracted.investor_pan} 
                      onChange={(v) => setExtracted({ ...extracted, investor_pan: v })}
                    />
                    <EditableDataPoint 
                      label="Aadhaar" 
                      value={extracted.investor_aadhaar} 
                      onChange={(v) => setExtracted({ ...extracted, investor_aadhaar: v })}
                    />
                  </div>

                  <div className="space-y-1">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Address</p>
                    <textarea
                      rows={2}
                      value={extracted.investor_address || ''}
                      onChange={(e) => setExtracted({ ...extracted, investor_address: e.target.value })}
                      className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-700 flex justify-end gap-3 bg-slate-800/50 rounded-b-2xl">
              <button
                onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancel
              </button>
              {extracted && !loading && (
                <button
                  onClick={handleConfirm}
                  disabled={saving}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
                >
                  {saving ? 'Updating...' : 'Confirm Update'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function EditableDataPoint({ 
  label, 
  value, 
  type = 'text',
  onChange 
}: { 
  label: string; 
  value: string | number | null | undefined;
  type?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">{label}</p>
      <input
        type={type}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
    </div>
  )
}
