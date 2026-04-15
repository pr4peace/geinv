'use client'

import type { ExtractedPayoutRow } from '@/lib/claude'

interface PayoutScheduleTableProps {
  rows: ExtractedPayoutRow[]
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}

export default function PayoutScheduleTable({ rows }: PayoutScheduleTableProps) {
  if (!rows || rows.length === 0) {
    return (
      <p className="text-slate-500 text-sm italic">No payout schedule extracted.</p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-700">
      <table className="min-w-full text-sm text-slate-300">
        <thead>
          <tr className="bg-slate-800 border-b border-slate-700">
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 whitespace-nowrap">Period From</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 whitespace-nowrap">Period To</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-400 whitespace-nowrap">Days</th>
            <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400 whitespace-nowrap">Due By</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-400 whitespace-nowrap">Gross Interest</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-400 whitespace-nowrap">TDS</th>
            <th className="px-3 py-2 text-right text-xs font-semibold text-slate-400 whitespace-nowrap">Net Interest</th>
            <th className="px-3 py-2 text-center text-xs font-semibold text-slate-400 whitespace-nowrap">Principal Repayment?</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={idx}
              className={`border-b border-slate-700/50 ${row.is_principal_repayment ? 'bg-emerald-900/20' : idx % 2 === 0 ? 'bg-slate-900' : 'bg-slate-800/40'}`}
            >
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.period_from)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.period_to)}</td>
              <td className="px-3 py-2 text-right">{row.no_of_days ?? '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{formatDate(row.due_by)}</td>
              <td className="px-3 py-2 text-right">{formatCurrency(row.gross_interest)}</td>
              <td className="px-3 py-2 text-right">{formatCurrency(row.tds_amount)}</td>
              <td className="px-3 py-2 text-right font-medium text-emerald-400">{formatCurrency(row.net_interest)}</td>
              <td className="px-3 py-2 text-center">
                {row.is_principal_repayment ? (
                  <span className="inline-block px-2 py-0.5 bg-emerald-600/30 text-emerald-400 rounded text-xs font-semibold">Yes</span>
                ) : (
                  <span className="text-slate-600">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
