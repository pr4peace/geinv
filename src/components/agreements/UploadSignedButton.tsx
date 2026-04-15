'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'

interface UploadSignedButtonProps {
  agreementId: string
  label?: string
  className?: string
}

export default function UploadSignedButton({
  agreementId,
  label = 'Upload Signed Copy',
  className = '',
}: UploadSignedButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const MAX_MB = 10
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_MB} MB. Please compress the scan and try again.`)
      e.target.value = ''
      return
    }

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch(`/api/agreements/${agreementId}/upload-signed`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Upload failed')
      }

      setSuccess(true)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      // Reset input so same file can be re-selected if needed
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  if (success) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-900/40 text-green-400 text-sm font-medium">
        Uploaded successfully
      </span>
    )
  }

  return (
    <div className={`flex flex-col items-start gap-1 ${className}`}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium transition-colors"
      >
        <Upload className="w-3.5 h-3.5" />
        {uploading ? 'Uploading…' : label}
      </button>
      {error && <p className="text-red-400 text-xs">{error}</p>}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
