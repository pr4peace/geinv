import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractAgreementData } from '@/lib/claude'

export const maxDuration = 60 // seconds — Gemini can be slow on large PDFs

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size exceeds 10MB limit' }, { status: 400 })
    }

    // Determine MIME type from content-type header or file extension
    const ext = file.name.split('.').pop()?.toLowerCase()
    let mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

    if (file.type === 'application/pdf' || ext === 'pdf') {
      mimeType = 'application/pdf'
    } else if (
      file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === 'docx'
    ) {
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    } else {
      return NextResponse.json(
        { error: 'Unsupported file type. Only PDF and DOCX are supported.' },
        { status: 400 }
      )
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())

    // Extract agreement data via Claude
    const extracted = await extractAgreementData(fileBuffer, mimeType)

    // Upload to Supabase Storage (temp path)
    const supabase = createAdminClient()

    // Ensure bucket exists
    await supabase.storage.createBucket('agreements', { public: false }).catch(() => {})

    const tempPath = `temp/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('agreements')
      .upload(tempPath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      )
    }

    // Signed URL valid for 24 hours — long enough to confirm & save the agreement.
    // Temp files are not auto-purged; run a periodic cleanup job on the temp/ prefix if storage grows.
    const { data: signedData, error: signedError } = await supabase.storage
      .from('agreements')
      .createSignedUrl(tempPath, 60 * 60 * 24) // 24 hours

    if (signedError || !signedData) {
      return NextResponse.json({ error: 'Failed to generate file URL' }, { status: 500 })
    }
    const fileUrl = signedData.signedUrl

    return NextResponse.json({ extracted, file_url: fileUrl, temp_path: tempPath })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
