'use client'

import type { ReconciliationResult, ReconciliationEntry } from '@/types/database'

interface SectionProps {
  title: string
  entries: ReconciliationEntry[]
  colorClass: string
  columns: { key: keyof ReconciliationEntry; label: string }[]
}

function Section({ title, entries, colorClass, columns }: SectionProps) {
  if (entries.length === 0) return null
  return (
    <div className="mb-4">
      <h4 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${colorClass}`}>
        {title} ({entries.length})
      </h4>
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-800/60">
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2 text-left text-xs font-medium text-slate-400">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={i} className="border-b border-slate-800 last:border-0 hover:bg-slate-800/40">
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-slate-300">
                    {col.key === 'system_amount' || col.key === 'external_amount'
                      ? entry[col.key] != null
                        ? `₹${Number(entry[col.key]).toLocaleString('en-IN')}`
                        : '—'
                      : (entry[col.key] as string | undefined) ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

interface ReconciliationResultsProps {
  type: 'incoming_funds' | 'tds'
  result: ReconciliationResult
}

export default function ReconciliationResults({ type, result }: ReconciliationResultsProps) {
  const isIncoming = type === 'incoming_funds'

  const commonCols = isIncoming
    ? [
        { key: 'investor_name' as const, label: 'Agreement Name' },
        { key: 'system_amount' as const, label: 'Expected Amount' },
        { key: 'external_amount' as const, label: 'Received Amount' },
        { key: 'due_by' as const, label: 'Date' },
      ]
    : [
        { key: 'investor_name' as const, label: 'Investor Name' },
        { key: 'pan' as const, label: 'PAN' },
        { key: 'system_amount' as const, label: 'Expected TDS' },
        { key: 'external_amount' as const, label: 'Filed TDS' },
      ]

  const missingLabel = isIncoming ? 'Missing from Bank' : 'Missing from Tally'
  const extraLabel = isIncoming ? 'Extra in Bank' : 'Extra in Tally'

  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-100 mb-3">
        {isIncoming ? 'Incoming Funds Reconciliation' : 'TDS Reconciliation'}
      </h3>

      <Section
        title="Matched"
        entries={result.matched}
        colorClass="text-emerald-400"
        columns={commonCols}
      />
      <Section
        title={missingLabel}
        entries={result.missing}
        colorClass="text-red-400"
        columns={commonCols}
      />
      <Section
        title={extraLabel}
        entries={result.extra}
        colorClass="text-amber-400"
        columns={commonCols}
      />
      <Section
        title="Amount Mismatch"
        entries={result.mismatched}
        colorClass="text-amber-400"
        columns={[...commonCols, { key: 'notes' as const, label: 'Notes' }]}
      />

      {result.matched.length === 0 &&
        result.missing.length === 0 &&
        result.extra.length === 0 &&
        result.mismatched.length === 0 && (
          <p className="text-sm text-slate-500">No entries found in reconciliation result.</p>
        )}
    </div>
  )
}
