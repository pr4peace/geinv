'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

export default function DeleteAgreementButton({
  agreementId,
}: {
  agreementId: string
  investorName?: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/agreements/${agreementId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Delete failed')
        setLoading(false)
        return
      }
      router.push('/agreements')
      router.refresh()
    } catch {
      setError('Network error — please try again')
      setLoading(false)
    }
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-1.5 h-7 px-3 border border-rust/40 text-rust text-[10px] font-bold uppercase rounded-sm hover:bg-rust-soft transition-all shadow-sm"
      >
        <Trash2 className="w-3 h-3" />
        Delete
      </button>
    )
  }

  return (
    <div className="flex flex-col items-end gap-2 animate-in fade-in slide-in-from-right-2">
      <p className="text-[10px] font-bold text-rust italic text-right">
        Move to trash? Can be restored later.
      </p>
      {error && <p className="text-[10px] font-bold uppercase text-rust">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="text-[10px] font-bold uppercase text-ink-4 hover:text-ink-2 px-3 py-1 transition-colors disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="h-7 px-3 bg-rust text-paper text-[10px] font-bold uppercase rounded-sm hover:bg-rust-2 transition-all shadow-sm disabled:opacity-50"
        >
          {loading ? 'Deleting…' : 'Yes, Delete'}
        </button>
      </div>
    </div>
  )
}
