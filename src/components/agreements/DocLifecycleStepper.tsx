'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
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
    <div className="space-y-8">
      {/* Stepper */}
      <div className="flex items-start gap-0 px-2">
        {STAGES.map((stage, idx) => {
          const isLastStep = idx === STAGES.length - 1
          const isCompleted = idx < currentIdx || (isLastStep && idx === currentIdx)
          const isCurrent = idx === currentIdx

          return (
            <div key={stage.key} className="flex items-start flex-1">
              <div className="flex flex-col items-center flex-1">
                {/* Circle */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center border transition-colors ${
                    isCompleted
                      ? 'bg-gain border-gain text-paper'
                      : isCurrent
                      ? 'bg-forest border-forest text-paper'
                      : 'bg-canvas border-hairline-strong text-ink-4'
                  }`}
                >
                  {isCompleted ? (
                    <Check className="w-3 h-3 stroke-[3]" />
                  ) : (
                    <span className="text-[10px] font-bold num">{idx + 1}</span>
                  )}
                </div>

                {/* Label */}
                <p
                  className={`mt-2 text-[10px] uppercase tracking-widest text-center leading-tight max-w-[80px] font-bold ${
                    isCurrent
                      ? 'text-forest'
                      : isCompleted
                      ? 'text-gain'
                      : 'text-ink-5'
                  }`}
                >
                  {stage.label}
                </p>

                {/* Date beneath stage */}
                {stage.key === 'sent_to_client' && docSentToClientDate && (
                  <p className="mt-1 num text-[9px] text-ink-4 text-center font-bold">
                    {formatDate(docSentToClientDate)}
                  </p>
                )}
                {stage.key === 'returned' && docReturnedDate && (
                  <p className="mt-1 num text-[9px] text-ink-4 text-center font-bold">
                    {formatDate(docReturnedDate)}
                  </p>
                )}
              </div>

              {/* Connector line (not after last) */}
              {idx < STAGES.length - 1 && (
                <div
                  className={`h-px flex-1 mt-3 ${
                    idx < currentIdx ? 'bg-gain' : 'bg-hairline'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Action area */}
      <div className="pt-2 flex flex-col items-center sm:items-start">
        {docStatus === 'draft' && (
          <button
            onClick={() => advance('partner_signed')}
            disabled={loading}
            className="h-8 px-4 rounded-sm bg-forest text-paper text-[11px] font-bold uppercase transition-all shadow-sm hover:bg-ink-1 disabled:opacity-50"
          >
            {loading ? 'Updating…' : 'Mark as Partner Signed'}
          </button>
        )}

        {docStatus === 'partner_signed' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-bold uppercase text-ink-4 tracking-wider">
                Sent Date
              </label>
              <input
                type="date"
                value={sentDate}
                onChange={(e) => setSentDate(e.target.value)}
                className="h-7 border border-hairline-strong bg-surface px-2 text-sm rounded-sm focus:border-forest focus:ring-2 focus:ring-forest/12 outline-none"
              />
            </div>
            <button
              onClick={() =>
                advance('sent_to_client', {
                  doc_sent_to_client_date: sentDate || new Date().toISOString().split('T')[0],
                })
              }
              disabled={loading}
              className="h-8 px-4 rounded-sm bg-forest text-paper text-[11px] font-bold uppercase transition-all shadow-sm hover:bg-ink-1 disabled:opacity-50"
            >
              {loading ? 'Updating…' : 'Mark as Sent to Client'}
            </button>
          </div>
        )}

        {docStatus === 'sent_to_client' && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-bold uppercase text-ink-4 tracking-wider">
                Returned Date
              </label>
              <input
                type="date"
                value={returnedDate}
                onChange={(e) => setReturnedDate(e.target.value)}
                className="h-7 border border-hairline-strong bg-surface px-2 text-sm rounded-sm focus:border-forest focus:ring-2 focus:ring-forest/12 outline-none"
              />
            </div>
            <button
              onClick={() =>
                advance('returned', {
                  doc_returned_date: returnedDate || new Date().toISOString().split('T')[0],
                })
              }
              disabled={loading}
              className="h-8 px-4 rounded-sm bg-forest text-paper text-[11px] font-bold uppercase transition-all shadow-sm hover:bg-ink-1 disabled:opacity-50"
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
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-sm bg-gain-soft text-gain border border-gain/20 shadow-sm">
            <Check className="w-3.5 h-3.5 stroke-[3]" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Complete</span>
          </div>
        )}

        {error && <p className="mt-2 text-rust text-[10px] font-bold uppercase">{error}</p>}
      </div>
    </div>
  )
}
