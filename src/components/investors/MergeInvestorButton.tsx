'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { GitMerge } from 'lucide-react'

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
  const [targetId, setTargetId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const others = allInvestors.filter((i) => i.id !== investorId)

  async function handleMerge() {
    if (!targetId) return
    const target = others.find((i) => i.id === targetId)
    if (!confirm(`Merge "${investorName}" into "${target?.name}"?\n\nAll agreements and notes from "${investorName}" will move to "${target?.name}", and "${investorName}" will be deleted. This cannot be undone.`)) return

    setLoading(true)
    setError(null)
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
          onClick={handleMerge}
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
      {error && <p className="text-xs text-red-400">{error}</p>}
      <p className="text-xs text-slate-500">All agreements and notes move to the selected investor. This investor record is then deleted.</p>
    </div>
  )
}
