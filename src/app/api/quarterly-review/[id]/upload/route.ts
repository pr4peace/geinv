import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    // Verify the quarterly review exists
    const { data: review, error: fetchError } = await supabase
      .from('quarterly_reviews')
      .select('id, quarter')
      .eq('id', id)
      .single()

    if (fetchError || !review) {
      return NextResponse.json({ error: 'Quarterly review not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const type = formData.get('type') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!type || !['incoming_funds', 'tds'].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'incoming_funds' or 'tds'" },
        { status: 400 }
      )
    }

    // Ensure bucket exists
    await supabase.storage.createBucket('reconciliations', { public: false }).catch(() => {})

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split('.').pop() ?? 'xlsx'
    const filePath = `${review.quarter}/${type}-${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('reconciliations')
      .upload(filePath, fileBuffer, {
        contentType: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('reconciliations').getPublicUrl(filePath)
    const fileUrl = urlData.publicUrl

    // Update quarterly_review with the doc URL
    const updateField =
      type === 'incoming_funds' ? 'incoming_funds_doc_url' : 'tds_doc_url'

    const { error: updateError } = await supabase
      .from('quarterly_reviews')
      .update({ [updateField]: fileUrl })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, file_url: fileUrl })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
