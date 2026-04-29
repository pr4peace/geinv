import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ExtractedAgreement, ExtractedPayoutRow } from '@/lib/claude'

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

    const body = await request.json() as {
      extracted: ExtractedAgreement
      acceptedFlags?: string[] // flag IDs that were accepted as-is
    }

    const { extracted } = body
    if (!extracted) {
      return NextResponse.json({ error: 'extracted is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Update agreement fields
    const { error: updateError } = await supabase
      .from('agreements')
      .update({
        agreement_date: extracted.agreement_date,
        investment_start_date: extracted.investment_start_date,
        agreement_type: extracted.agreement_type,
        investor_name: extracted.investor_name,
        investor_pan: extracted.investor_pan ?? null,
        investor_aadhaar: extracted.investor_aadhaar ?? null,
        investor_address: extracted.investor_address ?? null,
        tds_filing_name: extracted.tds_filing_name ?? null,
        nominees: (extracted.nominees ?? []).map(n => ({
          name: n.name ?? '',
          relationship: (n as { relationship?: string }).relationship ?? '',
          share: (n as { share?: number }).share ?? 100,
          pan: n.pan ?? '',
        })),
        principal_amount: extracted.principal_amount,
        roi_percentage: extracted.roi_percentage,
        payout_frequency: extracted.payout_frequency,
        interest_type: extracted.interest_type,
        lock_in_years: extracted.lock_in_years,
        maturity_date: extracted.maturity_date,
        payments: extracted.payments ?? [],
        rescan_required: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // 2. Delete existing payout rows
    const { error: deleteError } = await supabase
      .from('payout_schedule')
      .delete()
      .eq('agreement_id', id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // 3. Insert new payout rows
    const newRows = (extracted.payout_schedule ?? []).map((row: ExtractedPayoutRow) => ({
      agreement_id: id,
      period_from: row.period_from,
      period_to: row.period_to,
      no_of_days: row.no_of_days ?? null,
      due_by: row.due_by,
      gross_interest: row.gross_interest ?? 0,
      tds_amount: row.tds_amount ?? 0,
      net_interest: row.net_interest ?? 0,
      is_principal_repayment: row.is_principal_repayment ?? false,
      is_tds_only: row.is_tds_only ?? false,
      tds_filed: false,
      status: 'pending',
    }))

    if (newRows.length > 0) {
      const { error: insertError } = await supabase
        .from('payout_schedule')
        .insert(newRows)

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, rowsInserted: newRows.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
