import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractAgreementData } from '@/lib/claude'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    // 1. Fetch agreement to get reference_id
    const { data: agreement, error } = await supabase
      .from('agreements')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    if (!agreement.reference_id) {
       return NextResponse.json({ error: 'Agreement has no reference ID' }, { status: 400 })
    }

    // 2. Find the file in Storage
    const { data: files, error: listError } = await supabase.storage
      .from('agreements')
      .list(agreement.reference_id)
    
    if (listError || !files || files.length === 0) {
      return NextResponse.json({ error: 'Document file not found in storage' }, { status: 404 })
    }

    const originalFile = files.find(f => f.name.startsWith('original.'))
    if (!originalFile) {
      return NextResponse.json({ error: 'Original document file not found in storage' }, { status: 404 })
    }
    const path = `${agreement.reference_id}/${originalFile.name}`

    // 3. Download the file
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from('agreements')
      .download(path)

    if (downloadError || !fileBlob) {
      return NextResponse.json({ error: `Failed to download document: ${downloadError?.message}` }, { status: 500 })
    }

    // 4. Run extraction
    const buffer = Buffer.from(await fileBlob.arrayBuffer())
    const ext = originalFile.name.split('.').pop()?.toLowerCase()
    const mimeType = ext === 'docx' 
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      : 'application/pdf'

    const extractedData = await extractAgreementData(buffer, mimeType as 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

    return NextResponse.json(extractedData)
  } catch (err) {
    console.error('Rescan error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
