'use client'

import { useEffect, useState } from 'react'
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

    try {
      const formData = new FormData()
      formData.append('file', params.file)
      formData.append('is_draft', String(params.isDraft))

      const res = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? `Extraction failed (${res.status})`)
      }

      setExtractResult(data as ExtractResult)
      setStep('review')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Extraction failed. Please try again.')
      setStep('upload')
    }
  }

  function handleBack() {
    setExtractResult(null)
    setStep('upload')
  }

  return (
    <div className="p-6 min-h-screen bg-slate-950">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">New Agreement</h1>
        <p className="text-xs text-slate-500 mt-0.5">Upload and extract investment agreement details</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-8">
        {(['upload', 'loading', 'review'] as const).map((s, idx) => {
          const labels: Record<Step, string> = { upload: 'Upload', loading: 'Extracting', review: 'Review & Confirm' }
          const stepIdx = { upload: 0, loading: 1, review: 2 }
          const currentIdx = stepIdx[step]
          const thisIdx = stepIdx[s]
          const done = currentIdx > thisIdx
          const active = currentIdx === thisIdx
          return (
            <div key={s} className="flex items-center gap-2">
              {idx > 0 && <div className={`w-10 h-px ${done || active ? 'bg-indigo-600' : 'bg-slate-700'}`} />}
              <div className={`flex items-center gap-2`}>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    done
                      ? 'bg-emerald-600 text-white'
                      : active
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-800 text-slate-500 border border-slate-700'
                  }`}
                >
                  {done ? '✓' : idx + 1}
                </div>
                <span
                  className={`text-sm font-medium hidden sm:inline ${
                    active ? 'text-slate-100' : done ? 'text-emerald-400' : 'text-slate-500'
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
        />
      )}

      {/* Step 2: Loading */}
      {step === 'loading' && (
        <div className="flex flex-col items-center justify-center py-32 space-y-4">
          <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
          <p className="text-slate-300 text-base font-medium">Claude is reading the agreement...</p>
          <p className="text-slate-500 text-sm">This usually takes 10–30 seconds</p>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 'review' && extractResult && file && (
        <ExtractionReview
          extracted={extractResult.extracted}
          fileUrl={extractResult.file_url}
          fileName={file.name}
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
