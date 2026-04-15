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
  const map: Record<DocStatus, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'text-slate-400 bg-slate-700' },
    partner_signed: { label: 'Partner Signed', color: 'text-blue-400 bg-blue-900/30' },
    sent_to_client: { label: 'Sent to Client', color: 'text-amber-400 bg-amber-900/30' },
    returned: { label: 'Returned', color: 'text-green-400 bg-green-900/30' },
    uploaded: { label: 'Uploaded', color: 'text-emerald-400 bg-emerald-900/30' },
  }
  const { label, color } = map[status] ?? { label: status, color: 'text-slate-400 bg-slate-700' }
  return <span className={`text-xs px-2 py-0.5 rounded font-medium ${color}`}>{label}</span>
}

function StatusBadge({ status }: { status: AgreementStatus }) {
  const map: Record<AgreementStatus, string> = {
    active: 'text-green-400 bg-green-900/30',
    matured: 'text-slate-400 bg-slate-700',
    cancelled: 'text-red-400 bg-red-900/30',
    combined: 'text-purple-400 bg-purple-900/30',
  }
  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${map[status]}`}>{status}</span>
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
    if (sortKey !== k) return <span className="text-slate-600 ml-1">↕</span>
    return <span className="text-indigo-400 ml-1">{sortAsc ? '↑' : '↓'}</span>
  }

  function Th({ label, k }: { label: string; k: SortKey }) {
    return (
      <th
        className="text-left text-slate-400 font-medium pb-2 pr-4 cursor-pointer select-none hover:text-slate-200 transition-colors text-xs whitespace-nowrap"
        onClick={() => handleSort(k)}
      >
        {label}<SortIcon k={k} />
      </th>
    )
  }

  return (
    <div>
      {/* Quick-filter tabs + filter bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === 'all' ? 'bg-slate-600 text-slate-100' : 'text-slate-400 hover:bg-slate-800'}`}
        >
          All
        </button>
        <button
          onClick={() => setFilterStatus('active')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === 'active' ? 'bg-green-900/60 text-green-300' : 'text-slate-400 hover:bg-slate-800'}`}
        >
          Active agreements
        </button>
        <button
          onClick={() => setFilterStatus('matured')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === 'matured' ? 'bg-slate-700 text-slate-200' : 'text-slate-400 hover:bg-slate-800'}`}
        >
          Matured
        </button>
        <button
          onClick={() => setFilterStatus('cancelled')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === 'cancelled' ? 'bg-red-900/50 text-red-300' : 'text-slate-400 hover:bg-slate-800'}`}
        >
          Cancelled
        </button>
        <button
          onClick={() => setFilterStatus('combined')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterStatus === 'combined' ? 'bg-purple-900/50 text-purple-300' : 'text-slate-400 hover:bg-slate-800'}`}
        >
          Combined
        </button>

        <div className="flex-1" />

        {/* Secondary filters */}
        <select
          value={filterFrequency}
          onChange={(e) => setFilterFrequency(e.target.value as PayoutFrequency | 'all')}
          className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
          className="bg-slate-800 border border-slate-700 text-slate-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        >
          <option value="all">All Doc Statuses</option>
          <option value="draft">Draft</option>
          <option value="partner_signed">Partner Signed</option>
          <option value="sent_to_client">Sent to Client</option>
          <option value="returned">Returned</option>
          <option value="uploaded">Uploaded</option>
        </select>
      </div>

      {/* Bulk action bar — shown when rows are selected (not in readOnly mode) */}
      {!readOnly && deleteError && (
        <div className="mb-3 px-4 py-2 bg-red-900/20 border border-red-800 rounded-lg text-xs text-red-400">
          {deleteError}
        </div>
      )}
      {!readOnly && someSelected && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg">
          <span className="text-sm text-slate-300 font-medium">{selected.size} selected</span>
          <div className="flex-1" />
          {!confirmingDelete ? (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400 border border-red-800 hover:bg-red-900/30 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete {selected.size} agreement{selected.size !== 1 ? 's' : ''}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-400">
                Soft-delete {selected.size} records? They can be restored from the Deleted section.
              </span>
              <button
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 border border-slate-700 hover:bg-slate-700 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-700 hover:bg-red-600 text-white transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Yes, delete all'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-slate-700">
            <tr>
              {!readOnly && (
                <th className="pb-2 pl-3 pr-2 w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-700 text-indigo-500"
                    title="Select all visible"
                  />
                </th>
              )}
              <Th label="Investor" k="investor_name" />
              <Th label="Principal" k="principal_amount" />
              <Th label="Rate %" k="roi_percentage" />
              <Th label="Frequency" k="payout_frequency" />
              <th className="text-left text-slate-400 font-medium pb-2 pr-4 text-xs">Salesperson</th>
              <Th label="Start Date" k="investment_start_date" />
              <Th label="Maturity Date" k="maturity_date" />
              <th className="text-left text-slate-400 font-medium pb-2 pr-4 text-xs">Doc Status</th>
              <th className="text-left text-slate-400 font-medium pb-2 text-xs">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={readOnly ? 9 : 10} className="py-8 text-center text-slate-500">No agreements match the selected filters.</td>
              </tr>
            )}
            {sorted.map((a) => (
              <tr
                key={a.id}
                className={`border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors ${a.is_draft ? 'border-l-2 border-l-amber-500' : ''} ${selected.has(a.id) ? 'bg-indigo-900/10' : ''}`}
              >
                {!readOnly && (
                  <td className="py-2.5 pl-3 pr-2 w-8">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggleOne(a.id)}
                      className="rounded border-slate-600 bg-slate-700 text-indigo-500"
                    />
                  </td>
                )}
                <td className="py-2.5 pr-4">
                  <div className="flex items-center gap-2">
                    <Link href={`/agreements/${a.id}`} className="font-medium text-slate-100 hover:text-indigo-400 transition-colors">
                      {a.investor_name}
                    </Link>
                    {a.is_draft && (
                      <span className="text-xs text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded font-medium">Draft</span>
                    )}
                  </div>
                  <div className="text-slate-500 text-xs">{a.reference_id}</div>
                </td>
                <td className="py-2.5 pr-4 font-medium text-slate-100">{fmt(a.principal_amount)}</td>
                <td className="py-2.5 pr-4 text-slate-300">{a.roi_percentage}%</td>
                <td className="py-2.5 pr-4 text-slate-300 capitalize">{a.payout_frequency}</td>
                <td className="py-2.5 pr-4 text-slate-400">{a.salesperson?.name ?? a.salesperson_custom ?? '—'}</td>
                <td className="py-2.5 pr-4 text-slate-400">{format(parseISO(a.investment_start_date), 'dd MMM yyyy')}</td>
                <td className="py-2.5 pr-4 text-slate-400">{format(parseISO(a.maturity_date), 'dd MMM yyyy')}</td>
                <td className="py-2.5 pr-4"><DocStatusBadge status={a.doc_status} /></td>
                <td className="py-2.5"><StatusBadge status={a.status} /></td>
              </tr>
            ))}
          </tbody>
          {/* Footer totals */}
          <tfoot className="border-t border-slate-700 bg-slate-900/50">
            <tr>
              {!readOnly && <td className="py-2 pl-3" />}
              <td className="py-2 pr-4 text-slate-400 font-medium">{filtered.length} agreement{filtered.length !== 1 ? 's' : ''}</td>
              <td className="py-2 pr-4 font-semibold text-slate-100">{fmt(totalPrincipal)}</td>
              <td colSpan={readOnly ? 7 : 7} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
