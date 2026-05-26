'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import UploadStep from '@/components/agreements/UploadStep'
import ExtractionReview from '@/components/agreements/ExtractionReview'
import type { ExtractedAgreement } from '@/lib/claude'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
}

type Step = 'upload' | 'loading' | 'review'

interface ExtractResult {
  extracted: ExtractedAgreement
  file_url: string
  temp_path: string
}

export default function NewAgreementPage() {
  const [step, setStep] = useState<Step>('upload')
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [teamLoading, setTeamLoading] = useState(true)

  // Upload step state
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Carry through for review
  const [file, setFile] = useState<File | null>(null)
  const [isDraft, setIsDraft] = useState(false)
  const [salespersonId, setSalespersonId] = useState<string | null>(null)
  const [salespersonCustom, setSalespersonCustom] = useState<string | null>(null)

  // Extraction result
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null)

  // Abort controller for in-flight extraction
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/team')
      .then(r => r.json())
      .then((data: TeamMember[]) => {
        setTeamMembers(Array.isArray(data) ? data : [])
      })
      .catch(() => setTeamMembers([]))
      .finally(() => setTeamLoading(false))
  }, [])

  async function handleExtract(params: {
    file: File
    isDraft: boolean
    salespersonId: string | null
    salespersonCustom: string | null
  }) {
    setUploadError(null)
    setFile(params.file)
    setIsDraft(params.isDraft)
    setSalespersonId(params.salespersonId)
    setSalespersonCustom(params.salespersonCustom)
    setStep('loading')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const formData = new FormData()
      formData.append('file', params.file)
      formData.append('is_draft', String(params.isDraft))

      const res = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      if (res.redirected) {
        window.location.href = res.url
        return
      }

      const contentType = res.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        const data = await res.json()
        if (!res.ok) {
          throw new Error(data.error ?? `Extraction failed (${res.status})`)
        }
        setExtractResult(data as ExtractResult)
        setStep('review')
      } else {
        const text = await res.text()
        const isErrorPage = text.includes('An error occurred') || text.includes('<!DOCTYPE html>')
        throw new Error(
          isErrorPage 
            ? `Server error (${res.status}). The extraction service might be down.` 
            : `Unexpected response: ${text.slice(0, 50)}...`
        )
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      console.error('Extraction error:', err)
      setUploadError(err instanceof Error ? err.message : 'Extraction failed. Please try again.')
      setStep('upload')
    } finally {
      abortRef.current = null
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
    abortRef.current = null
    setExtractResult(null)
    setUploadError(null)
    setStep('upload')
  }

  function handleBack() {
    setExtractResult(null)
    setStep('upload')
  }

  return (
    <div className="p-8 min-h-screen bg-canvas">
      {/* Page header */}
      <div className="mb-6 border-b border-ink-1 pb-3">
        <h1 className="text-[28px] font-semibold text-ink-1 font-serif tracking-tight">New Agreement</h1>
        <p className="text-xs text-ink-4 mt-0.5">Create a new investment agreement record</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-8">
        {(['upload', 'loading', 'review'] as const)
          .map((s, idx) => {
            const labels: Record<Step, string> = {
              upload: 'Upload',
              loading: 'Extracting',
              review: 'Review & Confirm',
            }
            const stepIdx: Record<Step, number> = { upload: 0, loading: 1, review: 2 }
            const currentIdx = stepIdx[step]
            const thisIdx = stepIdx[s]
            const done = currentIdx > thisIdx
            const active = currentIdx === thisIdx
            return (
              <div key={s} className="flex items-center gap-2">
                {idx > 0 && <div className={`w-10 h-px ${done || active ? 'bg-forest' : 'bg-hairline-strong'}`} />}
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-sm flex items-center justify-center text-xs font-bold transition-colors ${
                      done
                        ? 'bg-gain text-paper'
                        : active
                        ? 'bg-forest text-paper'
                        : 'bg-surface text-ink-5 border border-hairline'
                    }`}
                  >
                    {done ? '✓' : idx + 1}
                  </div>
                  <span
                    className={`text-sm font-medium hidden sm:inline ${
                      active ? 'text-ink-1' : done ? 'text-gain' : 'text-ink-5'
                    }`}
                  >
                    {labels[s]}
                  </span>
                </div>
              </div>
            )
          })}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <UploadStep
          teamMembers={teamLoading ? [] : teamMembers}
          onExtract={handleExtract}
          isLoading={false}
          error={uploadError}
          onBack={undefined}
        />
      )}

      {/* Step 3: Loading */}
      {step === 'loading' && (
        <div className="flex flex-col items-center justify-center py-32 space-y-6">
          <Loader2 className="w-12 h-12 text-forest animate-spin" />
          <div className="text-center space-y-1">
            <p className="text-ink-2 text-base font-medium">Reading the agreement...</p>
            <p className="text-ink-4 text-sm">This usually takes 10–30 seconds</p>
          </div>
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-sm border border-hairline-strong text-ink-3 hover:text-ink-1 hover:bg-surface-2 text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 'review' && extractResult && file && (
        <ExtractionReview
          extracted={extractResult.extracted}
          fileUrl={extractResult.file_url}
          tempPath={extractResult.temp_path}
          fileName={file.name}
          file={file}
          isDraft={isDraft}
          salespersonId={salespersonId}
          salespersonCustom={salespersonCustom}
          teamMembers={teamMembers}
          onBack={handleBack}
        />
      )}
    </div>
  )
}
