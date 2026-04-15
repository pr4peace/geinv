'use client'

import { useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'

interface Note {
  id: string
  note: string
  created_at: string
}

export default function InvestorNotes({
  investorId,
  initialNotes,
}: {
  investorId: string
  initialNotes: Note[]
}) {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!text.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/investors/${investorId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to save note')
      } else {
        setNotes((prev) => [data, ...prev])
        setText('')
      }
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-slate-400" />
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Notes</h2>
      </div>

      {/* Add note */}
      <div className="flex gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a note about this investor..."
          rows={2}
          className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAdd()
          }}
        />
        <button
          onClick={handleAdd}
          disabled={saving || !text.trim()}
          className="self-end px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors"
          title="Add note (⌘Enter)"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Notes list */}
      {notes.length === 0 ? (
        <p className="text-sm text-slate-500 py-2">No notes yet.</p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="bg-slate-900 rounded-lg px-4 py-3">
              <p className="text-sm text-slate-200 whitespace-pre-wrap">{n.note}</p>
              <p className="mt-1.5 text-xs text-slate-500">
                {new Date(n.created_at).toLocaleString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
