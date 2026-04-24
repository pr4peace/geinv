'use client'

import { useState } from 'react'

export default function SendReminderSummaryButton() {
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  async function handleSend() {
    setLoading(true)
    setToast(null)
    try {
      const res = await fetch('/api/reminders/summary', { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (res.ok) {
        setToast({ type: 'success', message: 'Reminder summary sent to accounts team.' })
      } else {
        setToast({ type: 'error', message: j.error ?? 'Failed to send.' })
      }
    } catch {
      setToast({ type: 'error', message: 'Network error.' })
    } finally {
      setLoading(false)
      setTimeout(() => setToast(null), 4000)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleSend}
        disabled={loading}
        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white transition-colors disabled:opacity-50"
      >
        {loading ? 'Sending…' : 'Send Summary to Accounts'}
      </button>
      {toast && (
        <p className={`text-xs ${toast.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
          {toast.message}
        </p>
      )}
    </div>
  )
}
