'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, FileUp, FileSignature } from 'lucide-react'
import UploadStep from '@/components/agreements/UploadStep'
import ExtractionReview from '@/components/agreements/ExtractionReview'
import ManualAgreementForm from '@/components/agreements/ManualAgreementForm'
import type { ExtractedAgreement } from '@/lib/claude'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
}

type Step = 'choice' | 'upload' | 'manual' | 'loading' | 'review'

interface ExtractResult {
  extracted: ExtractedAgreement
  file_url: string
  temp_path: string
}

export default function NewAgreementPage() {
  const [step, setStep] = useState<Step>('choice')
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [teamLoading, setTeamLoading] = useState(true)

  // Upload step state
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Carry through for review
  const [file, setFile] = useState<File | null>(null)
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
    salespersonId: string | null
    salespersonCustom: string | null
  }) {
    setUploadError(null)
    setFile(params.file)
    setSalespersonId(params.salespersonId)
    setSalespersonCustom(params.salespersonCustom)
    setStep('loading')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const formData = new FormData()
      formData.append('file', params.file)
      // is_draft is no longer used

      const res = await fetch('/api/extract', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? `Extraction failed (${res.status})`)
      }

      setExtractResult(data as ExtractResult)
      setStep('review')
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
    setStep('choice')
  }

  function handleBack() {
    if (step === 'review' || step === 'loading') {
      setExtractResult(null)
      setStep('upload')
    } else {
      setStep('choice')
    }
  }

  return (
    <div className="p-6 min-h-screen bg-slate-950">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-100">New Agreement</h1>
        <p className="text-xs text-slate-500 mt-0.5">Create a new investment agreement record</p>
      </div>

      {/* Step indicator */}
      {step !== 'choice' && (
        <div className="flex items-center gap-3 mb-8">
          {(['upload', 'loading', 'review', 'manual'] as const)
            .filter(s => {
              if (step === 'manual') return s === 'manual'
              return s !== 'manual'
            })
            .map((s, idx) => {
              const labels: Record<Step, string> = {
                choice: 'Choice',
                upload: 'Upload',
                loading: 'Extracting',
                review: 'Review & Confirm',
                manual: 'Create Manually',
              }
              const stepIdx: Record<Step, number> = { choice: -1, upload: 0, loading: 1, review: 2, manual: 0 }
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
      )}

      {/* Choice Screen */}
      {step === 'choice' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto py-12">
          <button
            onClick={() => setStep('upload')}
            className="flex flex-col items-center justify-center p-8 bg-slate-900 border border-slate-800 rounded-2xl hover:border-indigo-500 hover:bg-slate-800/50 transition-all group"
          >
            <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <FileUp className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-100 mb-2">Upload PDF / DOCX</h2>
            <p className="text-sm text-slate-400 text-center">
              Upload an existing signed agreement. Claude will automatically extract all details.
            </p>
          </button>

          <button
            onClick={() => setStep('manual')}
            className="flex flex-col items-center justify-center p-8 bg-slate-900 border border-slate-800 rounded-2xl hover:border-emerald-500 hover:bg-slate-800/50 transition-all group"
          >
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <FileSignature className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-100 mb-2">Create Manually</h2>
            <p className="text-sm text-slate-400 text-center">
              Fill in agreement details manually via form. Best for drafts or when no document is available yet.
            </p>
          </button>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <UploadStep
          teamMembers={teamLoading ? [] : teamMembers}
          onExtract={handleExtract}
          isLoading={false}
          error={uploadError}
          onBack={handleBack}
        />
      )}

      {/* Step 2: Manual Form */}
      {step === 'manual' && (
        <ManualAgreementForm teamMembers={teamMembers} onBack={handleBack} />
      )}

      {/* Step 3: Loading */}
      {step === 'loading' && (
        <div className="flex flex-col items-center justify-center py-32 space-y-6">
          <Loader2 className="w-12 h-12 text-indigo-400 animate-spin" />
          <div className="text-center space-y-1">
            <p className="text-slate-300 text-base font-medium">Reading the agreement...</p>
            <p className="text-slate-500 text-sm">This usually takes 10–30 seconds</p>
          </div>
          <button
            onClick={handleCancel}
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 text-sm transition-colors"
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
          salespersonId={salespersonId}
          salespersonCustom={salespersonCustom}
          teamMembers={teamMembers}
          onBack={handleBack}
        />
      )}
    </div>
  )
}
