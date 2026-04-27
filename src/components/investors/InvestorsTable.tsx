'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'

type InvestorRow = {
  id: string
  name: string
  pan: string | null
  aadhaar: string | null
  address: string | null
  birth_year: number | null
  payout_bank_name: string | null
  payout_bank_account: string | null
  payout_bank_ifsc: string | null
  created_at: string
  total_agreements: number
  active_agreements: number
  total_principal: number
}

type SortKey = 'name' | 'pan' | 'total_principal' | 'total_agreements'

function SortHeader({
  label, sortKey, current, dir, onSort,
}: {
  label: string; sortKey: SortKey; current: SortKey; dir: 'asc' | 'desc'
  onSort: (k: SortKey) => void
}) {
  const active = current === sortKey
  return (
    <th
      onClick={() => onSort(sortKey)}
      className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:text-white transition-colors group"
    >
      <div className="flex items-center gap-1">
        {label}
        <span className={`${active ? 'text-indigo-400' : 'text-slate-600 group-hover:text-slate-400'} transition-colors`}>
          {active ? (dir === 'asc' ? '▲' : '▼') : '⇅'}
        </span>
      </div>
    </th>
  )
}

export function InvestorsTable({ investors }: { investors: InvestorRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const sorted = useMemo(() => {
    return [...investors].sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      
      if (typeof av === 'string' && typeof bv === 'string') {
        const cmp = av.localeCompare(bv)
        return sortDir === 'asc' ? cmp : -cmp
      }
      
      const numA = Number(av)
      const numB = Number(bv)
      return sortDir === 'asc' ? numA - numB : numB - numA
    })
  }, [investors, sortKey, sortDir])

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full text-sm text-left">
        <thead className="bg-slate-900/60">
          <tr>
            <SortHeader label="Investor" sortKey="name" current={sortKey} dir={sortDir} onSort={handleSort} />
            <SortHeader label="PAN" sortKey="pan" current={sortKey} dir={sortDir} onSort={handleSort} />
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Aadhaar</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">Address</th>
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider hidden xl:table-cell">Payout Bank</th>
            <SortHeader label="Agreements" sortKey="total_agreements" current={sortKey} dir={sortDir} onSort={handleSort} />
            <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Active</th>
            <SortHeader label="Total Principal" sortKey="total_principal" current={sortKey} dir={sortDir} onSort={handleSort} />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/50">
          {sorted.map(investor => (
            <tr key={investor.id} className="hover:bg-slate-800/30 transition-colors">
              <td className="px-4 py-3">
                <Link href={`/investors/${investor.id}`} className="font-medium text-white hover:text-indigo-400 transition-colors">
                  {investor.name}
                </Link>
              </td>
              <td className="px-4 py-3 text-slate-400 font-mono text-xs">{investor.pan ?? '—'}</td>
              <td className="px-4 py-3 text-slate-400 font-mono text-xs">{investor.aadhaar ?? '—'}</td>
              <td className="px-4 py-3 text-slate-400 hidden lg:table-cell text-xs max-w-xs truncate">{investor.address ?? '—'}</td>
              <td className="px-4 py-3 text-slate-400 hidden xl:table-cell text-xs">{investor.payout_bank_name ?? '—'}</td>
              <td className="px-4 py-3 text-slate-300">{investor.total_agreements}</td>
              <td className="px-4 py-3 text-slate-300">{investor.active_agreements}</td>
              <td className="px-4 py-3 text-white font-medium">
                ₹{investor.total_principal.toLocaleString('en-IN')}
              </td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-12 text-center text-slate-500 italic">
                No investors found matching the criteria.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
