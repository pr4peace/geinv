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
  const [filterStatus, setFilterStatus] = useState<string>('all')
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
    setAgreements((data ?? []).map((a: Record<string, unknown>) => ({
      id: a.id as string,
      reference_id: a.reference_id as string,
      investor_name: a.investor_name as string,
      principal_amount: Number(a.principal_amount) ?? 0,
      roi_percentage: Number(a.roi_percentage) ?? 0,
      maturity_date: (a.maturity_date as string) ?? '',
      doc_status: (a.doc_status as string) ?? 'draft',
    })))
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
    if (filterStatus !== 'all' && a.doc_status !== filterStatus) return false
    return true
  })

  const allVisibleSelected = filtered.length > 0 && filtered.every(a => selectedIds.has(a.id))

  const acceptedCount = Object.values(cardStatuses).filter(s => s === 'accepted').length
  const skippedCount = Object.values(cardStatuses).filter(s => s === 'skipped').length
  const appliedCount = Object.values(cardStatuses).filter(s => s === 'applied').length

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Batch Rescan</h1>
          <p className="text-xs text-slate-500 mt-0.5">Select agreements → scan in parallel → review diffs → apply in bulk</p>
        </div>
        {loaded && results.length === 0 && (
          <button
            onClick={handleScan}
            disabled={selectedIds.size === 0 || scanning}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
          >
            {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {scanning ? `Scanning ${scanProgress}/${scanTotal}...` : `Scan ${selectedIds.size} Selected`}
          </button>
        )}
      </div>

      {/* Scan progress */}
      {scanning && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
            <div className="flex-1">
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${(scanProgress / scanTotal) * 100}%` }}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">{scanProgress} of {scanTotal} scanned</p>
            </div>
          </div>
        </div>
      )}

      {/* Agreement Selection */}
      {results.length === 0 && !scanning && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search investor or reference..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200"
            >
              <option value="all">All Status</option>
              <option value="uploaded">Uploaded</option>
              <option value="draft">Draft</option>
            </select>
            {!loaded && (
              <button
                onClick={loadAgreements}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg"
              >
                Load Agreements
              </button>
            )}
          </div>

          {loaded && (
            <>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={() => toggleAll(filtered)}
                  className="accent-indigo-500"
                />
                <span>Select all {filtered.length} visible · {selectedIds.size} total selected (max 20)</span>
              </div>

              <div className="max-h-[400px] overflow-y-auto space-y-1">
                {filtered.slice(0, 200).map(a => (
                  <label
                    key={a.id}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                      selectedIds.has(a.id) ? 'bg-indigo-900/20 border border-indigo-800/50' : 'hover:bg-slate-800/50 border border-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                      disabled={selectedIds.size >= 20 && !selectedIds.has(a.id)}
                      className="accent-indigo-500"
                    />
                    <span className="font-mono text-[10px] text-slate-500 w-24">{a.reference_id}</span>
                    <span className="flex-1 text-sm text-slate-200 truncate">{a.investor_name}</span>
                    <span className="text-xs text-slate-400">₹{(a.principal_amount / 100000).toFixed(1)}L</span>
                    <span className="text-[10px] text-slate-500 uppercase">{a.doc_status}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <>
          {/* Summary bar */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-4 text-xs">
              <span className="text-slate-400"><strong className="text-emerald-400">{acceptedCount}</strong> accepted</span>
              <span className="text-slate-400"><strong className="text-amber-400">{skippedCount}</strong> skipped</span>
              <span className="text-slate-400"><strong className="text-indigo-400">{appliedCount}</strong> applied</span>
              <span className="text-slate-400"><strong className="text-slate-200">{results.length}</strong> total</span>
            </div>
            {acceptedCount > 0 && (
              <button
                onClick={handleApplyAll}
                disabled={applying}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
              >
                {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Apply {acceptedCount} Accepted
              </button>
            )}
          </div>

          {/* Diff Cards */}
          <div className="space-y-3">
            {results.map(r => {
              const status = cardStatuses[r.agreementId] ?? 'pending'
              const isExpanded = expandedCards.has(r.agreementId)
              if (r.status === 'error') {
                return (
                  <div key={r.agreementId} className="bg-red-900/20 border border-red-800 rounded-xl p-4 flex items-center gap-3">
                    <X className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-red-200">{r.investorName || r.referenceId}</p>
                      <p className="text-xs text-red-400/70">{r.error}</p>
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
                  className={`border rounded-xl transition-colors ${
                    status === 'applied' ? 'border-indigo-800 bg-indigo-900/10' :
                    status === 'accepted' ? 'border-emerald-800 bg-emerald-900/10' :
                    status === 'skipped' ? 'border-slate-700 bg-slate-800/30 opacity-60' :
                    'border-slate-700 bg-slate-800/50'
                  }`}
                >
                  {/* Card Header */}
                  <div className="p-4 flex items-center gap-3">
                    <span className="font-mono text-[10px] text-slate-500 w-24">{r.referenceId}</span>
                    <span className="flex-1 text-sm font-medium text-slate-200 truncate">{r.investorName}</span>
                    <span className="text-xs text-slate-400">
                      {changes.length} change{changes.length !== 1 ? 's' : ''}
                    </span>
                    {errorFlags.length > 0 && (
                      <span className="flex items-center gap-1 text-[10px] text-red-400">
                        <AlertTriangle className="w-3 h-3" /> {errorFlags.length}
                      </span>
                    )}
                    <button
                      onClick={() => {
                        const next = new Set(expandedCards)
                        if (next.has(r.agreementId)) next.delete(r.agreementId)
                        else next.add(r.agreementId)
                        setExpandedCards(next)
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      {isExpanded ? 'Collapse' : 'Expand'}
                    </button>
                  </div>

                  {/* Diff Details */}
                  {isExpanded && changes.length > 0 && (
                    <div className="px-4 pb-3 space-y-2">
                      {changes.map(f => (
                        <div key={f.key} className="flex items-center gap-3 text-xs">
                          <span className="w-20 text-slate-500">{f.label}</span>
                          <span className="text-slate-400 line-through">{f.format ? f.format(current?.[f.key] as number) : String(current?.[f.key] ?? '—')}</span>
                          <ArrowRight className="w-3 h-3 text-amber-500" />
                          <span className="text-amber-200">{f.format ? f.format(extracted?.[f.key] as number) : String(extracted?.[f.key] ?? '—')}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {isExpanded && errorFlags.length > 0 && (
                    <div className="px-4 pb-3 space-y-1">
                      {errorFlags.map(f => (
                        <div key={f.id} className="text-xs text-red-400 flex items-start gap-2">
                          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          <span>{f.message}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  {status === 'pending' && (
                    <div className="px-4 py-3 border-t border-slate-700/50 flex gap-2">
                      <button
                        onClick={() => setCardStatuses(prev => ({ ...prev, [r.agreementId]: 'accepted' }))}
                        className="px-3 py-1.5 text-xs font-semibold bg-emerald-900/40 text-emerald-400 hover:bg-emerald-800/40 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> Accept
                      </button>
                      <button
                        onClick={() => setCardStatuses(prev => ({ ...prev, [r.agreementId]: 'skipped' }))}
                        className="px-3 py-1.5 text-xs font-semibold bg-slate-700 text-slate-400 hover:bg-slate-600 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> Skip
                      </button>
                      <button
                        onClick={() => handleApply(r.agreementId)}
                        disabled={applyingIds.has(r.agreementId)}
                        className="px-3 py-1.5 text-xs font-semibold bg-indigo-900/40 text-indigo-400 hover:bg-indigo-800/40 rounded-lg transition-colors flex items-center gap-1 ml-auto disabled:opacity-50"
                      >
                        {applyingIds.has(r.agreementId) ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
                        Apply Now
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
