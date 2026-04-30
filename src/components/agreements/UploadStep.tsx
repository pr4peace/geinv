'use client'

import { useCallback, useRef, useState } from 'react'
import { Upload, FileText, X, ChevronLeft } from 'lucide-react'

interface TeamMember {
  id: string
  name: string
  email: string
  role: string
  is_active: boolean
}

interface UploadStepProps {
  teamMembers: TeamMember[]
  onExtract: (params: {
    file: File
    isDraft: boolean
    salespersonId: string | null
    salespersonCustom: string | null
  }) => void
  isLoading: boolean
  error: string | null
  onBack?: () => void
}

const ACCEPTED_MIME = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
const MAX_SIZE = 10 * 1024 * 1024

export default function UploadStep({ teamMembers, onExtract, isLoading, error, onBack }: UploadStepProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isDraft, setIsDraft] = useState(false)
  const [salespersonId, setSalespersonId] = useState<string>('')
  const [salespersonCustom, setSalespersonCustom] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const salespersonOptions = teamMembers.filter(m => (m.role === 'salesperson' || m.role === 'coordinator') && m.is_active)

  function validateAndSetFile(f: File) {
    setFileError(null)
    const ext = f.name.split('.').pop()?.toLowerCase()
    const validExt = ext === 'pdf' || ext === 'docx'
    const validMime = ACCEPTED_MIME.includes(f.type)
    if (!validExt && !validMime) {
      setFileError('Only PDF and DOCX files are accepted.')
      return
    }
    if (f.size > MAX_SIZE) {
      setFileError('File size must be under 10MB.')
      return
    }
    setFile(f)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) validateAndSetFile(dropped)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback(() => setDragOver(false), [])

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) validateAndSetFile(f)
  }

  function handleSubmit() {
    if (!file) return
    onExtract({
      file,
      isDraft,
      salespersonId: salespersonId === 'other' || salespersonId === '' ? null : salespersonId,
      salespersonCustom: salespersonId === 'other' ? salespersonCustom : null,
    })
  }

  const ext = file?.name.split('.').pop()?.toLowerCase()

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-100 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Choice
        </button>
      )}

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          dragOver
            ? 'border-indigo-500 bg-indigo-500/10'
            : file
            ? 'border-emerald-600 bg-emerald-600/5'
            : 'border-slate-700 bg-slate-800/50 hover:border-slate-500'
        }`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx"
          className="hidden"
          onChange={handleFileInput}
        />

        {file ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="w-8 h-8 text-emerald-400 flex-shrink-0" />
            <div className="text-left">
              <p className="text-sm font-medium text-slate-100">{file.name}</p>
              <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB · {ext?.toUpperCase()}</p>
            </div>
            <button
              type="button"
              className="ml-4 text-slate-500 hover:text-red-400 transition-colors"
              onClick={e => { e.stopPropagation(); setFile(null) }}
              aria-label="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <Upload className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-300 font-medium">Drop your agreement here, or click to browse</p>
            <p className="text-xs text-slate-500 mt-1">PDF or DOCX · max 10MB</p>
          </>
        )}
      </div>

      {fileError && (
        <p className="text-red-400 text-sm">{fileError}</p>
      )}

      {/* Agreement type */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Agreement Status</p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="agreementType"
            checked={!isDraft}
            onChange={() => setIsDraft(false)}
            className="mt-0.5 accent-indigo-500"
          />
          <div>
            <p className="text-sm font-medium text-slate-100">Signed Agreement</p>
            <p className="text-xs text-slate-500">Document has been signed by all parties</p>
          </div>
        </label>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="radio"
            name="agreementType"
            checked={isDraft}
            onChange={() => setIsDraft(true)}
            className="mt-0.5 accent-amber-500"
          />
          <div>
            <p className="text-sm font-medium text-slate-100">
              Draft Agreement
              <span className="ml-2 inline-block px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] rounded font-semibold">DRAFT</span>
            </p>
            <p className="text-xs text-slate-500">Document not yet signed — tracking starts now</p>
          </div>
        </label>
      </div>

      {/* Salesperson */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Salesperson</p>
        <select
          value={salespersonId}
          onChange={e => setSalespersonId(e.target.value)}
          className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">— None / Not assigned —</option>
          {salespersonOptions.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
          <option value="other">Other (enter name)</option>
        </select>

        {salespersonId === 'other' && (
          <input
            type="text"
            placeholder="Enter salesperson name"
            value={salespersonCustom}
            onChange={e => setSalespersonCustom(e.target.value)}
            className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}
      </div>

      {/* Error from parent */}
      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded-lg p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!file || isLoading}
        className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors text-sm"
      >
        {isLoading ? 'Extracting...' : 'Extract & Preview'}
      </button>
    </div>
  )
}
