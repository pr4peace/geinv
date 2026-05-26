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
    <div className="max-w-xl mx-auto space-y-8">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-ink-4 hover:text-ink-2 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back
        </button>
      )}

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-sm p-16 text-center cursor-pointer transition-all shadow-sm ${
          dragOver
            ? 'border-forest bg-forest-soft/30 scale-[1.01]'
            : file
            ? 'border-gain bg-gain-soft/10'
            : 'border-hairline-strong bg-surface hover:border-forest-2/50'
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
          <div className="flex items-center justify-center gap-4 animate-in fade-in zoom-in-95">
            <div className="w-12 h-12 bg-gain-soft rounded-full flex items-center justify-center">
              <FileText className="w-6 h-6 text-gain" />
            </div>
            <div className="text-left">
              <p className="text-[15px] font-bold text-ink-1 font-serif leading-tight">{file.name}</p>
              <p className="text-[11px] text-ink-4 font-bold num mt-1">{(file.size / 1024).toFixed(1)} KB · {ext?.toUpperCase()}</p>
            </div>
            <button
              type="button"
              className="ml-6 w-8 h-8 rounded-full flex items-center justify-center text-ink-5 hover:text-rust hover:bg-rust-soft/30 transition-all"
              onClick={e => { e.stopPropagation(); setFile(null) }}
              aria-label="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-14 h-14 bg-canvas rounded-full flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6 text-ink-4" />
            </div>
            <div>
              <p className="text-[15px] font-semibold text-ink-1 font-serif">Drop your agreement here</p>
              <p className="lbl mt-1.5 font-bold">PDF or DOCX · Max 10MB</p>
            </div>
          </div>
        )}
      </div>

      {fileError && (
        <div className="bg-rust-soft border border-rust/10 p-3 rounded-sm">
          <p className="text-xs text-rust font-bold uppercase tracking-tight">{fileError}</p>
        </div>
      )}

      {/* Agreement type */}
      <div className="bg-surface border border-hairline rounded-sm p-6 space-y-5 shadow-sm">
        <p className="lbl font-bold text-ink-1 tracking-widest">Agreement Context</p>
        <div className="space-y-4">
          <label className="flex items-start gap-4 cursor-pointer group">
            <div className="relative flex items-center justify-center mt-1">
              <input
                type="radio"
                name="agreementType"
                checked={!isDraft}
                onChange={() => setIsDraft(false)}
                className="peer h-4 w-4 border-hairline-strong text-forest focus:ring-forest/10"
              />
            </div>
            <div>
              <p className="text-[13px] font-bold text-ink-1 group-hover:text-forest transition-colors">Signed Agreement</p>
              <p className="text-[11px] text-ink-4 font-medium mt-0.5">Document has been fully executed by all parties</p>
            </div>
          </label>
          <label className="flex items-start gap-4 cursor-pointer group">
            <div className="relative flex items-center justify-center mt-1">
              <input
                type="radio"
                name="agreementType"
                checked={isDraft}
                onChange={() => setIsDraft(true)}
                className="peer h-4 w-4 border-hairline-strong text-clay focus:ring-clay/10"
              />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[13px] font-bold text-ink-1 group-hover:text-clay transition-colors">Draft Record</p>
                <span className="text-[9px] font-bold uppercase tracking-widest text-clay bg-clay-soft px-1 rounded-sm border border-clay/10">DRAFT</span>
              </div>
              <p className="text-[11px] text-ink-4 font-medium mt-0.5">Not yet signed — useful for pre-emptive tracking</p>
            </div>
          </label>
        </div>
      </div>

      {/* Salesperson */}
      <div className="bg-surface border border-hairline rounded-sm p-6 space-y-5 shadow-sm">
        <p className="lbl font-bold text-ink-1 tracking-widest">Ownership</p>
        <div className="space-y-4">
          <select
            value={salespersonId}
            onChange={e => setSalespersonId(e.target.value)}
            className="w-full h-10 border border-hairline-strong bg-surface px-3 text-sm rounded-sm font-medium focus:border-forest focus:ring-2 focus:ring-forest/12 outline-none"
          >
            <option value="">— Unassigned —</option>
            {salespersonOptions.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
            <option value="other">Manually specified...</option>
          </select>

          {salespersonId === 'other' && (
            <input
              type="text"
              placeholder="Enter name..."
              value={salespersonCustom}
              onChange={e => setSalespersonCustom(e.target.value)}
              className="w-full h-10 border border-hairline-strong bg-surface px-3 text-sm rounded-sm font-medium focus:border-forest outline-none animate-in slide-in-from-top-1"
            />
          )}
        </div>
      </div>

      {/* Error from parent */}
      {error && (
        <div className="bg-rust-soft border border-rust/10 rounded-sm p-4 text-[11px] text-rust font-bold uppercase tracking-tight italic">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!file || isLoading}
        className="w-full h-12 bg-forest text-paper hover:bg-ink-1 disabled:opacity-40 disabled:bg-ink-5 disabled:cursor-not-allowed text-[13px] font-bold uppercase tracking-widest rounded-sm transition-all shadow-md active:scale-[0.98]"
      >
        {isLoading ? 'Processing Document...' : 'Extract & Preview'}
      </button>
    </div>
  )
}
