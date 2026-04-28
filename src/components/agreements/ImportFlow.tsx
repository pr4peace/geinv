'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Upload, ArrowLeft, CheckCircle, AlertTriangle, XCircle, Loader2, Undo2 } from 'lucide-react'
import Link from 'next/link'
import { parseCSVRow } from '@/lib/csv-parser'
import type { ParsedImportRow } from '@/lib/csv-parser'

// ─── Types ────────────────────────────────────────────────────────────────────

type RowState = 'import' | 'skip' | 'blocked' | 'warn'

interface PreviewRow {
  row: ParsedImportRow
  state: RowState
  reason?: string
  selected: boolean  // user can deselect rows before importing
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

const stateStyle: Record<RowState, { row: string; badge: string; label: string }> = {
  import:  { row: 'hover:bg-slate-700/20',                          badge: 'bg-green-900/40 text-green-400',  label: 'Will import' },
  skip:    { row: 'opacity-50',                                      badge: 'bg-amber-900/40 text-amber-400',  label: 'Duplicate — skip' },
  blocked: { row: 'opacity-50',                                      badge: 'bg-red-900/40 text-red-400',      label: 'Active — blocked' },
  warn:    { row: 'bg-amber-900/5',                                  badge: 'bg-slate-700 text-slate-400',     label: 'Parse warning' },
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ImportFlow() {
  const router = useRouter()
  const [step, setStep] = useState<'upload' | 'checking' | 'preview' | 'importing' | 'done'>('upload')
  const [undoing, setUndoing] = useState(false)
  const [confirmUndo, setConfirmUndo] = useState(false)
  const [undoResult, setUndoResult] = useState<string | null>(null)

  async function handleUndoImport() {
    setUndoing(true)
    setUndoResult(null)
    setConfirmUndo(false)
    try {
      const res = await fetch('/api/agreements/import', { method: 'DELETE' })
      const data = await res.json()
      setUndoResult(data.error ? `Error: ${data.error}` : `Done — ${data.deleted} record(s) moved to trash.`)
    } catch {
      setUndoResult('Network error')
    } finally {
      setUndoing(false)
    }
  }
  const [checkProgress, setCheckProgress] = useState({ done: 0, total: 0 })
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  // ── Parse file ──────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    setParseError(null)
    try {
      let rows: string[][]

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]
      } else {
        const text = await file.text()
        const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true })
        rows = parsed.data
      }

      // Skip header row
      const dataRows = rows.slice(1).filter((r) => r.some((c) => c?.toString().trim()))

      if (dataRows.length === 0) {
        setParseError('No data rows found in file.')
        return
      }

      const parsed: ParsedImportRow[] = dataRows
        .map((cols, i) => parseCSVRow(cols.map((c) => c?.toString() ?? ''), i + 2))
        .filter((r) => r.investor_name.trim().length > 0)

      // Show checking state with progress
      setCheckProgress({ done: 0, total: parsed.length })
      setStep('checking')

      const preview = await buildPreview(parsed)
      setPreview(preview)
      setStep('preview')
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file')
      setStep('upload')
    }
  }

  async function buildPreview(rows: ParsedImportRow[]): Promise<PreviewRow[]> {
    const results: PreviewRow[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      setCheckProgress({ done: i + 1, total: rows.length })

      if (row.status !== 'matured') {
        const reasonMap: Record<string, string> = {
          active: 'Active — enter manually via PDF upload',
          cancelled: 'Cancelled — needs document, enter manually',
          combined: 'Combined — needs document, enter manually',
        }
        results.push({
          row,
          state: 'blocked',
          reason: reasonMap[row.status] ?? 'Must be entered manually',
          selected: false,
        })
        continue
      }

      if (row._parseWarnings.length > 0 && (!row.agreement_date || !row.maturity_date || row.principal_amount === 0)) {
        results.push({ row, state: 'warn', reason: row._parseWarnings.join('; '), selected: false })
        continue
      }

      // Check duplicate
      if (row.agreement_date) {
        const params = new URLSearchParams({ investor_name: row.investor_name, agreement_date: row.agreement_date })
        if (row.investor_pan) params.set('investor_pan', row.investor_pan)
        try {
          const res = await fetch(`/api/agreements/check-duplicate?${params}`)
          const data = await res.json()
          if (data.duplicates?.length > 0) {
            results.push({ row, state: 'skip', reason: `Already exists (${data.duplicates[0].reference_id})`, selected: false })
            continue
          }
        } catch { /* non-fatal */ }
      }

      results.push({ row, state: 'import', selected: true })
    }

    return results
  }

  // ── Drag and drop ────────────────────────────────────────────────────────────

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Toggle row selection ──────────────────────────────────────────────────────

  function toggleRow(idx: number) {
    setPreview((prev) => prev.map((p, i) => i === idx && p.state === 'import' ? { ...p, selected: !p.selected } : p))
  }

  function toggleAll(checked: boolean) {
    setPreview((prev) => prev.map((p) => p.state === 'import' ? { ...p, selected: checked } : p))
  }

  // ── Import ───────────────────────────────────────────────────────────────────

  async function handleImport() {
    const toImport = preview.filter((p) => p.state === 'import' && p.selected).map((p) => p.row)
    if (toImport.length === 0) return

    setStep('importing')
    try {
      const res = await fetch('/api/agreements/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: toImport }),
      })
      const data = await res.json()
      setResult({
        imported: data.imported ?? 0,
        skipped: preview.filter((p) => p.state === 'skip').length + (data.skipped ?? 0),
        errors: data.errors ?? [],
      })
      setStep('done')
    } catch {
      setResult({ imported: 0, skipped: 0, errors: ['Network error — please try again'] })
      setStep('done')
    }
  }

  // ── Counts ────────────────────────────────────────────────────────────────────

  const importableRows = preview.filter((p) => p.state === 'import')
  const selectedCount = importableRows.filter((p) => p.selected).length
  const allSelected = importableRows.length > 0 && importableRows.every((p) => p.selected)
  const counts = {
    import:  importableRows.length,
    skip:    preview.filter((p) => p.state === 'skip').length,
    blocked: preview.filter((p) => p.state === 'blocked').length,
    warn:    preview.filter((p) => p.state === 'warn').length,
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        <Link href="/agreements" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" />
          All Agreements
        </Link>

        <div>
          <h1 className="text-xl font-bold text-slate-100">Import from Spreadsheet</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Only <span className="text-slate-300">Expired / Matured</span> agreements are imported. Active, Cancelled, and Combined rows are blocked — those need to be entered manually with the original document via <Link href="/agreements/new" className="text-indigo-400 hover:text-indigo-300">+ New Agreement</Link>.
          </p>
        </div>

        {/* ── Upload step ── */}
        {step === 'upload' && (
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-16 text-center transition-colors ${
              dragOver ? 'border-indigo-500 bg-indigo-900/10' : 'border-slate-700 hover:border-slate-600'
            }`}
          >
            <Upload className="w-10 h-10 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-300 font-medium mb-1">Drop your CSV or Excel file here</p>
            <p className="text-sm text-slate-500 mb-4">Supports .csv and .xlsx from Google Sheets export</p>
            <label className="cursor-pointer px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
              Choose File
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
              />
            </label>
            {parseError && <p className="mt-4 text-sm text-red-400">{parseError}</p>}
          </div>
        )}

        {/* Undo import — always visible on upload step */}
        {step === 'upload' && (
          <div className="px-5 py-3 bg-slate-800/50 border border-slate-700 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-300 font-medium">Undo previous import</p>
                <p className="text-xs text-slate-500 mt-0.5">Soft-deletes all agreements imported from CSV — they can be restored from the Deleted section on the Agreements page.</p>
              </div>
              {!confirmUndo ? (
                <button
                  onClick={() => { setConfirmUndo(true); setUndoResult(null) }}
                  disabled={undoing}
                  className="ml-6 flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 border border-slate-600 hover:bg-slate-700 transition-colors disabled:opacity-40"
                >
                  {undoing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                  {undoing ? 'Undoing…' : 'Undo import'}
                </button>
              ) : (
                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-2">
                  <span className="text-xs text-amber-400 font-medium">Are you sure?</span>
                  <button
                    onClick={handleUndoImport}
                    disabled={undoing}
                    className="text-xs font-bold text-red-400 hover:text-red-300 transition-colors uppercase"
                  >
                    Yes, Delete
                  </button>
                  <button
                    onClick={() => setConfirmUndo(false)}
                    disabled={undoing}
                    className="text-xs font-bold text-slate-500 hover:text-slate-400 transition-colors uppercase"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
            {undoResult && <p className="text-xs text-green-400">{undoResult}</p>}
          </div>
        )}

        {/* ── Checking duplicates ── */}
        {step === 'checking' && (
          <div className="flex flex-col items-center justify-center py-24 gap-5">
            <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
            <div className="text-center">
              <p className="text-slate-300 font-medium">Checking for duplicates…</p>
              <p className="text-sm text-slate-500 mt-1">
                {checkProgress.done} of {checkProgress.total} rows checked
              </p>
            </div>
            {/* Progress bar */}
            <div className="w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full transition-all duration-200"
                style={{ width: `${checkProgress.total ? (checkProgress.done / checkProgress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Preview step ── */}
        {step === 'preview' && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-900/20 border border-green-800">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm text-green-400 font-medium">{counts.import} ready to import</span>
              </div>
              {counts.skip > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-900/20 border border-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm text-amber-400 font-medium">{counts.skip} duplicates (skip)</span>
                </div>
              )}
              {counts.blocked > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-900/20 border border-red-800">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <span className="text-sm text-red-400 font-medium">{counts.blocked} blocked — enter manually</span>
                </div>
              )}
              {counts.warn > 0 && (
                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700">
                  <AlertTriangle className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-400 font-medium">{counts.warn} parse warnings</span>
                </div>
              )}
            </div>

            {/* Table */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700 text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={allSelected}
                          onChange={(e) => toggleAll(e.target.checked)}
                          className="rounded border-slate-600 bg-slate-700 text-indigo-500"
                          title="Select all importable rows"
                        />
                      </th>
                      <th className="text-left px-3 py-3">Investor</th>
                      <th className="text-left px-3 py-3">PAN</th>
                      <th className="text-right px-3 py-3">Principal</th>
                      <th className="text-left px-3 py-3">ROI / Freq</th>
                      <th className="text-left px-3 py-3">Start → Maturity</th>
                      <th className="text-left px-3 py-3">Status</th>
                      <th className="text-left px-3 py-3">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/50">
                    {preview.map((p, i) => {
                      const s = stateStyle[p.state]
                      return (
                        <tr key={i} className={`${s.row} transition-colors`}>
                          <td className="px-4 py-2.5 w-10">
                            {p.state === 'import' && (
                              <input
                                type="checkbox"
                                checked={p.selected}
                                onChange={() => toggleRow(i)}
                                className="rounded border-slate-600 bg-slate-700 text-indigo-500"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="text-slate-200 font-medium">{p.row.investor_name}</p>
                            {p.row.investor2_name && (
                              <p className="text-xs text-slate-500">+ {p.row.investor2_name}</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-xs text-slate-400">{p.row.investor_pan ?? '—'}</td>
                          <td className="px-3 py-2.5 text-right text-slate-200">
                            {p.row.principal_amount ? fmtCurrency(p.row.principal_amount) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-slate-400 text-xs">
                            {p.row.roi_percentage}% / {p.row.payout_frequency}
                          </td>
                          <td className="px-3 py-2.5 text-slate-400 text-xs">
                            {p.row.agreement_date || '—'} → {p.row.maturity_date || '—'}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize bg-slate-700 text-slate-300">
                              {p.row.status}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${s.badge}`}>
                              {p.state === 'import' ? (p.selected ? 'Will import' : 'Skipped (unchecked)') : s.label}
                            </span>
                            {p.reason && <p className="text-xs text-slate-500 mt-0.5">{p.reason}</p>}
                            {p.row._parseWarnings.length > 0 && p.state !== 'blocked' && p.state !== 'skip' && (
                              <p className="text-xs text-amber-500 mt-0.5">{p.row._parseWarnings[0]}</p>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => { setPreview([]); setStep('upload') }}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 border border-slate-700 hover:bg-slate-800 transition-colors"
              >
                ← Choose different file
              </button>
              <div className="flex items-center gap-3">
                <p className="text-sm text-slate-500">
                  {selectedCount} of {counts.import} selected
                </p>
                <button
                  onClick={handleImport}
                  disabled={selectedCount === 0}
                  className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-medium transition-colors"
                >
                  Import {selectedCount} agreement{selectedCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Importing ── */}
        {step === 'importing' && (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
            <p className="text-slate-300 font-medium">Importing agreements…</p>
            <p className="text-sm text-slate-500">This may take a moment.</p>
          </div>
        )}

        {/* ── Done ── */}
        {step === 'done' && result && (
          <div className="space-y-4">
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-8 text-center space-y-4">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
              <h2 className="text-xl font-bold text-slate-100">Import complete</h2>
              <div className="flex justify-center gap-10 mt-2">
                <div>
                  <p className="text-3xl font-bold text-green-400">{result.imported}</p>
                  <p className="text-sm text-slate-500 mt-1">Imported</p>
                </div>
                <div>
                  <p className="text-3xl font-bold text-amber-400">{result.skipped}</p>
                  <p className="text-sm text-slate-500 mt-1">Skipped (duplicates)</p>
                </div>
                {result.errors.length > 0 && (
                  <div>
                    <p className="text-3xl font-bold text-red-400">{result.errors.length}</p>
                    <p className="text-sm text-slate-500 mt-1">Errors</p>
                  </div>
                )}
              </div>

              {/* Where did data go */}
              <div className="mt-4 bg-slate-900 rounded-lg px-5 py-4 text-left space-y-2">
                <p className="text-sm font-medium text-slate-300">Where is my data?</p>
                <p className="text-sm text-slate-400">
                  Your {result.imported} imported agreements are now in the{' '}
                  <Link href="/agreements?status=matured" className="text-indigo-400 hover:text-indigo-300 underline">
                    Agreements list → Matured tab
                  </Link>
                  .
                </p>
                <p className="text-xs text-slate-500">
                  Blocked rows (Active, Cancelled, Combined) were not imported — add those individually via <Link href="/agreements/new" className="text-indigo-400 hover:text-indigo-300">+ New Agreement</Link> with the original document.
                </p>
                <p className="text-xs text-slate-500">
                  Made a mistake? Select records in the Agreements list and use bulk delete — they&apos;re soft-deleted and can be restored.
                </p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="bg-red-900/20 border border-red-800 rounded-xl p-4">
                <p className="text-sm font-medium text-red-400 mb-2">Errors</p>
                <ul className="space-y-1">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-xs text-red-300">{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-center gap-3">
              <button
                onClick={() => { setStep('upload'); setResult(null); setPreview([]) }}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 border border-slate-700 hover:bg-slate-800 transition-colors"
              >
                Import another file
              </button>
              <button
                onClick={() => router.push('/agreements?status=matured')}
                className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              >
                View matured agreements →
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
