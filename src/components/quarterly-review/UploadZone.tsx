'use client'

import { useRef, useState, DragEvent } from 'react'
import { Upload, CheckCircle, Clock } from 'lucide-react'

type UploadStatus = 'not_uploaded' | 'uploaded' | 'reconciled'

interface UploadZoneProps {
  label: string
  type: 'incoming_funds' | 'tds'
  status: UploadStatus
  reviewId: string
  onUploadSuccess: () => void
}

export default function UploadZone({
  label,
  type,
  status,
  reviewId,
  onUploadSuccess,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const statusConfig = {
    not_uploaded: {
      label: 'Not uploaded',
      className: 'text-slate-400',
      icon: <Clock className="w-4 h-4" />,
    },
    uploaded: {
      label: 'Uploaded',
      className: 'text-amber-400',
      icon: <CheckCircle className="w-4 h-4" />,
    },
    reconciled: {
      label: 'Reconciled',
      className: 'text-emerald-400',
      icon: <CheckCircle className="w-4 h-4" />,
    },
  }

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.xlsx')) {
      setError('Only .xlsx files are accepted')
      return
    }
    setError(null)
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type)
      const res = await fetch(`/api/quarterly-review/${reviewId}/upload`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Upload failed')
      }
      onUploadSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const cfg = statusConfig[status]

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        <span className={`flex items-center gap-1 text-xs font-medium ${cfg.className}`}>
          {cfg.icon}
          {cfg.label}
        </span>
      </div>

      <div
        className={`relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-indigo-500 bg-indigo-950/30'
            : 'border-slate-600 hover:border-slate-500 bg-slate-800/50'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
            e.target.value = ''
          }}
        />
        <Upload className="w-8 h-8 mx-auto mb-2 text-slate-500" />
        <p className="text-sm text-slate-400">
          {uploading ? 'Uploading…' : 'Drag & drop or click to upload .xlsx'}
        </p>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}
