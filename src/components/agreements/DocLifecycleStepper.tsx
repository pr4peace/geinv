'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Circle } from 'lucide-react'
import type { DocStatus } from '@/types/database'
import UploadSignedButton from './UploadSignedButton'

interface DocLifecycleStepperProps {
  agreementId: string
  docStatus: DocStatus
  docSentToClientDate: string | null
  docReturnedDate: string | null
}

const STAGES: { key: DocStatus; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'partner_signed', label: 'Partner Signed' },
  { key: 'sent_to_client', label: 'Sent to Client' },
  { key: 'returned', label: 'Returned' },
  { key: 'uploaded', label: 'Uploaded' },
]

const STATUS_ORDER: DocStatus[] = [
  'draft',
  'partner_signed',
  'sent_to_client',
  'returned',
  'uploaded',
]

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
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

export default function DocLifecycleStepper({
  agreementId,
  docStatus,
  docSentToClientDate,
  docReturnedDate,
}: DocLifecycleStepperProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentDate, setSentDate] = useState(docSentToClientDate ?? '')
  const [returnedDate, setReturnedDate] = useState(docReturnedDate ?? '')

  const currentIdx = STATUS_ORDER.indexOf(docStatus)

  async function advance(
    nextStatus: DocStatus,
    extra?: Record<string, string>
  ) {
    setLoading(true)
    setError(null)
    try {
      const body: Record<string, unknown> = { doc_status: nextStatus, ...extra }
      const res = await fetch(`/api/agreements/${agreementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Update failed')
      }
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-start gap-0">
        {STAGES.map((stage, idx) => {
          const isLastStep = idx === STAGES.length - 1
          const isCompleted = idx < currentIdx || (isLastStep && idx === currentIdx)
          const isCurrent = idx === currentIdx

          return (
            <div key={stage.key} className="flex items-start flex-1">
              <div className="flex flex-col items-center flex-1">
                {/* Circle */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                    isCompleted
                      ? 'bg-green-500 border-green-500 text-white'
                      : isCurrent
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-slate-800 border-slate-600 text-slate-500'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Circle
                      className={`w-3 h-3 ${isCurrent ? 'text-white' : 'text-slate-600'}`}
                      fill="currentColor"
                    />
                  )}
                </div>

                {/* Label */}
                <p
                  className={`mt-1.5 text-xs text-center leading-tight max-w-[80px] ${
                    isCurrent
                      ? 'text-indigo-400 font-semibold'
                      : isCompleted
                      ? 'text-green-400 font-medium'
                      : 'text-slate-500'
                  }`}
                >
                  {stage.label}
                </p>

                {/* Date beneath stage */}
                {stage.key === 'sent_to_client' && docSentToClientDate && (
                  <p className="mt-0.5 text-[10px] text-slate-500 text-center">
                    {formatDate(docSentToClientDate)}
                  </p>
                )}
                {stage.key === 'returned' && docReturnedDate && (
                  <p className="mt-0.5 text-[10px] text-slate-500 text-center">
                    {formatDate(docReturnedDate)}
                  </p>
                )}
              </div>

              {/* Connector line (not after last) */}
              {idx < STAGES.length - 1 && (
                <div
                  className={`h-0.5 flex-1 mt-4 ${
                    idx < currentIdx ? 'bg-green-500' : 'bg-slate-700'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Action area */}
      <div className="pt-2">
        {docStatus === 'draft' && (
          <button
            onClick={() => advance('partner_signed')}
            disabled={loading}
            className="px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium transition-colors"
          >
            {loading ? 'Updating…' : 'Mark as Partner Signed'}
          </button>
        )}

        {docStatus === 'partner_signed' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400 whitespace-nowrap">
                Sent Date
              </label>
              <input
                type="date"
                value={sentDate}
                onChange={(e) => setSentDate(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              onClick={() =>
                advance('sent_to_client', {
                  doc_sent_to_client_date: sentDate || new Date().toISOString().split('T')[0],
                })
              }
              disabled={loading}
              className="w-fit px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium transition-colors"
            >
              {loading ? 'Updating…' : 'Mark as Sent to Client'}
            </button>
          </div>
        )}

        {docStatus === 'sent_to_client' && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-400 whitespace-nowrap">
                Returned Date
              </label>
              <input
                type="date"
                value={returnedDate}
                onChange={(e) => setReturnedDate(e.target.value)}
                className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <button
              onClick={() =>
                advance('returned', {
                  doc_returned_date: returnedDate || new Date().toISOString().split('T')[0],
                })
              }
              disabled={loading}
              className="w-fit px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium transition-colors"
            >
              {loading ? 'Updating…' : 'Mark as Returned'}
            </button>
          </div>
        )}

        {docStatus === 'returned' && (
          <UploadSignedButton
            agreementId={agreementId}
            label="Upload Final Document"
          />
        )}

        {docStatus === 'uploaded' && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-900/40 text-green-400 text-sm font-medium">
            <Check className="w-3.5 h-3.5" />
            Complete
          </span>
        )}

        {error && <p className="mt-2 text-red-400 text-xs">{error}</p>}
      </div>
    </div>
  )
}
