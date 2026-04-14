import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractAgreementData } from '@/lib/claude'

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

    const { data: urlData } = supabase.storage.from('agreements').getPublicUrl(tempPath)
    const fileUrl = urlData.publicUrl

    return NextResponse.json({ extracted, file_url: fileUrl })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
