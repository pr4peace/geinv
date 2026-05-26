'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

interface Props {
  userRole: string
}

export default function QuickActions({ userRole }: Props) {
  const router = useRouter()
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const isCoordinator = userRole !== 'salesperson'

  async function runAllJobs() {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/jobs/run-all', { method: 'POST' })
      if (!res.ok) {
        setResult('Failed to run jobs')
        return
      }
      const data = await res.json()
      const parts: string[] = []
      if (data.notifications?.queueAdded) parts.push(`${data.notifications.queueAdded} notifications queued`)
      if (data.notifications?.overdueMarked) parts.push(`${data.notifications.overdueMarked} marked overdue`)
      if (data.matured?.matured) parts.push(`${data.matured.matured} agreements matured`)
      if (data.tds?.backfilled) parts.push(`${data.tds.backfilled} TDS rows backfilled`)
      setResult(parts.length > 0 ? parts.join(' · ') : 'All jobs completed — nothing new to process')
      router.refresh()
    } catch {
      setResult('Failed to run jobs')
    } finally {
      setRunning(false)
    }
  }

  if (!isCoordinator) return null

  return (
    <div className="bg-surface border border-hairline rounded-sm p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <button
          onClick={runAllJobs}
          disabled={running}
          className="inline-flex items-center gap-2 h-8 px-4 rounded-sm bg-forest text-paper hover:bg-ink-1 disabled:opacity-50 text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Running Jobs…' : 'Refresh All Jobs'}
        </button>
      </div>

      {result && (
        <div className="mt-4 px-4 py-3 bg-canvas border border-hairline rounded-sm">
          <p className="text-[11px] font-medium text-ink-3 italic">{result}</p>
        </div>
      )}
    </div>
  )
}
