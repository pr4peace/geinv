import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractAgreementData } from '@/lib/claude'
import { validateExtraction } from '@/lib/extraction-validator'
import type { ExtractedAgreement } from '@/lib/claude'

export const maxDuration = 300

interface BatchRescanResult {
  agreementId: string
  referenceId: string
  investorName: string
  status: 'success' | 'error'
  extracted?: ExtractedAgreement
  flags?: ReturnType<typeof validateExtraction>
  current?: Record<string, unknown>
  error?: string
}

async function scanAgreement(id: string): Promise<BatchRescanResult> {
  const supabase = createAdminClient()

  const [{ data: agreement, error: fetchError }, { data: currentRows }] = await Promise.all([
    supabase.from('agreements').select('*').eq('id', id).single(),
    supabase.from('payout_schedule').select('*').eq('agreement_id', id).order('period_from', { ascending: true }),
  ])

  if (fetchError || !agreement) {
    return { agreementId: id, referenceId: '', investorName: '', status: 'error', error: 'Agreement not found' }
  }

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
      return { agreementId: id, referenceId: agreement.reference_id, investorName: agreement.investor_name, status: 'error', error: 'Document not found' }
    }
    fileData = fileDataDocx
    mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }

  const fileBuffer = Buffer.from(await fileData!.arrayBuffer())
  const extracted = await extractAgreementData(fileBuffer, mimeType)
  const flags = validateExtraction(extracted)

  return {
    agreementId: id,
    referenceId: agreement.reference_id,
    investorName: agreement.investor_name,
    status: 'success',
    extracted,
    flags,
    current: {
      agreement_date: agreement.agreement_date,
      investment_start_date: agreement.investment_start_date,
      agreement_type: agreement.agreement_type,
      investor_name: agreement.investor_name,
      investor_pan: agreement.investor_pan,
      principal_amount: agreement.principal_amount,
      roi_percentage: agreement.roi_percentage,
      payout_frequency: agreement.payout_frequency,
      interest_type: agreement.interest_type,
      lock_in_years: agreement.lock_in_years,
      maturity_date: agreement.maturity_date,
      payoutRows: currentRows ?? [],
    },
  }
}

async function runWithConcurrency<T>(items: T[], fn: (item: T) => Promise<BatchRescanResult>, limit: number): Promise<BatchRescanResult[]> {
  const results: BatchRescanResult[] = []
  const executing = new Set<Promise<void>>()

  for (const item of items) {
    const promise = fn(item).then(result => {
      results.push(result)
      executing.delete(promise)
    })
    executing.add(promise)
    if (executing.size >= limit) {
      await Promise.race(executing)
    }
  }

  await Promise.all(executing)
  return results
}

export async function POST(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole !== 'coordinator' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json() as { agreementIds: string[] }
    if (!body.agreementIds?.length) {
      return NextResponse.json({ error: 'No agreement IDs provided' }, { status: 400 })
    }

    if (body.agreementIds.length > 20) {
      return NextResponse.json({ error: 'Maximum 20 agreements per batch' }, { status: 400 })
    }

    const results = await runWithConcurrency(
      body.agreementIds,
      id => scanAgreement(id),
      5
    )

    const success = results.filter(r => r.status === 'success').length
    const errors = results.filter(r => r.status === 'error').length

    return NextResponse.json({ results, success, errors })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
