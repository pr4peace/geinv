import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculatePayoutSchedule, getTdsFilingDeadline } from '@/lib/payout-calculator'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userRole = request.headers.get('x-user-role') ?? ''
    if (userRole === 'salesperson') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const { id } = await params
    const supabase = createAdminClient()

    const { data: agreement, error: fetchError } = await supabase
      .from('agreements')
      .select('payout_frequency, interest_type, principal_amount, roi_percentage, investment_start_date, maturity_date')
      .eq('id', id)
      .single()

    if (fetchError || !agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    const isCumulative = agreement.payout_frequency === 'cumulative' || agreement.interest_type === 'compound'
    if (!isCumulative) {
      return NextResponse.json({ error: 'Only cumulative/compound agreements can be regenerated' }, { status: 400 })
    }

    // Delete all pending interest rows and pending TDS-only rows so we can regenerate cleanly
    const { error: delError } = await supabase
      .from('payout_schedule')
      .delete()
      .eq('agreement_id', id)
      .eq('is_principal_repayment', false)
      .neq('status', 'paid')

    if (delError) {
      return NextResponse.json({ error: `Failed to clear old rows: ${delError.message}` }, { status: 500 })
    }

    const generated = calculatePayoutSchedule({
      principal: agreement.principal_amount,
      roiPercentage: agreement.roi_percentage,
      payoutFrequency: 'cumulative',
      interestType: agreement.interest_type === 'compound' ? 'compound' : 'simple',
      startDate: agreement.investment_start_date,
      maturityDate: agreement.maturity_date,
    })

    type PayoutRow = {
      agreement_id: string; period_from: string; period_to: string; due_by: string
      no_of_days: number | null; gross_interest: number; tds_amount: number; net_interest: number
      is_principal_repayment: boolean; is_tds_only: boolean; tds_filed: boolean; status: string
    }
    const rows: PayoutRow[] = generated.map(row => ({
      agreement_id: id,
      period_from: row.period_from,
      period_to: row.period_to,
      due_by: row.due_by,
      no_of_days: row.no_of_days,
      gross_interest: row.gross_interest,
      tds_amount: row.tds_amount,
      net_interest: row.net_interest,
      is_principal_repayment: row.is_principal_repayment,
      is_tds_only: row.is_tds_only,
      tds_filed: false,
      status: 'pending',
    }))

    // Add TDS filing tracking rows for the interest row
    const interestRow = generated.find(r => !r.is_tds_only && !r.is_principal_repayment)
    if (interestRow && (interestRow.tds_amount ?? 0) > 0) {
      const deadline = getTdsFilingDeadline(interestRow.due_by)
      rows.push({
        agreement_id: id,
        period_from: deadline.period_from,
        period_to: deadline.period_to,
        due_by: deadline.due_by,
        no_of_days: null,
        gross_interest: 0,
        tds_amount: interestRow.tds_amount,
        net_interest: 0,
        is_principal_repayment: false,
        is_tds_only: true,
        tds_filed: false,
        status: 'pending',
      })
    }

    const { error: insertError } = await supabase.from('payout_schedule').insert(rows)
    if (insertError) {
      return NextResponse.json({ error: `Failed to insert rows: ${insertError.message}` }, { status: 500 })
    }

    await supabase.from('agreement_audit_log').insert({
      agreement_id: id,
      change_type: 'updated',
      new_values: { action: 'regenerate_schedule', rows_inserted: rows.length },
    })

    return NextResponse.json({ success: true, rows: rows.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
