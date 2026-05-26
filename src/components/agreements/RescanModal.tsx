'use client'

import React, { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, X, AlertTriangle, AlertCircle, Check, ArrowRight, Loader2 } from 'lucide-react'
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
        <h3 className={`text-[11px] font-bold uppercase tracking-wider flex items-center gap-2 ${blocking.length > 0 ? 'text-rust' : 'text-clay'}`}>
          <AlertTriangle className="w-3.5 h-3.5" />
          {blocking.length > 0
            ? `${blocking.length} error${blocking.length !== 1 ? 's' : ''} to resolve`
            : `${pending.length} warning${pending.length !== 1 ? 's' : ''} — review`}
        </h3>
        <span className="text-[10px] font-bold text-ink-5 uppercase">{resolved.length} of {flags.length} resolved</span>
      </div>

      {flags.map(flag => (
        <div
          key={flag.id}
          className={`border-l-4 rounded-sm p-4 space-y-3 shadow-sm ${
            flag.resolution === 'pending'
              ? 'border-rust bg-rust-soft/20'
              : flag.resolution === 'accepted'
              ? 'border-clay bg-clay-soft/20'
              : 'border-gain bg-gain-soft/20'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink-1">{flag.message}</p>
              <p className="text-xs text-ink-3">
                Expected: <span className="text-gain font-bold num">{flag.expected}</span>
                {' · '}
                Found: <span className="text-rust font-bold num">{flag.found}</span>
              </p>
            </div>
            {flag.resolution !== 'pending' && (
              <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-sm ${
                flag.resolution === 'accepted' ? 'bg-clay text-paper' : 'bg-gain text-paper'
              }`}>
                {flag.resolution}
              </span>
            )}
          </div>

          {flag.resolution === 'pending' && (
            <div className="flex flex-wrap gap-2 pt-1">
              {flag.rowIndex !== null && (
                <button
                  type="button"
                  onClick={() => onFix(flag.id)}
                  className="h-7 px-3 text-[10px] font-bold uppercase bg-ink-1 text-paper rounded-sm hover:bg-forest transition-all shadow-sm"
                >
                  Fix value
                </button>
              )}
              <button
                type="button"
                onClick={onReUpload}
                className="h-7 px-3 text-[10px] font-bold uppercase border border-hairline-strong text-ink-2 bg-surface rounded-sm hover:bg-surface-2 transition-all shadow-sm"
              >
                Retry Scan
              </button>
              {accepting === flag.id ? (
                <div className="flex items-center gap-2 w-full mt-2">
                  <input
                    type="text"
                    placeholder="Reason for accepting..."
                    value={acceptNotes[flag.id] ?? ''}
                    onChange={e => setAcceptNotes(n => ({ ...n, [flag.id]: e.target.value }))}
                    className="flex-1 h-7 border border-clay/30 bg-surface px-2 text-xs rounded-sm focus:border-clay focus:ring-2 focus:ring-clay/10 outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    disabled={(acceptNotes[flag.id] ?? '').trim().length < 5}
                    onClick={() => { onAccept(flag.id, acceptNotes[flag.id]); setAccepting(null) }}
                    className="h-7 px-3 text-[10px] font-bold uppercase bg-clay text-paper rounded-sm hover:bg-earth-brown disabled:opacity-40 transition-all shadow-sm"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccepting(null)}
                    className="px-2 text-[10px] font-bold uppercase text-ink-4 hover:text-ink-2"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAccepting(flag.id)}
                  className="h-7 px-3 text-[10px] font-bold uppercase bg-clay-soft text-clay border border-clay/20 rounded-sm hover:bg-clay hover:text-paper transition-all shadow-sm"
                >
                  Accept as-is
                </button>
              )}
            </div>
          )}

          {flag.resolution === 'accepted' && flag.acceptanceNote && (
            <p className="text-[11px] text-clay/80 italic font-medium">Note: {flag.acceptanceNote}</p>
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
    <div className={`p-4 rounded-sm border transition-colors ${isChanged ? 'bg-clay-soft/20 border-clay/30 shadow-sm' : 'bg-surface-2 border-hairline'}`}>
      <label className="lbl mb-2 block">{label}</label>
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-bold uppercase text-ink-5 mb-0.5">Current</p>
          <p className="text-[13px] text-ink-3 truncate font-medium">{oldVal ?? '—'}</p>
        </div>
        <ArrowRight className={`w-3.5 h-3.5 flex-shrink-0 ${isChanged ? 'text-clay' : 'text-ink-5'}`} />
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-bold uppercase text-forest mb-0.5">Extracted</p>
          <input
            type={type}
            value={newVal ?? ''}
            onChange={e => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
            className={`w-full h-7 bg-surface border rounded-sm px-2 text-[13px] font-semibold focus:outline-none focus:ring-2 focus:ring-forest/10 ${isChanged ? 'border-clay text-earth-brown' : 'border-hairline-strong text-ink-1'}`}
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
    <div className="space-y-3">
      <p className="lbl font-bold">Payout Schedule Comparison</p>
      <div className="overflow-x-auto rounded-sm border border-hairline bg-surface shadow-sm">
        <table className="border-collapse w-full text-[11px]">
          <thead>
            <tr className="bg-surface-2 border-b border-hairline-strong">
              <th className="px-3 py-2 text-left text-ink-5 w-8 font-bold">#</th>
              <th className="px-3 py-2 text-left text-ink-5 uppercase tracking-widest text-[9px] font-bold">Property</th>
              <th className="px-3 py-2 text-left text-ink-4 italic font-medium">Current</th>
              <th className="px-3 py-2 text-left text-forest uppercase tracking-widest text-[9px] font-bold">Extracted</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
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
                  <tr className="bg-surface-2/30">
                    <td rowSpan={props.length} className="px-3 py-2 align-top font-bold text-ink-5 border-r border-hairline num bg-surface-2/50">
                      {i + 1}
                    </td>
                    <td className="px-3 py-1 text-ink-5 font-bold uppercase text-[9px]">{props[0].replace('_', ' ')}</td>
                    <td className="px-3 py-1 text-ink-4 num">{cur?.[props[0]] ?? '—'}</td>
                    <td className={`px-3 py-1 num font-bold ${cur?.[props[0]] !== ext?.[props[0]] ? 'bg-clay-soft/30 text-earth-brown' : 'text-ink-2'}`}>
                      {ext?.[props[0]] ?? '—'}
                    </td>
                  </tr>
                  {props.slice(1).map((p) => (
                    <tr key={p}>
                      <td className="px-3 py-1 text-ink-5 font-bold uppercase text-[9px]">{p.replace('_', ' ')}</td>
                      <td className="px-3 py-1 text-ink-4 num">
                        {typeof cur?.[p] === 'number' ? cur[p].toLocaleString('en-IN') : (cur?.[p] ?? '—')}
                      </td>
                      <td className={`px-3 py-1 num font-bold ${String(cur?.[p]) !== String(ext?.[p]) ? 'bg-clay-soft/30 text-earth-brown' : 'text-ink-2'}`}>
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
        <div className={`p-3 rounded-sm border ${extractedRows.length < currentRows.length ? 'bg-rust-soft/20 border-rust/20' : 'bg-clay-soft/20 border-clay/20'}`}>
          <p className={`text-[11px] italic flex items-center gap-2 ${extractedRows.length < currentRows.length ? 'text-rust font-bold' : 'text-clay font-bold'}`}>
            <AlertCircle className="w-3.5 h-3.5" />
            {extractedRows.length < currentRows.length
              ? `Extracted has fewer rows (${extractedRows.length}) than current (${currentRows.length}). Applying will DELETE ${currentRows.length - extractedRows.length} rows.`
              : `Row count mismatch: Current has ${currentRows.length}, Extracted has ${extractedRows.length}.`}
          </p>
        </div>
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
        className="h-7 px-3 border border-hairline-strong text-ink-1 bg-surface text-[10px] font-bold uppercase rounded-sm hover:bg-surface-2 transition-all flex items-center gap-1.5 shadow-sm"
      >
        <RefreshCw className="w-3 h-3" />
        Re-scan Doc
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink-1/40 backdrop-blur-[2px]">
          <div className="bg-surface border border-hairline rounded-sm w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 border-b border-hairline flex items-center justify-between bg-surface-2">
              <h3 className="text-sm font-bold text-ink-1 flex items-center gap-3 uppercase tracking-widest">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-forest' : 'text-ink-4'}`} />
                Review Data Sync
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-ink-5 hover:text-ink-1 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              {loading && (
                <div className="py-20 flex flex-col items-center justify-center space-y-6">
                  <Loader2 className="w-10 h-10 text-forest animate-spin" />
                  <div className="text-center space-y-1">
                    <p className="text-ink-2 text-[15px] font-semibold font-serif">Rethinking extraction...</p>
                    <p className="text-ink-5 text-[11px] font-bold uppercase tracking-wider">Gemini is re-reading the agreement</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-rust-soft border border-rust/20 rounded-sm p-5 flex gap-4 mb-8">
                  <AlertTriangle className="w-5 h-5 text-rust flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-rust uppercase tracking-wider">Extraction Failed</p>
                    <p className="text-sm text-rust font-medium italic">{error}</p>
                  </div>
                </div>
              )}

              {extracted && current && !loading && (
                <div className="space-y-10">
                  <div className="bg-gain-soft border border-gain/20 rounded-sm p-5 flex gap-4">
                    <Check className="w-5 h-5 text-gain flex-shrink-0 mt-0.5 stroke-[3]" />
                    <div>
                      <p className="text-[11px] font-bold uppercase text-gain tracking-widest">Extraction Ready</p>
                      <p className="text-[13px] text-ink-2 font-medium mt-1">Verify the changes below. Confirming will overwrite the current record.</p>
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
                    <div className="p-4 rounded-sm border bg-surface-2 border-hairline">
                      <p className="lbl mb-2">Frequency</p>
                      <select
                        value={extracted.payout_frequency || ''}
                        onChange={(e) => setExtracted(prev => prev ? { ...prev, payout_frequency: e.target.value as PayoutFrequency } : null)}
                        className="w-full h-7 border border-hairline-strong bg-surface px-2 text-[13px] font-semibold rounded-sm focus:border-forest outline-none"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="biannual">Biannual</option>
                        <option value="annual">Annual</option>
                        <option value="cumulative">Cumulative</option>
                      </select>
                    </div>
                    <div className="p-4 rounded-sm border bg-surface-2 border-hairline">
                      <p className="lbl mb-2">Interest Type</p>
                      <select
                        value={extracted.interest_type || ''}
                        onChange={(e) => setExtracted(prev => prev ? { ...prev, interest_type: e.target.value as InterestType } : null)}
                        className="w-full h-7 border border-hairline-strong bg-surface px-2 text-[13px] font-semibold rounded-sm focus:border-forest outline-none"
                      >
                        <option value="simple">Simple</option>
                        <option value="compound">Compound</option>
                      </select>
                    </div>
                  </div>

                  <div className="p-4 rounded-sm border bg-surface-2 border-hairline">
                    <p className="lbl mb-2">Address</p>
                    <textarea
                      rows={2}
                      value={extracted.investor_address || ''}
                      onChange={(e) => setExtracted(prev => prev ? { ...prev, investor_address: e.target.value } : null)}
                      className="w-full border border-hairline-strong bg-surface p-2 text-[13px] font-medium text-ink-2 rounded-sm focus:border-forest outline-none resize-none"
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
            <div className="px-8 py-4 border-t border-hairline flex justify-end items-center gap-4 bg-surface-2">
              <button
                onClick={() => setIsOpen(false)}
                className="text-[11px] font-bold uppercase text-ink-4 hover:text-ink-1 transition-colors"
              >
                Discard
              </button>
              {extracted && current && !loading && (
                <button
                  onClick={handleConfirm}
                  disabled={saving || unresolvedCount > 0}
                  className="h-8 px-6 bg-forest text-paper text-[11px] font-bold uppercase rounded-sm hover:bg-ink-1 disabled:opacity-50 transition-all shadow-sm"
                >
                  {saving
                    ? 'Applying...'
                    : unresolvedCount > 0
                    ? `${unresolvedCount} Error${unresolvedCount !== 1 ? 's' : ''} to Resolve`
                    : 'Sync Data'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
