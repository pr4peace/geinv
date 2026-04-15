'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, History } from 'lucide-react'

interface AuditEntry {
  id: string
  change_type: string
  changed_by: string
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  created_at: string
}

const changeTypeLabel: Record<string, { label: string; cls: string }> = {
  created: { label: 'Created', cls: 'text-green-400' },
  updated: { label: 'Updated', cls: 'text-slate-300' },
  status_changed: { label: 'Status changed', cls: 'text-amber-400' },
  doc_status_changed: { label: 'Doc status changed', cls: 'text-indigo-400' },
  deleted: { label: 'Deleted', cls: 'text-red-400' },
  restored: { label: 'Restored', cls: 'text-green-400' },
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function ChangeDiff({
  oldValues,
  newValues,
}: {
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
}) {
  const keys = Array.from(
    new Set([...Object.keys(oldValues ?? {}), ...Object.keys(newValues ?? {})])
  )
  if (keys.length === 0) return null
  return (
    <div className="mt-2 space-y-1">
      {keys.map((k) => (
        <div key={k} className="flex gap-2 text-xs">
          <span className="text-slate-500 min-w-[120px] shrink-0">{k}</span>
          {oldValues?.[k] !== undefined && (
            <span className="text-red-400 line-through">{fmtValue(oldValues[k])}</span>
          )}
          {newValues?.[k] !== undefined && (
            <span className="text-green-400">{fmtValue(newValues[k])}</span>
          )}
        </div>
      ))}
    </div>
  )
}

export default function AuditLog({ entries }: { entries: AuditEntry[] }) {
  const [open, setOpen] = useState(false)

  if (entries.length === 0) return null

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-700/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-slate-300 uppercase tracking-wide">
            Change History
          </span>
          <span className="text-xs text-slate-500">({entries.length})</span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-500" />
        )}
      </button>

      {open && (
        <div className="border-t border-slate-700 divide-y divide-slate-700/50">
          {entries.map((entry) => {
            const style = changeTypeLabel[entry.change_type] ?? {
              label: entry.change_type,
              cls: 'text-slate-300',
            }
            return (
              <div key={entry.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium ${style.cls}`}>{style.label}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(entry.created_at).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <ChangeDiff oldValues={entry.old_values} newValues={entry.new_values} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
