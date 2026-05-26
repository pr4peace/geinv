'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import type { Agreement, AgreementStatus, PayoutFrequency, DocStatus } from '@/types/database'

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

function DocStatusBadge({ status }: { status: DocStatus }) {
  const map: Record<DocStatus, { label: string; dot: string }> = {
    draft: { label: 'Draft', dot: 'sdot-pending' },
    partner_signed: { label: 'Partner Signed', dot: 'sdot-notified' },
    sent_to_client: { label: 'Sent to Client', dot: 'sdot-pending' },
    returned: { label: 'Returned', dot: 'sdot-active' },
    uploaded: { label: 'Uploaded', dot: 'sdot-paid' },
  }
  const { label, dot } = map[status] ?? { label: status, dot: 'sdot-pending' }
  return (
    <div className="flex items-center gap-1.5">
      <span className={`sdot ${dot}`} />
      <span className="text-ink-2">{label}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: AgreementStatus }) {
  const dot = status === 'active' ? 'sdot-active' : status === 'cancelled' ? 'sdot-overdue' : 'sdot-pending'
  return (
    <div className="flex items-center gap-1.5">
      <span className={`sdot ${dot}`} />
      <span className="text-ink-2 capitalize">{status}</span>
    </div>
  )
}

type SortKey = 'investor_name' | 'principal_amount' | 'roi_percentage' | 'payout_frequency' | 'investment_start_date' | 'maturity_date'

interface Props {
  agreements: Agreement[]
  initialStatus?: AgreementStatus | 'all'
  readOnly?: boolean
}

export default function AgreementsTable({ agreements, initialStatus = 'all', readOnly = false }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [sortKey, setSortKey] = useState<SortKey>('investment_start_date')
  const [sortAsc, setSortAsc] = useState(false)
  const [filterFrequency, setFilterFrequency] = useState<PayoutFrequency | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<AgreementStatus | 'all'>(initialStatus)
  const [filterDocStatus, setFilterDocStatus] = useState<DocStatus | 'all'>('all')

  // Multi-select state
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(true) }
  }

  const filtered = useMemo(() => {
    return agreements.filter((a) => {
      if (filterFrequency !== 'all' && a.payout_frequency !== filterFrequency) return false
      if (filterStatus !== 'all' && a.status !== filterStatus) return false
      if (filterDocStatus !== 'all' && a.doc_status !== filterDocStatus) return false
      return true
    })
  }, [agreements, filterFrequency, filterStatus, filterDocStatus])

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let av: string | number = a[sortKey] as string | number
      let bv: string | number = b[sortKey] as string | number
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av)
      }
      av = Number(av); bv = Number(bv)
      return sortAsc ? av - bv : bv - av
    })
  }, [filtered, sortKey, sortAsc])

  const totalPrincipal = filtered.reduce((s, a) => s + a.principal_amount, 0)

  // ── Selection helpers ─────────────────────────────────────────────────────

  const allVisibleSelected = sorted.length > 0 && sorted.every((a) => selected.has(a.id))
  const someSelected = selected.size > 0

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
    setConfirmingDelete(false)
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(sorted.map((a) => a.id)) : new Set())
    setConfirmingDelete(false)
  }

  // ── Bulk delete ───────────────────────────────────────────────────────────

  async function handleBulkDelete() {
    setDeleting(true)
    setDeleteError(null)
    const ids = Array.from(selected)
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`/api/agreements/${id}`, { method: 'DELETE' })
          .then(async (res) => ({ id, ok: res.ok, msg: res.ok ? null : (await res.json().catch(() => ({}))).error }))
          .catch(() => ({ id, ok: false, msg: 'Network error' }))
      )
    )
    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      setDeleteError(`${failed.length} deletion(s) failed: ${failed[0].msg ?? 'Unknown error'}`)
    }
    setSelected(new Set())
    setConfirmingDelete(false)
    setDeleting(false)
    startTransition(() => router.refresh())
  }

  // ── Sort icon ─────────────────────────────────────────────────────────────

  function SortIcon({ k }: { k: SortKey }) {
    if (sortKey !== k) return <span className="text-ink-5 ml-1">↕</span>
    return <span className="text-forest ml-1">{sortAsc ? '↑' : '↓'}</span>
  }

  function Th({ label, k, className = '' }: { label: string; k: SortKey; className?: string }) {
    return (
      <th
        className={`text-left text-ink-4 uppercase tracking-widest text-[10px] font-medium bg-surface-2 border-b border-hairline-strong px-3 py-2 cursor-pointer select-none hover:text-ink-2 transition-colors whitespace-nowrap ${className}`}
        onClick={() => handleSort(k)}
      >
        {label}<SortIcon k={k} />
      </th>
    )
  }

  return (
    <div className="space-y-4">
      {/* Quick-filter tabs + filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-3 py-1.5 rounded-sm text-[11px] font-semibold uppercase tracking-wider transition-all ${filterStatus === 'all' ? 'bg-ink-1 text-paper shadow-sm' : 'text-ink-4 hover:bg-surface-3'}`}
        >
          All
        </button>
        <button
          onClick={() => setFilterStatus('active')}
          className={`px-3 py-1.5 rounded-sm text-[11px] font-semibold uppercase tracking-wider transition-all ${filterStatus === 'active' ? 'bg-gain text-paper shadow-sm' : 'text-ink-4 hover:bg-surface-3'}`}
        >
          Active
        </button>
        <button
          onClick={() => setFilterStatus('matured')}
          className={`px-3 py-1.5 rounded-sm text-[11px] font-semibold uppercase tracking-wider transition-all ${filterStatus === 'matured' ? 'bg-ink-3 text-paper shadow-sm' : 'text-ink-4 hover:bg-surface-3'}`}
        >
          Matured
        </button>
        <button
          onClick={() => setFilterStatus('cancelled')}
          className={`px-3 py-1.5 rounded-sm text-[11px] font-semibold uppercase tracking-wider transition-all ${filterStatus === 'cancelled' ? 'bg-rust text-paper shadow-sm' : 'text-ink-4 hover:bg-surface-3'}`}
        >
          Cancelled
        </button>

        <div className="flex-1" />

        {/* Secondary filters */}
        <select
          value={filterFrequency}
          onChange={(e) => setFilterFrequency(e.target.value as PayoutFrequency | 'all')}
          className="h-7 border border-hairline-strong bg-surface px-2 text-[11px] font-medium text-ink-2 rounded-sm focus:border-forest focus:ring-2 focus:ring-forest/12 outline-none"
        >
          <option value="all">All Frequencies</option>
          <option value="monthly">Monthly</option>
          <option value="quarterly">Quarterly</option>
          <option value="biannual">Bi-Annual</option>
          <option value="annual">Annual</option>
          <option value="cumulative">Cumulative</option>
        </select>
        <select
          value={filterDocStatus}
          onChange={(e) => setFilterDocStatus(e.target.value as DocStatus | 'all')}
          className="h-7 border border-hairline-strong bg-surface px-2 text-[11px] font-medium text-ink-2 rounded-sm focus:border-forest focus:ring-2 focus:ring-forest/12 outline-none"
        >
          <option value="all">All Doc Statuses</option>
          <option value="draft">Draft</option>
          <option value="partner_signed">Partner Signed</option>
          <option value="sent_to_client">Sent to Client</option>
          <option value="returned">Returned</option>
          <option value="uploaded">Uploaded</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {!readOnly && deleteError && (
        <div className="px-4 py-2 bg-rust-soft border border-rust/20 rounded-sm text-xs text-rust">
          {deleteError}
        </div>
      )}
      {!readOnly && someSelected && (
        <div className="flex items-center gap-3 px-4 py-2 bg-surface-2 border border-hairline rounded-sm shadow-sm">
          <span className="text-[11px] uppercase tracking-wider font-bold text-ink-3">{selected.size} selected</span>
          <div className="flex-1" />
          {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-surface border border-rust/40 text-rust text-[10px] font-bold uppercase rounded-sm hover:bg-rust-soft transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Delete Selection
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium text-rust italic mr-2">
                Soft-delete {selected.size} records?
              </span>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="px-3 py-1 text-[10px] font-bold uppercase text-ink-4 hover:text-ink-2 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="px-3 py-1 bg-rust text-paper text-[10px] font-bold uppercase rounded-sm hover:bg-rust-2 transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, Delete All'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-surface border border-hairline rounded-sm overflow-hidden shadow-sm">
        <table className="border-collapse w-full text-xs">
          <thead>
            <tr>
              {!readOnly && (
                <th className="bg-surface-2 border-b border-hairline-strong px-3 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="rounded border-hairline-strong text-forest focus:ring-forest/20"
                    title="Select all visible"
                  />
                </th>
              )}
              <Th label="Investor" k="investor_name" />
              <Th label="Principal" k="principal_amount" />
              <Th label="Rate %" k="roi_percentage" />
              <Th label="Frequency" k="payout_frequency" />
              <th className="text-left text-ink-4 uppercase tracking-widest text-[10px] font-medium bg-surface-2 border-b border-hairline-strong px-3 py-2">Salesperson</th>
              <Th label="Start" k="investment_start_date" />
              <Th label="Maturity" k="maturity_date" />
              <th className="text-left text-ink-4 uppercase tracking-widest text-[10px] font-medium bg-surface-2 border-b border-hairline-strong px-3 py-2">Doc Status</th>
              <th className="text-left text-ink-4 uppercase tracking-widest text-[10px] font-medium bg-surface-2 border-b border-hairline-strong px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {sorted.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 9 : 10} className="py-12 text-center text-ink-5 italic bg-canvas/30 text-[13px]">
                  No agreements match the selected filters.
                </td>
              </tr>
            )}
            {sorted.map((a) => (
              <tr
                key={a.id}
                className={`hover:bg-surface-2 transition-colors group ${a.is_draft ? 'bg-clay-soft/10' : ''} ${selected.has(a.id) ? 'bg-forest-soft/30' : ''}`}
              >
                {!readOnly && (
                  <td className="px-3 py-2 border-b border-hairline w-8">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggleOne(a.id)}
                      className="rounded border-hairline-strong text-forest focus:ring-forest/20"
                    />
                  </td>
                )}
                <td className="px-3 py-2 border-b border-hairline">
                  <div className="flex items-center gap-2">
                    <Link href={`/agreements/${a.id}`} className="font-semibold text-ink-1 hover:text-forest transition-colors">
                      {a.investor_name}{a.investor2_name ? ` & ${a.investor2_name}` : ''}
                    </Link>
                    {a.is_draft && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-clay bg-clay-soft px-1 rounded-sm">Draft</span>
                    )}
                    {a.rescan_required && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-rust bg-rust-soft px-1 rounded-sm border border-rust/10">Rescan</span>
                    )}
                  </div>
                  <div className="text-ink-4 font-mono text-[10px] mt-0.5">{a.reference_id}</div>
                </td>
                <td className="px-3 py-2 border-b border-hairline font-bold num text-ink-1">{fmt(a.principal_amount)}</td>
                <td className="px-3 py-2 border-b border-hairline num text-ink-2">{a.roi_percentage}%</td>
                <td className="px-3 py-2 border-b border-hairline text-ink-3 capitalize">{a.payout_frequency}</td>
                <td className="px-3 py-2 border-b border-hairline text-ink-3 truncate max-w-[120px]">{a.salesperson?.name ?? a.salesperson_custom ?? '—'}</td>
                <td className="px-3 py-2 border-b border-hairline num text-ink-4">{format(parseISO(a.investment_start_date), 'dd MMM yy')}</td>
                <td className="px-3 py-2 border-b border-hairline num text-ink-4">{format(parseISO(a.maturity_date), 'dd MMM yy')}</td>
                <td className="px-3 py-2 border-b border-hairline"><DocStatusBadge status={a.doc_status} /></td>
                <td className="px-3 py-2 border-b border-hairline"><StatusBadge status={a.status} /></td>
              </tr>
            ))}
          </tbody>
          {/* Footer totals */}
          <tfoot className="bg-surface-2">
            <tr>
              {!readOnly && <td className="px-3 py-2" />}
              <td className="px-3 py-2 text-[10px] uppercase tracking-widest font-bold text-ink-4">{filtered.length} agreement{filtered.length !== 1 ? 's' : ''}</td>
              <td className="px-3 py-2 font-bold num text-ink-1 text-[13px]">{fmt(totalPrincipal)}</td>
              <td colSpan={readOnly ? 7 : 7} className="px-3 py-2" />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
