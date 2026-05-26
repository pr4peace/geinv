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
    <div className="border border-rust/10 rounded-sm overflow-hidden bg-surface shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 bg-rust-soft/20 hover:bg-rust-soft/30 transition-colors text-left"
      >
        <span className="text-[11px] font-bold uppercase tracking-widest text-rust">
          Deleted agreements <span className="ml-2 opacity-60">({agreements.length})</span>
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-rust" />
        ) : (
          <ChevronDown className="w-4 h-4 text-rust" />
        )}
      </button>

      {open && (
        <div className="bg-surface">
          {error && (
            <div className="px-5 py-3 bg-rust-soft border-b border-rust/10">
              <p className="text-[10px] font-bold uppercase text-rust italic">{error}</p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="border-collapse w-full text-xs opacity-80">
              <thead>
                <tr className="bg-surface-2 border-b border-hairline-strong text-[10px] uppercase tracking-widest font-medium text-ink-4">
                  <th className="text-left px-5 py-3 font-bold">Reference</th>
                  <th className="text-left px-4 py-3 font-bold">Investor</th>
                  <th className="text-left px-4 py-3 font-bold">Date</th>
                  <th className="text-right px-4 py-3 font-bold">Principal</th>
                  <th className="text-left px-4 py-3 font-bold">Status</th>
                  <th className="text-left px-4 py-3 font-bold">Deleted</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {agreements.map((a) => (
                  <tr key={a.id} className="hover:bg-rust-soft/5 transition-colors group">
                    <td className="px-5 py-3 num text-[10px] text-ink-4">{a.reference_id}</td>
                    <td className="px-4 py-3 text-ink-2 font-semibold">{a.investor_name}</td>
                    <td className="px-4 py-3 num text-ink-4">{fmtDate(a.agreement_date)}</td>
                    <td className="px-4 py-3 text-right num font-bold text-ink-2">{fmtCurrency(a.principal_amount)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 opacity-60">
                        <span className={`sdot ${a.status === 'active' ? 'sdot-active' : a.status === 'cancelled' ? 'sdot-overdue' : 'sdot-pending'} m-0`} />
                        <span className="text-[10px] uppercase font-bold text-ink-4 tracking-tighter">{a.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[10px] font-medium text-ink-5 italic">{fmtDate(a.deleted_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleRestore(a.id)}
                        disabled={restoring === a.id}
                        className="inline-flex items-center gap-1.5 h-7 px-3 border border-hairline-strong text-ink-1 bg-surface text-[10px] font-bold uppercase rounded-sm hover:bg-gain-soft hover:text-gain hover:border-gain/30 transition-all shadow-sm disabled:opacity-40"
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
        </div>
      )}
    </div>
  )
}
