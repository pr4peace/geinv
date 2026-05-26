'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, FileText, Calculator } from 'lucide-react'
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

type Step = 'choose' | 'upload' | 'loading' | 'review'

interface ExtractResult {
  extracted: ExtractedAgreement
  file_url: string
  temp_path: string
}

export default function NewAgreementPage() {
  const router = useRouter()
  const [step, setStep] = useState<Step>('choose')
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [teamLoading, setTeamLoading] = useState(true)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [isDraft, setIsDraft] = useState(false)
  const [salespersonId, setSalespersonId] = useState<string | null>(null)
  const [salespersonCustom, setSalespersonCustom] = useState<string | null>(null)
  const [extractResult, setExtractResult] = useState<ExtractResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    fetch('/api/team')
      .then(r => r.json())
      .then((data: TeamMember[]) => setTeamMembers(Array.isArray(data) ? data : []))
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

      if (res.redirected) { window.location.href = res.url; return }

      const contentType = res.headers.get('content-type')
      if (contentType?.includes('application/json')) {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? `Extraction failed (${res.status})`)
        setExtractResult(data as ExtractResult)
        setStep('review')
      } else {
        const text = await res.text()
        const isErrorPage = text.includes('An error occurred') || text.includes('<!DOCTYPE html>')
        throw new Error(isErrorPage ? `Server error (${res.status}).` : `Unexpected response: ${text.slice(0, 50)}...`)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
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
    setStep('choose')
  }

  function handleBack() {
    setExtractResult(null)
    setStep('choose')
  }

  return (
    <div className="p-8 min-h-screen bg-canvas">
      <div className="mb-6 border-b border-ink-1 pb-3">
        <h1 className="text-[28px] font-semibold text-ink-1 font-serif tracking-tight">New Agreement</h1>
        <p className="text-xs text-ink-4 mt-0.5">Create a new investment agreement record</p>
      </div>

      {step === 'choose' && (
        <div className="max-w-2xl">
          <p className="text-sm text-ink-3 mb-6">Choose how to add this agreement</p>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setStep('upload')}
              className="text-left bg-surface border border-hairline rounded-sm p-6 hover:border-forest hover:bg-surface-2 transition-all group"
            >
              <div className="w-9 h-9 bg-surface-2 rounded-sm flex items-center justify-center mb-4">
                <FileText className="w-4 h-4 text-ink-3 group-hover:text-forest" />
              </div>
              <div className="font-bold text-ink-1 text-sm mb-1">Upload Document</div>
              <div className="text-xs text-ink-4 leading-relaxed">Scan an existing signed agreement — Gemini extracts all details automatically.</div>
              <div className="mt-4 text-[10px] font-bold text-forest uppercase tracking-wide">Scan PDF / DOCX →</div>
            </button>

            <button
              onClick={() => router.push('/agreements/new/calculator')}
              className="text-left bg-surface border border-hairline rounded-sm p-6 hover:border-forest hover:bg-surface-2 transition-all group"
            >
              <div className="w-9 h-9 bg-surface-2 rounded-sm flex items-center justify-center mb-4">
                <Calculator className="w-4 h-4 text-ink-3 group-hover:text-forest" />
              </div>
              <div className="font-bold text-ink-1 text-sm mb-1">Enter Details</div>
              <div className="text-xs text-ink-4 leading-relaxed">Fill in investor and investment details — calculator generates the payout schedule live.</div>
              <div className="mt-4 text-[10px] font-bold text-forest uppercase tracking-wide">Open Calculator →</div>
            </button>
          </div>
        </div>
      )}

      {step === 'upload' && (
        <UploadStep
          teamMembers={teamLoading ? [] : teamMembers}
          onExtract={handleExtract}
          isLoading={false}
          error={uploadError}
          onBack={() => setStep('choose')}
        />
      )}

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
