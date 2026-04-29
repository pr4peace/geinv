
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractAgreementData } from '@/lib/claude'

export const maxDuration = 60 // seconds

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const userRole = request.headers.get('x-user-role')
    if (userRole !== 'coordinator' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const supabase = createAdminClient()

    // 1. Fetch agreement to get reference_id
    const { data: agreement, error: fetchError } = await supabase
      .from('agreements')
      .select('id, reference_id, document_url')
      .eq('id', id)
      .single()

    if (fetchError || !agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    // 2. Try to find the document in storage
    // We check for original.pdf then original.docx
    const { data: fileDataPdf, error: downloadErrorPdf } = await supabase.storage
      .from('agreements')
      .download(`${agreement.reference_id}/original.pdf`)

    let fileData = fileDataPdf
    let mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' = 'application/pdf'

    if (downloadErrorPdf) {
      const { data: fileDataDocx, error: downloadErrorDocx } = await supabase.storage
        .from('agreements')
        .download(`${agreement.reference_id}/original.docx`)
      
      if (downloadErrorDocx || !fileDataDocx) {
        return NextResponse.json({ error: 'Original document not found in storage' }, { status: 404 })
      }
      fileData = fileDataDocx
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }

    if (!fileData) {
      return NextResponse.json({ error: 'Original document not found in storage' }, { status: 404 })
    }

    // 3. Extract data
    const fileBuffer = Buffer.from(await fileData.arrayBuffer())
    const extracted = await extractAgreementData(fileBuffer, mimeType)

    return NextResponse.json(extracted)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
