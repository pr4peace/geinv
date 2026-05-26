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

const changeTypeLabel: Record<string, { label: string; cls: string; dot: string }> = {
  created: { label: 'Created', cls: 'text-gain', dot: 'sdot-paid' },
  updated: { label: 'Updated', cls: 'text-ink-2', dot: 'sdot-pending' },
  status_changed: { label: 'Status changed', cls: 'text-ink-2', dot: 'sdot-pending' },
  doc_status_changed: { label: 'Doc status changed', cls: 'text-ink-2', dot: 'sdot-notified' },
  deleted: { label: 'Deleted', cls: 'text-rust', dot: 'sdot-overdue' },
  restored: { label: 'Restored', cls: 'text-gain', dot: 'sdot-active' },
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
    <div className="mt-3 space-y-2 pl-5">
      {keys.map((k) => (
        <div key={k} className="flex gap-4 text-[11px]">
          <span className="text-ink-5 font-bold uppercase tracking-wider w-32 shrink-0">{k.replace(/_/g, ' ')}</span>
          <div className="flex flex-wrap gap-2 items-center">
            {oldValues?.[k] !== undefined && (
              <span className="text-rust/60 line-through font-medium">{fmtValue(oldValues[k])}</span>
            )}
            {oldValues?.[k] !== undefined && newValues?.[k] !== undefined && <ArrowRight className="w-3 h-3 text-ink-5" />}
            {newValues?.[k] !== undefined && (
              <span className="text-gain font-bold">{fmtValue(newValues[k])}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AuditLog({ entries }: { entries: AuditEntry[] }) {
  const [open, setOpen] = useState(false)

  if (entries.length === 0) return null

  return (
    <div className="bg-surface border border-hairline rounded-sm overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-5 hover:bg-surface-2 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <History className="w-4 h-4 text-ink-4" />
          <span className="lbl font-bold text-ink-1 tracking-widest">
            Agreement History
          </span>
          <span className="text-[10px] font-bold text-ink-5 opacity-60 ml-1">({entries.length})</span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-ink-5" />
        ) : (
          <ChevronDown className="w-4 h-4 text-ink-5" />
        )}
      </button>

      {open && (
        <div className="border-t border-hairline divide-y divide-hairline">
          {entries.map((entry) => {
            const style = changeTypeLabel[entry.change_type] ?? {
              label: entry.change_type,
              cls: 'text-ink-2',
              dot: 'sdot-pending'
            }
            return (
              <div key={entry.id} className="px-6 py-4 bg-canvas/10">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`sdot ${style.dot} m-0`} />
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${style.cls}`}>{style.label}</span>
                    <span className="text-[10px] text-ink-5 italic font-medium ml-2">— by {entry.changed_by.split('@')[0]}</span>
                  </div>
                  <span className="num text-[10px] font-bold text-ink-4 uppercase">
                    {new Date(entry.created_at).toLocaleString('en-IN', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false
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

import { ArrowRight } from 'lucide-react'
