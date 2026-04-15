'use client'

import { useState, useEffect, useCallback } from 'react'
import { BarChart3, Plus, Download, RefreshCw } from 'lucide-react'
import type { QuarterlyReview, ReconciliationResult } from '@/types/database'
import UploadZone from '@/components/quarterly-review/UploadZone'
import ReconciliationResults from '@/components/quarterly-review/ReconciliationResults'

// Indian FY quarters: Q1=Apr-Jun, Q2=Jul-Sep, Q3=Oct-Dec, Q4=Jan-Mar
const QUARTER_DATES: Record<string, { start: string; end: string }> = {
  Q1: { start: '04-01', end: '06-30' },
  Q2: { start: '07-01', end: '09-30' },
  Q3: { start: '10-01', end: '12-31' },
  Q4: { start: '01-01', end: '03-31' },
}

function getQuarterDates(q: string, fy: string): { start: string; end: string } {
  const dates = QUARTER_DATES[q]
  // Q1–Q3 fall within the FY start year; Q4 (Jan–Mar) falls in FY start year + 1
  const year = q === 'Q4' ? String(Number(fy) + 1) : fy
  return {
    start: `${year}-${dates.start}`,
    end: `${year}-${dates.end}`,
  }
}

function currentQuarterLabel(): string {
  const now = new Date()
  const month = now.getMonth() + 1 // 1-12
  const year = now.getFullYear()
  let q: string
  let fyStart: number
  if (month >= 4 && month <= 6) { q = 'Q1'; fyStart = year }
  else if (month >= 7 && month <= 9) { q = 'Q2'; fyStart = year }
  else if (month >= 10 && month <= 12) { q = 'Q3'; fyStart = year }
  else { q = 'Q4'; fyStart = year - 1 }
  return `${q}-${fyStart}-${String(fyStart + 1).slice(-2)}`
}

const csvEscape = (val: unknown): string => {
  const s = val == null ? '' : String(val)
  return `"${s.replace(/"/g, '""')}"`
}

function entriesToCSV(entries: ReconciliationResult['matched'], prefix: string): string {
  if (entries.length === 0) return ''
  const keys: (keyof (typeof entries)[0])[] = ['investor_name', 'pan', 'system_amount', 'external_amount', 'due_by', 'notes']
  const header = [csvEscape(prefix), ...keys.map(csvEscape)].join(',')
  const rows = entries.map((e) =>
    [csvEscape(prefix), ...keys.map((k) => csvEscape(e[k]))].join(',')
  )
  return [header, ...rows].join('\n')
}

function buildCSV(
  incomingResult: ReconciliationResult | null,
  tdsResult: ReconciliationResult | null
): string {
  const sections: string[] = []
  if (incomingResult) {
    sections.push(entriesToCSV(incomingResult.matched, 'matched'))
    sections.push(entriesToCSV(incomingResult.missing, 'missing'))
    sections.push(entriesToCSV(incomingResult.extra, 'extra'))
    sections.push(entriesToCSV(incomingResult.mismatched, 'mismatch'))
  }
  if (tdsResult) {
    if (sections.length > 0) sections.push('')
    sections.push(entriesToCSV(tdsResult.matched, 'matched'))
    sections.push(entriesToCSV(tdsResult.missing, 'missing'))
    sections.push(entriesToCSV(tdsResult.extra, 'extra'))
    sections.push(entriesToCSV(tdsResult.mismatched, 'mismatch'))
  }
  return sections.filter(Boolean).join('\n')
}

export default function QuarterlyReviewPage() {
  const [reviews, setReviews] = useState<QuarterlyReview[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('')
  const [showCreateForm, setShowCreateForm] = useState(false)

  // Create form state
  const [newQ, setNewQ] = useState('Q1')
  const [newFY, setNewFY] = useState(String(new Date().getFullYear()))
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Reconciliation state
  const [reconciling, setReconciling] = useState<'incoming_funds' | 'tds' | 'both' | null>(null)
  const [reconcileError, setReconcileError] = useState<string | null>(null)

  const selectedReview = reviews.find((r) => r.id === selectedId) ?? null

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/quarterly-review')
      const data: QuarterlyReview[] = await res.json()
      setReviews(data)

      // Auto-select current quarter if exists
      if (data.length > 0 && !selectedId) {
        const currentQ = currentQuarterLabel()
        const match = data.find((r) => r.quarter === currentQ) ?? data[0]
        setSelectedId(match.id)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  const handleCreate = async () => {
    setCreateError(null)
    const yearNum = Number(newFY)
    if (!newFY || isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
      setCreateError('Please enter a valid 4-digit year (e.g. 2026)')
      return
    }
    setCreating(true)
    try {
      const fyStr = `${newFY}-${String(Number(newFY) + 1).slice(-2)}`
      const quarter = `${newQ}-${fyStr}`
      const { start, end } = getQuarterDates(newQ, newFY)
      const res = await fetch('/api/quarterly-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarter, quarter_start: start, quarter_end: end }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Failed to create')
      }
      const created: QuarterlyReview = await res.json()
      setReviews((prev) => [created, ...prev])
      setSelectedId(created.id)
      setShowCreateForm(false)
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create')
    } finally {
      setCreating(false)
    }
  }

  const handleReconcile = async (type: 'incoming_funds' | 'tds') => {
    if (!selectedReview) return
    setReconcileError(null)
    setReconciling(type)
    try {
      const res = await fetch(`/api/quarterly-review/${selectedReview.id}/reconcile-ui`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Reconciliation failed')
      }
      await fetchReviews()
    } catch (err) {
      setReconcileError(err instanceof Error ? err.message : 'Reconciliation failed')
    } finally {
      setReconciling(null)
    }
  }

  const handleDownload = () => {
    if (!selectedReview) return
    const csv = buildCSV(selectedReview.incoming_funds_result, selectedReview.tds_result)
    if (!csv) return
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reconciliation-${selectedReview.quarter}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const incomingStatus = (): 'not_uploaded' | 'uploaded' | 'reconciled' => {
    if (!selectedReview) return 'not_uploaded'
    if (selectedReview.incoming_funds_status === 'completed') return 'reconciled'
    if (selectedReview.incoming_funds_doc_url) return 'uploaded'
    return 'not_uploaded'
  }

  const tdsStatus = (): 'not_uploaded' | 'uploaded' | 'reconciled' => {
    if (!selectedReview) return 'not_uploaded'
    if (selectedReview.tds_status === 'completed') return 'reconciled'
    if (selectedReview.tds_doc_url) return 'uploaded'
    return 'not_uploaded'
  }

  const hasAnyResult =
    selectedReview?.incoming_funds_result != null || selectedReview?.tds_result != null

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Quarterly Review</h1>
            <p className="text-sm text-slate-500">Reconcile incoming funds and TDS filings</p>
          </div>
        </div>

        {hasAnyResult && (
          <button
            onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Report
          </button>
        )}
      </div>

      {/* Quarter Selector */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-slate-300 whitespace-nowrap">
            Quarter
          </label>
          {loading ? (
            <div className="h-9 w-48 bg-slate-700 rounded-lg animate-pulse" />
          ) : (
            <select
              value={showCreateForm ? '__new__' : selectedId}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  setShowCreateForm(true)
                  setSelectedId('')
                } else {
                  setShowCreateForm(false)
                  setSelectedId(e.target.value)
                }
              }}
              className="bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {reviews.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.quarter}
                </option>
              ))}
              <option value="__new__">+ Create new quarter</option>
            </select>
          )}
        </div>

        {/* Create New Quarter Form */}
        {showCreateForm && (
          <div className="mt-4 pt-4 border-t border-slate-700">
            <p className="text-sm font-medium text-slate-300 mb-3">Create new quarter</p>
            <div className="flex items-end gap-3 flex-wrap">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Quarter</label>
                <select
                  value={newQ}
                  onChange={(e) => setNewQ(e.target.value)}
                  className="bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Q1">Q1 (Apr–Jun)</option>
                  <option value="Q2">Q2 (Jul–Sep)</option>
                  <option value="Q3">Q3 (Oct–Dec)</option>
                  <option value="Q4">Q4 (Jan–Mar)</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">FY Start Year</label>
                <input
                  type="number"
                  value={newFY}
                  onChange={(e) => setNewFY(e.target.value)}
                  className="bg-slate-700 border border-slate-600 text-slate-100 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="2026"
                />
              </div>
              <div className="text-sm text-slate-400 pb-2">
                → {newQ}-{newFY}-{String(Number(newFY) + 1).slice(-2)}
              </div>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                {creating ? 'Creating…' : 'Create'}
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
            {createError && (
              <p className="mt-2 text-xs text-red-400">{createError}</p>
            )}
          </div>
        )}
      </div>

      {/* Main Panel */}
      {selectedReview && (
        <>
          {reconcileError && (
            <div className="mb-4 px-4 py-3 bg-red-950/40 border border-red-800 rounded-lg text-sm text-red-400">
              {reconcileError}
            </div>
          )}

          {/* Upload Zones */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Incoming Funds */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-4">
                Incoming Funds
                <span className="ml-1 text-xs font-normal text-slate-500">(Tally Export)</span>
              </h2>
              <UploadZone
                label="Upload .xlsx file"
                type="incoming_funds"
                status={incomingStatus()}
                reviewId={selectedReview.id}
                onUploadSuccess={fetchReviews}
              />
              <button
                onClick={() => handleReconcile('incoming_funds')}
                disabled={
                  !selectedReview.incoming_funds_doc_url || reconciling === 'incoming_funds'
                }
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
              >
                <RefreshCw
                  className={`w-4 h-4 ${reconciling === 'incoming_funds' ? 'animate-spin' : ''}`}
                />
                {reconciling === 'incoming_funds' ? 'Running…' : 'Run Reconciliation'}
              </button>
            </div>

            {/* TDS */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-slate-100 mb-4">
                TDS Filing
                <span className="ml-1 text-xs font-normal text-slate-500">(Tally Export)</span>
              </h2>
              <UploadZone
                label="Upload .xlsx file"
                type="tds"
                status={tdsStatus()}
                reviewId={selectedReview.id}
                onUploadSuccess={fetchReviews}
              />
              <button
                onClick={() => handleReconcile('tds')}
                disabled={!selectedReview.tds_doc_url || reconciling === 'tds'}
                className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
              >
                <RefreshCw
                  className={`w-4 h-4 ${reconciling === 'tds' ? 'animate-spin' : ''}`}
                />
                {reconciling === 'tds' ? 'Running…' : 'Run Reconciliation'}
              </button>
            </div>
          </div>

          {/* Results Panel */}
          {hasAnyResult && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-6">
              <h2 className="text-sm font-semibold text-slate-100">Results</h2>

              {selectedReview.incoming_funds_result && (
                <ReconciliationResults
                  type="incoming_funds"
                  result={selectedReview.incoming_funds_result}
                />
              )}

              {selectedReview.tds_result && (
                <ReconciliationResults
                  type="tds"
                  result={selectedReview.tds_result}
                />
              )}
            </div>
          )}
        </>
      )}

      {!loading && reviews.length === 0 && !showCreateForm && (
        <div className="text-center py-16 text-slate-500">
          <BarChart3 className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No quarterly reviews yet.</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="mt-3 text-indigo-400 hover:text-indigo-300 text-sm underline"
          >
            Create your first quarter
          </button>
        </div>
      )}
    </div>
  )
}
