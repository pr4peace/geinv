import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractAgreementData } from '@/lib/claude'
import { validateExtraction } from '@/lib/extraction-validator'

export const maxDuration = 120

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

    // 1. Fetch agreement + current payout rows
    const [{ data: agreement, error: fetchError }, { data: currentRows }] = await Promise.all([
      supabase.from('agreements').select('*').eq('id', id).single(),
      supabase.from('payout_schedule').select('*').eq('agreement_id', id).order('period_from', { ascending: true }),
    ])

    if (fetchError || !agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    // 2. Download stored document
    const { data: fileDataPdf } = await supabase.storage
      .from('agreements')
      .download(`${agreement.reference_id}/original.pdf`)

    let fileData = fileDataPdf
    let mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' = 'application/pdf'

    if (!fileDataPdf) {
      const { data: fileDataDocx } = await supabase.storage
        .from('agreements')
        .download(`${agreement.reference_id}/original.docx`)
      if (!fileDataDocx) {
        return NextResponse.json({ error: 'Original document not found in storage' }, { status: 404 })
      }
      fileData = fileDataDocx
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }

    // 3. Extract
    const fileBuffer = Buffer.from(await fileData!.arrayBuffer())
    const extracted = await extractAgreementData(fileBuffer, mimeType)

    // 4. Validate extracted data
    const flags = validateExtraction(extracted)

    // 5. Return extracted + current stored values for diff
    return NextResponse.json({
      extracted,
      flags,
      current: {
        agreement: {
          agreement_date: agreement.agreement_date,
          investment_start_date: agreement.investment_start_date,
          agreement_type: agreement.agreement_type,
          investor_name: agreement.investor_name,
          investor_pan: agreement.investor_pan,
          investor_aadhaar: agreement.investor_aadhaar,
          investor_address: agreement.investor_address,
          tds_filing_name: agreement.tds_filing_name,
          principal_amount: agreement.principal_amount,
          roi_percentage: agreement.roi_percentage,
          payout_frequency: agreement.payout_frequency,
          interest_type: agreement.interest_type,
          lock_in_years: agreement.lock_in_years,
          maturity_date: agreement.maturity_date,
        },
        payoutRows: currentRows ?? [],
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
