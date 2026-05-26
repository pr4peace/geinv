'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X, AlertTriangle, Loader2, ArrowRight, Search } from 'lucide-react'

interface AgreementRow {
  id: string
  reference_id: string
  investor_name: string
  principal_amount: number
  roi_percentage: number
  maturity_date: string
  doc_status: string
}

interface ScanResult {
  agreementId: string
  referenceId: string
  investorName: string
  status: 'success' | 'error'
  extracted?: Record<string, unknown>
  flags?: Array<{ id: string; type: string; severity: string; message: string; expected: string; found: string }>
  current?: Record<string, unknown>
  error?: string
}

type CardStatus = 'pending' | 'accepted' | 'skipped' | 'applied'

export default function BatchRescanPage() {
  const router = useRouter()
  const [agreements, setAgreements] = useState<AgreementRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState(0)
  const [scanTotal, setScanTotal] = useState(0)
  const [results, setResults] = useState<ScanResult[]>([])
  const [cardStatuses, setCardStatuses] = useState<Record<string, CardStatus>>({})
  const [applying, setApplying] = useState(false)
  const [applyingIds, setApplyingIds] = useState<Set<string>>(new Set())
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set())

  async function loadAgreements() {
    const res = await fetch('/api/agreements?status=active&sort_by=created_at&sort_order=desc')
    const data = await res.json()
    const filtered = (data ?? [])
      .filter((a: Record<string, unknown>) => a.rescan_required === true)
      .map((a: Record<string, unknown>) => ({
        id: a.id as string,
        reference_id: a.reference_id as string,
        investor_name: a.investor_name as string,
        principal_amount: Number(a.principal_amount) ?? 0,
        roi_percentage: Number(a.roi_percentage) ?? 0,
        maturity_date: (a.maturity_date as string) ?? '',
        doc_status: (a.doc_status as string) ?? 'draft',
      }))
    setAgreements(filtered)
    setLoaded(true)
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  function toggleAll(visible: AgreementRow[]) {
    const allSelected = visible.every(a => selectedIds.has(a.id))
    if (allSelected) {
      const next = new Set(selectedIds)
      visible.forEach(a => next.delete(a.id))
      setSelectedIds(next)
    } else {
      const next = new Set(selectedIds)
      visible.forEach(a => next.add(a.id))
      setSelectedIds(next)
    }
  }

  async function handleScan() {
    if (selectedIds.size === 0) return
    setScanning(true)
    setScanProgress(0)
    setScanTotal(selectedIds.size)
    setResults([])
    setCardStatuses({})

    try {
      const res = await fetch('/api/admin/batch-rescan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agreementIds: Array.from(selectedIds) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Scan failed')

      // Simulate progress (API returns all at once)
      setScanProgress(data.success + data.errors)
      setResults(data.results ?? [])
      const statuses: Record<string, CardStatus> = {}
      data.results?.forEach((r: ScanResult) => { statuses[r.agreementId] = 'pending' })
      setCardStatuses(statuses)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setScanning(false)
    }
  }

  async function handleApply(agreeId: string) {
    setApplyingIds(prev => new Set(prev).add(agreeId))
    try {
      const result = results.find(r => r.agreementId === agreeId)
      if (!result?.extracted) return
      const res = await fetch(`/api/agreements/${agreeId}/rescan/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extracted: result.extracted }),
      })
      if (!res.ok) throw new Error('Apply failed')
      setCardStatuses(prev => ({ ...prev, [agreeId]: 'applied' }))
      router.refresh()
    } catch {
      // Keep as pending on error
    } finally {
      setApplyingIds(prev => {
        const next = new Set(prev)
        next.delete(agreeId)
        return next
      })
    }
  }

  async function handleApplyAll() {
    const accepted = Object.entries(cardStatuses)
      .filter(([, s]) => s === 'accepted')
      .map(([id]) => id)
    if (accepted.length === 0) return

    setApplying(true)
    for (const id of accepted) {
      await handleApply(id)
    }
    setApplying(false)
  }

  const filtered = agreements.filter(a => {
    if (search && !a.investor_name.toLowerCase().includes(search.toLowerCase()) && !a.reference_id.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const allVisibleSelected = filtered.length > 0 && filtered.every(a => selectedIds.has(a.id))

  const acceptedCount = Object.values(cardStatuses).filter(s => s === 'accepted').length
  const skippedCount = Object.values(cardStatuses).filter(s => s === 'skipped').length
  const appliedCount = Object.values(cardStatuses).filter(s => s === 'applied').length

  return (
    <div className="p-8 space-y-10 min-h-screen bg-canvas">
      <div className="flex items-center justify-between border-b border-ink-1 pb-3 mb-5">
        <div>
          <h1 className="text-[28px] font-semibold text-ink-1 font-serif tracking-tight leading-tight">Batch Rescan</h1>
          <p className="text-xs text-ink-4 mt-0.5 font-medium">Only agreements with rescan_required=true are shown</p>
        </div>
        {loaded && results.length === 0 && (
          <button
            onClick={handleScan}
            disabled={selectedIds.size === 0 || scanning}
            className="h-9 px-6 bg-forest hover:bg-forest-2 disabled:bg-ink-5 disabled:opacity-40 text-paper text-[11px] font-bold uppercase tracking-widest rounded-sm transition-all flex items-center gap-2 shadow-md"
          >
            {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            {scanning ? `Scanning ${scanProgress}/${scanTotal}...` : `Scan ${selectedIds.size} Selected`}
          </button>
        )}
      </div>

      {/* Scan progress */}
      {scanning && (
        <div className="bg-surface border border-hairline rounded-sm p-6 shadow-sm animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-6">
            <Loader2 className="w-6 h-6 text-forest animate-spin" />
            <div className="flex-1">
              <div className="h-1.5 bg-canvas border border-hairline rounded-full overflow-hidden">
                <div
                  className="h-full bg-forest transition-all duration-500"
                  style={{ width: `${(scanProgress / scanTotal) * 100}%` }}
                />
              </div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-ink-4 mt-2">{scanProgress} of {scanTotal} scanned</p>
            </div>
          </div>
        </div>
      )}

      {/* Agreement Selection */}
      {results.length === 0 && !scanning && (
        <div className="bg-surface border border-hairline rounded-sm p-8 space-y-8 shadow-sm">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-5" />
              <input
                type="text"
                placeholder="Search investor or reference..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-canvas border border-hairline rounded-sm pl-10 pr-3 h-10 text-sm text-ink-1 font-medium placeholder-ink-5 focus:border-forest focus:ring-2 focus:ring-forest/10 outline-none transition-all"
              />
            </div>
            {!loaded && (
              <button
                onClick={loadAgreements}
                className="h-10 px-8 bg-forest hover:bg-forest-2 text-paper text-[11px] font-bold uppercase tracking-widest rounded-sm transition-all shadow-md"
              >
                Load Queue
              </button>
            )}
          </div>

          {loaded && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 px-3 py-2 bg-surface-2 border border-hairline rounded-sm">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={() => toggleAll(filtered)}
                  className="accent-forest w-4 h-4 rounded-sm border-hairline-strong"
                />
                <span className="lbl font-bold tracking-widest">Select all {filtered.length} visible · {selectedIds.size} total selected (max 20)</span>
              </div>

              <div className="max-h-[500px] overflow-y-auto space-y-1 custom-scrollbar pr-2">
                {filtered.slice(0, 200).map(a => (
                  <label
                    key={a.id}
                    className={`flex items-center gap-4 px-4 py-3 rounded-sm cursor-pointer border transition-all ${
                      selectedIds.has(a.id) ? 'bg-forest-soft/30 border-forest/20' : 'hover:bg-canvas border-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                      disabled={selectedIds.size >= 20 && !selectedIds.has(a.id)}
                      className="accent-forest w-4 h-4 rounded-sm border-hairline-strong"
                    />
                    <span className="num font-bold text-[10px] text-ink-4 tracking-widest w-24">{a.reference_id}</span>
                    <span className="flex-1 text-[13px] font-semibold text-ink-1 truncate">{a.investor_name}</span>
                    <span className="num text-[11px] font-bold text-ink-3">₹{(a.principal_amount / 100000).toFixed(1)}L</span>
                    <span className="text-[9px] font-bold uppercase text-ink-5 bg-surface-2 px-2 py-0.5 rounded-sm border border-hairline">{a.doc_status}</span>
                  </label>
                ))}
                {filtered.length === 0 && <p className="text-sm italic text-ink-5 text-center py-10">No agreements requiring rescan found.</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-6 animate-in fade-in duration-500">
          {/* Summary bar */}
          <div className="bg-surface border border-hairline rounded-sm p-6 flex items-center justify-between flex-wrap gap-4 shadow-sm">
            <div className="flex gap-6 text-[10px] font-bold uppercase tracking-widest">
              <div className="flex flex-col gap-1"><span className="text-ink-5">Accepted</span><span className="text-gain text-base num">{acceptedCount}</span></div>
              <div className="flex flex-col gap-1"><span className="text-ink-5">Skipped</span><span className="text-clay text-base num">{skippedCount}</span></div>
              <div className="flex flex-col gap-1"><span className="text-ink-5">Applied</span><span className="text-forest text-base num">{appliedCount}</span></div>
              <div className="flex flex-col gap-1 border-l border-hairline pl-6"><span className="text-ink-5">Total</span><span className="text-ink-1 text-base num">{results.length}</span></div>
            </div>
            {acceptedCount > 0 && (
              <button
                onClick={handleApplyAll}
                disabled={applying}
                className="h-10 px-8 bg-gain hover:bg-forest text-paper text-[11px] font-bold uppercase tracking-widest rounded-sm transition-all flex items-center gap-2 shadow-lg active:scale-[0.98] disabled:opacity-50"
              >
                {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 stroke-[3]" />}
                Apply {acceptedCount} Accepted
              </button>
            )}
          </div>

          {/* Diff Cards */}
          <div className="space-y-4">
            {results.map(r => {
              const status = cardStatuses[r.agreementId] ?? 'pending'
              const isExpanded = expandedCards.has(r.agreementId)
              if (r.status === 'error') {
                return (
                  <div key={r.agreementId} className="bg-rust-soft/20 border border-rust/10 rounded-sm p-5 flex items-center gap-4 shadow-sm">
                    <X className="w-5 h-5 text-rust flex-shrink-0 stroke-[3]" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-rust uppercase tracking-wider">{r.investorName || r.referenceId}</p>
                      <p className="text-sm text-rust font-medium italic mt-0.5">{r.error}</p>
                    </div>
                  </div>
                )
              }

              const fields = [
                { label: 'Investor', key: 'investor_name' },
                { label: 'Principal', key: 'principal_amount', format: (v: number) => `₹${v?.toLocaleString('en-IN')}` },
                { label: 'ROI', key: 'roi_percentage', format: (v: number) => `${v}%` },
                { label: 'Maturity', key: 'maturity_date' },
                { label: 'Frequency', key: 'payout_frequency' },
                { label: 'Type', key: 'interest_type' },
              ]

              const current = r.current as Record<string, unknown> | undefined
              const extracted = r.extracted as Record<string, unknown> | undefined

              const changes = fields.filter(f => {
                const oldVal = current?.[f.key]
                const newVal = extracted?.[f.key]
                return String(oldVal ?? '') !== String(newVal ?? '')
              })

              const flags = r.flags ?? []
              const errorFlags = flags.filter(f => f.severity === 'error')

              return (
                <div
                  key={r.agreementId}
                  className={`bg-surface border rounded-sm transition-all shadow-sm ${
                    status === 'applied' ? 'border-forest bg-forest-soft/10 opacity-70' :
                    status === 'accepted' ? 'border-gain bg-gain-soft/10 ring-1 ring-gain/20' :
                    status === 'skipped' ? 'border-hairline bg-canvas opacity-60' :
                    'border-hairline'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-5 flex items-center gap-4">
                    <span className="num text-[10px] font-bold text-ink-4 tracking-widest w-24 shrink-0">{r.referenceId}</span>
                    <span className="flex-1 text-[15px] font-bold text-ink-1 font-serif truncate">{r.investorName}</span>
                    <div className="flex items-center gap-4 px-4">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${changes.length > 0 ? 'text-clay' : 'text-ink-5 opacity-40'}`}>
                        {changes.length} change{changes.length !== 1 ? 's' : ''}
                      </span>
                      {errorFlags.length > 0 && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-rust-soft text-rust rounded-sm border border-rust/10">
                          <AlertTriangle className="w-3 h-3" />
                          <span className="num text-[10px] font-bold">{errorFlags.length}</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        const next = new Set(expandedCards)
                        if (next.has(r.agreementId)) next.delete(r.agreementId)
                        else next.add(r.agreementId)
                        setExpandedCards(next)
                      }}
                      className="text-[10px] font-bold uppercase tracking-widest text-ink-4 hover:text-ink-1 underline underline-offset-4 decoration-hairline-strong transition-all"
                    >
                      {isExpanded ? 'Collapse' : 'Compare'}
                    </button>
                  </div>

                  {/* Diff Details */}
                  {isExpanded && (
                    <div className="px-5 pb-5 animate-in slide-in-from-top-1">
                      {changes.length > 0 ? (
                        <div className="bg-canvas border border-hairline rounded-sm p-4 space-y-2 mb-4">
                          {changes.map(f => (
                            <div key={f.key} className="flex items-center gap-6 text-[11px] font-medium">
                              <span className="lbl w-20 shrink-0 opacity-60">{f.label}</span>
                              <span className="text-ink-4 line-through opacity-50 num">{f.format ? f.format(current?.[f.key] as number) : String(current?.[f.key] ?? '—')}</span>
                              <ArrowRight className="w-3 h-3 text-clay shrink-0" />
                              <span className="text-earth-brown font-bold num">{f.format ? f.format(extracted?.[f.key] as number) : String(extracted?.[f.key] ?? '—')}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] italic text-ink-5 py-2 mb-2">No top-level metadata changes.</p>
                      )}

                      {errorFlags.length > 0 && (
                        <div className="space-y-1 mb-4">
                          {errorFlags.map(f => (
                            <div key={f.id} className="text-[11px] font-semibold text-rust flex items-start gap-2 bg-rust-soft/20 px-3 py-1.5 rounded-sm border border-rust/10">
                              <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                              <span>{f.message} (Expected: {f.expected} · Found: {f.found})</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {status === 'pending' && (
                    <div className="px-5 py-4 border-t border-hairline flex gap-3 bg-surface-2/50 items-center">
                      <button
                        onClick={() => setCardStatuses(prev => ({ ...prev, [r.agreementId]: 'accepted' }))}
                        className="h-8 px-5 text-[10px] font-bold uppercase tracking-widest bg-gain-soft text-gain border border-gain/20 rounded-sm hover:bg-gain hover:text-paper transition-all shadow-sm flex items-center gap-1.5"
                      >
                        <Check className="w-3 h-3 stroke-[3]" /> Accept
                      </button>
                      <button
                        onClick={() => setCardStatuses(prev => ({ ...prev, [r.agreementId]: 'skipped' }))}
                        className="h-8 px-5 text-[10px] font-bold uppercase tracking-widest bg-canvas text-ink-4 border border-hairline rounded-sm hover:bg-surface-3 transition-all flex items-center gap-1.5"
                      >
                        <X className="w-3 h-3" /> Skip
                      </button>
                      <button
                        onClick={() => handleApply(r.agreementId)}
                        disabled={applyingIds.has(r.agreementId)}
                        className="h-8 px-5 text-[10px] font-bold uppercase tracking-widest bg-forest text-paper rounded-sm hover:bg-ink-1 transition-all flex items-center gap-2 ml-auto shadow-md disabled:opacity-40"
                      >
                        {applyingIds.has(r.agreementId) ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                        Apply Now
                      </button>
                    </div>
                  )}
                  
                  {status === 'applied' && (
                    <div className="px-5 py-2 border-t border-forest/10 flex justify-end">
                      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-forest">Applied</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
