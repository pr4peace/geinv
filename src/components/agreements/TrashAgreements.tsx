'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react'
import type { Agreement } from '@/types/database'

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtCurrency(v: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v)
}

const statusCls: Record<string, string> = {
  active: 'bg-green-900/40 text-green-400',
  matured: 'bg-slate-700 text-slate-300',
  cancelled: 'bg-red-900/40 text-red-400',
  combined: 'bg-purple-900/40 text-purple-400',
}

export default function TrashAgreements({ agreements }: { agreements: Agreement[] }) {
  const [open, setOpen] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const [, startTransition] = useTransition()

  async function handleRestore(id: string) {
    setRestoring(id)
    setError(null)
    try {
      const res = await fetch(`/api/agreements/${id}/restore`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Restore failed')
      } else {
        startTransition(() => router.refresh())
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setRestoring(null)
    }
  }

  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-slate-800 hover:bg-slate-700/60 transition-colors text-left"
      >
        <span className="text-sm text-slate-400">
          Deleted agreements <span className="ml-1 text-slate-500">({agreements.length})</span>
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {open && (
        <div className="bg-slate-900">
          {error && (
            <p className="px-5 py-2 text-xs text-red-400 border-b border-slate-700">{error}</p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-xs text-slate-500 uppercase tracking-wide">
                <th className="text-left px-5 py-3">Reference</th>
                <th className="text-left px-4 py-3">Investor</th>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-right px-4 py-3">Principal</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Deleted</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {agreements.map((a) => (
                <tr key={a.id} className="opacity-60 hover:opacity-80 transition-opacity">
                  <td className="px-5 py-3 font-mono text-xs text-slate-400">{a.reference_id}</td>
                  <td className="px-4 py-3 text-slate-300">{a.investor_name}</td>
                  <td className="px-4 py-3 text-slate-400">{fmtDate(a.agreement_date)}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{fmtCurrency(a.principal_amount)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${statusCls[a.status] ?? 'bg-slate-700 text-slate-300'}`}>
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{fmtDate(a.deleted_at)}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleRestore(a.id)}
                      disabled={restoring === a.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs text-slate-300 border border-slate-600 hover:bg-slate-700 transition-colors disabled:opacity-40"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {restoring === a.id ? 'Restoring…' : 'Restore'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
