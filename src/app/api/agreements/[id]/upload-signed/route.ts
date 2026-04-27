import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole === 'salesperson') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const supabase = createAdminClient()

    // Verify the agreement exists
    const { data: existing, error: fetchError } = await supabase
      .from('agreements')
      .select('id, reference_id')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split('.').pop() ?? 'pdf'
    const filePath = `${existing.reference_id}/signed-${Date.now()}.${ext}`

    // Ensure bucket exists
    await supabase.storage.createBucket('agreements', { public: false }).catch(() => {})

    const { error: uploadError } = await supabase.storage
      .from('agreements')
      .upload(filePath, fileBuffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const { data: signedData, error: signedError } = await supabase.storage
      .from('agreements')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365) // 1 year

    if (signedError || !signedData) {
      return NextResponse.json({ error: 'Failed to generate document URL' }, { status: 500 })
    }
    const documentUrl = signedData.signedUrl

    const { data: updated, error: updateError } = await supabase
      .from('agreements')
      .update({
        document_url: documentUrl,
        is_draft: false,
        doc_status: 'uploaded',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
