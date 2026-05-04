'use client'

import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, X, AlertTriangle, Check, ArrowRight } from 'lucide-react'
import type { ExtractedAgreement, ExtractedPayoutRow } from '@/lib/claude'
import type { PayoutFrequency, InterestType } from '@/types/database'
import type { ExtractionFlag } from '@/lib/extraction-validator'

interface RescanModalProps {
  agreementId: string
  userRole: string
}

interface AgreementFields {
  agreement_date: string
  investment_start_date: string
  agreement_type: string
  investor_name: string
  investor_pan: string | null
  investor_aadhaar: string | null
  investor_address: string | null
  tds_filing_name: string | null
  principal_amount: number
  roi_percentage: number
  payout_frequency: string
  interest_type: string
  lock_in_years: number
  maturity_date: string
}

function FlagsPanel({
  flags,
  onFix,
  onAccept,
  onReUpload,
}: {
  flags: ExtractionFlag[]
  onFix: (flagId: string) => void
  onAccept: (flagId: string, note: string) => void
  onReUpload: () => void
}) {
  const [acceptNotes, setAcceptNotes] = useState<Record<string, string>>({})
  const [accepting, setAccepting] = useState<string | null>(null)

  const pending = flags.filter(f => f.resolution === 'pending')
  const blocking = pending.filter(f => f.severity === 'error')
  const resolved = flags.filter(f => f.resolution !== 'pending')

  if (flags.length === 0) return null

  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className={`text-sm font-semibold flex items-center gap-2 ${blocking.length > 0 ? 'text-red-400' : 'text-amber-400'}`}>
          <AlertTriangle className="w-4 h-4" />
          {blocking.length > 0
            ? `${blocking.length} error${blocking.length !== 1 ? 's' : ''} must be resolved before saving`
            : `${pending.length} warning${pending.length !== 1 ? 's' : ''} — review and proceed`}
        </h3>
        <span className="text-xs text-slate-500">{resolved.length} of {flags.length} resolved</span>
      </div>

      {flags.map(flag => (
        <div
          key={flag.id}
          className={`border-l-4 rounded-xl p-4 space-y-3 ${
            flag.resolution === 'pending'
              ? 'border-red-500 bg-red-900/10'
              : flag.resolution === 'accepted'
              ? 'border-amber-500 bg-amber-900/10'
              : 'border-emerald-500 bg-emerald-900/10'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-slate-200">{flag.message}</p>
              <p className="text-xs text-slate-400">
                Expected: <span className="text-emerald-400">{flag.expected}</span>
                {' · '}
                Found: <span className="text-red-400">{flag.found}</span>
              </p>
            </div>
            {flag.resolution !== 'pending' && (
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                flag.resolution === 'accepted' ? 'bg-amber-900/40 text-amber-400' : 'bg-emerald-900/40 text-emerald-400'
              }`}>
                {flag.resolution}
              </span>
            )}
          </div>

          {flag.resolution === 'pending' && (
            <div className="flex flex-wrap gap-2">
              {flag.rowIndex !== null && (
                <button
                  type="button"
                  onClick={() => onFix(flag.id)}
                  className="px-3 py-1.5 text-xs font-semibold bg-indigo-900/40 text-indigo-400 hover:bg-indigo-800/40 rounded-lg transition-colors"
                >
                  Fix value
                </button>
              )}
              <button
                type="button"
                onClick={onReUpload}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Retry Scan
              </button>
              {accepting === flag.id ? (
                <div className="flex items-center gap-2 w-full">
                  <input
                    type="text"
                    placeholder="Why is this correct? (required)"
                    value={acceptNotes[flag.id] ?? ''}
                    onChange={e => setAcceptNotes(n => ({ ...n, [flag.id]: e.target.value }))}
                    className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    disabled={(acceptNotes[flag.id] ?? '').trim().length < 5}
                    onClick={() => { onAccept(flag.id, acceptNotes[flag.id]); setAccepting(null) }}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-700 text-white hover:bg-amber-600 disabled:opacity-40 rounded-lg transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccepting(null)}
                    className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAccepting(flag.id)}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-900/30 text-amber-400 hover:bg-amber-900/50 rounded-lg transition-colors"
                >
                  Accept as-is
                </button>
              )}
            </div>
          )}

          {flag.resolution === 'accepted' && flag.acceptanceNote && (
            <p className="text-xs text-amber-400/70 italic">Note: {flag.acceptanceNote}</p>
          )}
        </div>
      ))}
    </div>
  )
}

function RescanDiff({
  label,
  oldVal,
  newVal,
  onChange,
  type = 'text',
}: {
  label: string
  oldVal: string | number | null
  newVal: string | number | null
  onChange: (v: string | number) => void
  type?: string
}) {
  const isChanged = String(oldVal ?? '') !== String(newVal ?? '')

  return (
    <div className={`p-3 rounded-xl border transition-colors ${isChanged ? 'bg-amber-900/10 border-amber-700/50' : 'bg-slate-800/40 border-slate-700'}`}>
      <label className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1 block">{label}</label>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-slate-500">Current</p>
          <p className="text-sm text-slate-400 truncate">{oldVal ?? '—'}</p>
        </div>
        <ArrowRight className={`w-4 h-4 flex-shrink-0 ${isChanged ? 'text-amber-500' : 'text-slate-700'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-indigo-400">Extracted</p>
          <input
            type={type}
            value={newVal ?? ''}
            onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
            className={`w-full bg-slate-900 border rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 ${isChanged ? 'border-amber-600 text-amber-200' : 'border-slate-700 text-slate-200'}`}
          />
        </div>
      </div>
    </div>
  )
}

function PayoutScheduleDiff({
  currentRows,
  extractedRows,
}: {
  currentRows: ExtractedPayoutRow[]
  extractedRows: ExtractedPayoutRow[]
}) {
  const maxLength = Math.max(currentRows.length, extractedRows.length)

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-2">Payout Schedule Comparison</p>
      <div className="overflow-x-auto rounded-xl border border-slate-700 bg-slate-900/50">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/50">
              <th className="px-2 py-2 text-left text-slate-400">#</th>
              <th className="px-2 py-2 text-left text-slate-400">Property</th>
              <th className="px-2 py-2 text-left text-slate-500 italic">Current</th>
              <th className="px-2 py-2 text-left text-indigo-400">Extracted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {Array.from({ length: maxLength }).map((_, i) => {
              const cur = currentRows[i]
              const ext = extractedRows[i]

              const props: (keyof ExtractedPayoutRow)[] = [
                'period_from',
                'period_to',
                'due_by',
                'gross_interest',
                'net_interest',
              ]

              return (
                <React.Fragment key={i}>
                  <tr className="bg-slate-800/20">
                    <td rowSpan={props.length} className="px-2 py-2 align-top font-bold text-slate-500 border-r border-slate-800">
                      {i + 1}
                    </td>
                    <td className="px-2 py-1 text-slate-500">{props[0]}</td>
                    <td className="px-2 py-1 text-slate-400">{cur?.[props[0]] ?? '—'}</td>
                    <td className={`px-2 py-1 ${cur?.[props[0]] !== ext?.[props[0]] ? 'bg-amber-900/20 text-amber-200' : 'text-slate-300'}`}>
                      {ext?.[props[0]] ?? '—'}
                    </td>
                  </tr>
                  {props.slice(1).map((p) => (
                    <tr key={p}>
                      <td className="px-2 py-1 text-slate-500">{p}</td>
                      <td className="px-2 py-1 text-slate-400">
                        {typeof cur?.[p] === 'number' ? cur[p].toLocaleString('en-IN') : (cur?.[p] ?? '—')}
                      </td>
                      <td className={`px-2 py-1 ${String(cur?.[p]) !== String(ext?.[p]) ? 'bg-amber-900/20 text-amber-200' : 'text-slate-300'}`}>
                        {typeof ext?.[p] === 'number' ? ext[p].toLocaleString('en-IN') : (ext?.[p] ?? '—')}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {currentRows.length !== extractedRows.length && (
        <p className="text-[10px] text-amber-500 italic">
          ⚠️ Row count mismatch: Current has {currentRows.length} rows, Extracted has {extractedRows.length} rows.
        </p>
      )}
    </div>
  )
}

export default function RescanModal({ agreementId, userRole }: RescanModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [extracted, setExtracted] = useState<ExtractedAgreement | null>(null)
  const [current, setCurrent] = useState<{ agreement: AgreementFields; payoutRows: ExtractedPayoutRow[] } | null>(null)
  const [flags, setFlags] = useState<ExtractionFlag[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const unresolvedCount = useMemo(() => flags.filter(f => f.resolution === 'pending' && f.severity === 'error').length, [flags])

  if (userRole === 'salesperson') return null

  async function handleRescan() {
    setLoading(true)
    setError(null)
    setExtracted(null)
    setCurrent(null)
    setFlags([])
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
      setExtracted(data.extracted)
      setFlags(data.flags ?? [])
      setCurrent(data.current)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error during rescan')
    } finally {
      setLoading(false)
    }
  }

  function handleFlagFix(flagId: string) {
    setFlags(prev => prev.map(f => f.id === flagId ? { ...f, resolution: 'fixed' } : f))
  }

  function handleFlagAccept(flagId: string, note: string) {
    setFlags(prev => prev.map(f => f.id === flagId ? { ...f, resolution: 'accepted', acceptanceNote: note } : f))
  }

  async function handleConfirm() {
    if (!extracted) return
    if (unresolvedCount > 0) return
    
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/agreements/${agreementId}/rescan/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extracted,
          acceptedFlags: flags.filter(f => f.resolution === 'accepted').map(f => f.id),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to apply update')
      }

      setIsOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error during apply')
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

              {extracted && current && !loading && (
                <div className="space-y-6">
                  <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-xl p-4 flex gap-3">
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-emerald-300">Extraction Complete</p>
                      <p className="text-xs text-emerald-400/70">Verify the changes below. Confirming will overwrite the current agreement and payout schedule.</p>
                    </div>
                  </div>

                  <FlagsPanel
                    flags={flags}
                    onFix={handleFlagFix}
                    onAccept={handleFlagAccept}
                    onReUpload={handleRescan}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <RescanDiff 
                      label="Investor Name" 
                      oldVal={current.agreement.investor_name}
                      newVal={extracted.investor_name} 
                      onChange={(v) => setExtracted(prev => prev ? { ...prev, investor_name: String(v) } : null)}
                    />
                    <RescanDiff 
                      label="Principal" 
                      oldVal={current.agreement.principal_amount}
                      newVal={extracted.principal_amount} 
                      type="number"
                      onChange={(v) => setExtracted(prev => prev ? { ...prev, principal_amount: Number(v) } : null)}
                    />
                    <RescanDiff 
                      label="Agreement Date" 
                      oldVal={current.agreement.agreement_date}
                      newVal={extracted.agreement_date} 
                      type="date"
                      onChange={(v) => setExtracted(prev => prev ? { ...prev, agreement_date: String(v) } : null)}
                    />
                    <RescanDiff 
                      label="Start Date" 
                      oldVal={current.agreement.investment_start_date}
                      newVal={extracted.investment_start_date} 
                      type="date"
                      onChange={(v) => setExtracted(prev => prev ? { ...prev, investment_start_date: String(v) } : null)}
                    />
                    <RescanDiff 
                      label="Maturity Date" 
                      oldVal={current.agreement.maturity_date}
                      newVal={extracted.maturity_date} 
                      type="date"
                      onChange={(v) => setExtracted(prev => prev ? { ...prev, maturity_date: String(v) } : null)}
                    />
                    <RescanDiff 
                      label="ROI %" 
                      oldVal={current.agreement.roi_percentage}
                      newVal={extracted.roi_percentage} 
                      type="number"
                      onChange={(v) => setExtracted(prev => prev ? { ...prev, roi_percentage: Number(v) } : null)}
                    />
                    <div className="p-3 rounded-xl border bg-slate-800/40 border-slate-700">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Frequency</p>
                      <select
                        value={extracted.payout_frequency || ''}
                        onChange={(e) => setExtracted(prev => prev ? { ...prev, payout_frequency: e.target.value as PayoutFrequency } : null)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="biannual">Biannual</option>
                        <option value="annual">Annual</option>
                        <option value="cumulative">Cumulative</option>
                      </select>
                    </div>
                    <div className="p-3 rounded-xl border bg-slate-800/40 border-slate-700">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Interest Type</p>
                      <select
                        value={extracted.interest_type || ''}
                        onChange={(e) => setExtracted(prev => prev ? { ...prev, interest_type: e.target.value as InterestType } : null)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="simple">Simple</option>
                        <option value="compound">Compound</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl border bg-slate-800/40 border-slate-700">
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Address</p>
                    <textarea
                      rows={2}
                      value={extracted.investor_address || ''}
                      onChange={(e) => setExtracted(prev => prev ? { ...prev, investor_address: e.target.value } : null)}
                      className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                    />
                  </div>

                  <PayoutScheduleDiff 
                    currentRows={current.payoutRows}
                    extractedRows={extracted.payout_schedule}
                  />
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
              {extracted && current && !loading && (
                <button
                  onClick={handleConfirm}
                  disabled={saving || unresolvedCount > 0}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
                >
                  {saving
                    ? 'Applying...'
                    : unresolvedCount > 0
                    ? `${unresolvedCount} Error${unresolvedCount !== 1 ? 's' : ''} to Resolve`
                    : 'Apply Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
