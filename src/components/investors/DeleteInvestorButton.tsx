'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, AlertCircle, Loader2 } from 'lucide-react'

interface DeleteInvestorButtonProps {
  investorId: string
  investorName: string
  agreementCount: number
}

interface BlockingAgreement {
  id: string
  reference_id: string
  status: string
}

export default function DeleteInvestorButton({
  investorId,
  investorName,
  agreementCount,
}: DeleteInvestorButtonProps) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [blockingAgreements, setBlockingAgreements] = useState<BlockingAgreement[]>([])

  async function handleDelete() {
    setError(null)
    setDeleting(true)
    try {
      const res = await fetch(`/api/investors/${investorId}`, {
        method: 'DELETE',
      })

      if (res.status === 409) {
        const data = await res.json()
        setBlockingAgreements(data.agreements || [])
        setError('Cannot delete — investor still has linked agreements.')
        setConfirming(false)
        return
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Delete failed (${res.status})`)
      }

      router.push('/investors')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred')
    } finally {
      setDeleting(false)
    }
  }

  if (agreementCount > 0) {
    return (
      <div className="relative group">
        <button
          disabled
          className="flex items-center gap-2 px-3 py-2 bg-slate-800 text-slate-500 rounded-lg cursor-not-allowed opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          <span>Delete Investor</span>
        </button>
        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block bg-slate-900 border border-slate-700 text-slate-200 text-xs py-1.5 px-3 rounded shadow-xl whitespace-nowrap z-10">
          Cannot delete — investor has {agreementCount} linked {agreementCount === 1 ? 'agreement' : 'agreements'}
        </div>
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-2">
        <div className="text-xs text-red-400 font-medium">
          Permanently delete {investorName}? This cannot be undone.
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setConfirming(false)}
            disabled={deleting}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 text-white text-xs font-bold rounded-lg transition-colors"
          >
            {deleting ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Deleting...
              </>
            ) : (
              'Confirm Delete'
            )}
          </button>
        </div>
        {error && (
          <div className="text-[10px] text-red-400 mt-1 max-w-[200px] text-right">
            {error}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => setConfirming(true)}
        className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-red-900/30 text-slate-400 hover:text-red-400 border border-slate-700 hover:border-red-900/50 rounded-lg transition-all"
      >
        <Trash2 className="w-4 h-4" />
        <span className="text-sm font-medium">Delete Investor</span>
      </button>

      {error && (
        <div className="flex flex-col items-end gap-1 mt-2">
          <div className="flex items-center gap-1.5 text-xs text-red-400 font-medium">
            <AlertCircle className="w-3.5 h-3.5" />
            {error}
          </div>
          {blockingAgreements.length > 0 && (
            <div className="bg-red-900/10 border border-red-900/20 rounded-lg p-2 mt-1 space-y-1">
              {blockingAgreements.map(a => (
                <div key={a.id} className="text-[10px] text-red-300 font-mono">
                  {a.reference_id} ({a.status})
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
