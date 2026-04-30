
'use client'

import { useState } from 'react'
import { CalendarClock, Loader2, CheckCircle2, AlertCircle } from 'lucide-react'

export default function SyncMaturedButton() {
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<{ updated: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSync() {
    setLoading(true)
    setError(null)
    setResult(null)
    setConfirming(false)

    try {
      const res = await fetch('/api/admin/sync-matured-status', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error || 'Failed to sync')

      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-3">
      {confirming ? (
        <div className="flex items-center gap-4 bg-slate-800/50 border border-slate-700 px-4 py-3 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200 max-w-md">
          <div className="space-y-1 flex-1">
            <p className="text-sm font-medium text-slate-200">Update agreement statuses?</p>
            <p className="text-[11px] text-slate-400">Marks active agreements with past maturity dates as &apos;Matured&apos;.</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSync}
              disabled={loading}
              className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={loading}
              className="text-xs font-bold text-slate-500 hover:text-slate-400 transition-colors uppercase disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            setResult(null)
            setError(null)
            setConfirming(true)
          }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 rounded-lg border border-slate-700 transition-colors text-sm font-medium"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CalendarClock className="w-4 h-4" />
          )}
          Sync Matured Status
        </button>
      )}

      {result && (
        <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-900/20 px-3 py-2 rounded-lg border border-emerald-800/30 w-fit">
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Updated {result.updated} agreement(s) to Matured status.</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-900/20 px-3 py-2 rounded-lg border border-red-800/30 w-fit">
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Error: {error}</span>
        </div>
      )}
    </div>
  )
}
