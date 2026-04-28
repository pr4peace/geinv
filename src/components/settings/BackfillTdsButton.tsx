'use client'

import { useState } from 'react'
import { Database, Loader2, CheckCircle2 } from 'lucide-react'

export default function BackfillTdsButton() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ updated: number; skipped: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleBackfill() {
    if (!confirm('This will insert missing 31st March TDS rows for all cumulative/compound agreements. Continue?')) {
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/admin/backfill-tds-rows', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to backfill')

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={handleBackfill}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/50 text-slate-200 rounded-lg border border-slate-700 transition-colors text-sm font-medium"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Database className="w-4 h-4" />
        )}
        Backfill TDS Filing Rows
      </button>

      {result && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-900/20 px-3 py-2 rounded-lg border border-emerald-800/30">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Updated: {result.updated}, Skipped: {result.skipped}</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-400 bg-red-900/20 px-3 py-2 rounded-lg border border-red-800/30">
          Error: {error}
        </p>
      )}
    </div>
  )
}
