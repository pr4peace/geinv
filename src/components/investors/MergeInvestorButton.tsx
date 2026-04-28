'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GitMerge, AlertTriangle } from 'lucide-react'

interface Investor {
  id: string
  name: string
}

export default function MergeInvestorButton({
  investorId,
  investorName,
  allInvestors,
}: {
  investorId: string
  investorName: string
  allInvestors: Investor[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const others = allInvestors.filter((i) => i.id !== investorId)

  async function proceedMerge() {
    setLoading(true)
    setError(null)
    setConfirming(false)
    try {
      const res = await fetch(`/api/investors/${investorId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ into: targetId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Merge failed')
        setLoading(false)
        return
      }
      router.push(`/investors/${targetId}`)
      router.refresh()
    } catch {
      setError('Network error')
      setLoading(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 border border-slate-700 hover:bg-slate-800 transition-colors"
      >
        <GitMerge className="w-3.5 h-3.5" />
        Merge duplicate
      </button>
    )
  }

  if (confirming) {
    const target = others.find((i) => i.id === targetId)
    return (
      <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl p-4 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-amber-200">Final Confirmation</h4>
            <p className="text-xs text-amber-300/80 leading-relaxed">
              Merge <span className="font-bold">&quot;{investorName}&quot;</span> into <span className="font-bold">&quot;{target?.name}&quot;</span>?
              <br />
              All agreements and notes will move. This record will be deleted.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={proceedMerge}
            disabled={loading}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold rounded uppercase transition-colors"
          >
            Confirm Merge
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={loading}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded uppercase transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-slate-400">Merge <span className="text-slate-200 font-medium">{investorName}</span> into:</p>
      <div className="flex items-center gap-2">
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="">Select investor…</option>
          {others.map((i) => (
            <option key={i.id} value={i.id}>{i.name}</option>
          ))}
        </select>
        <button
          onClick={() => setConfirming(true)}
          disabled={!targetId || loading}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-40"
        >
          {loading ? 'Merging…' : 'Merge'}
        </button>
        <button
          onClick={() => { setOpen(false); setTargetId('') }}
          className="px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-slate-700 hover:bg-slate-800 transition-colors"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      <p className="text-xs text-slate-500 mt-1">All agreements and notes move to the selected investor. This investor record is then deleted.</p>
    </div>
  )
}
