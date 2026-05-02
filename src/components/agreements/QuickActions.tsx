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
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center gap-3">
        <button
          onClick={runAllJobs}
          disabled={running}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:text-indigo-500 text-white text-xs font-bold uppercase tracking-wide transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Running Jobs…' : 'Refresh All Jobs'}
        </button>
      </div>

      {result && (
        <p className="mt-3 text-xs text-slate-400 bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-700/30">{result}</p>
      )}
    </div>
  )
}
