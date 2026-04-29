
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateTdsOnlyRows } from '@/lib/tds-calculator'

export async function POST(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const supabase = createAdminClient()

    // 1. Find all cumulative/compound agreements
    const { data: agreements, error: agreementsError } = await supabase
      .from('agreements')
      .select('*')
      .or('payout_frequency.eq.cumulative,interest_type.eq.compound')
      .is('deleted_at', null)

    if (agreementsError) {
      return NextResponse.json({ error: agreementsError.message }, { status: 500 })
    }

    let totalAdded = 0
    const errors: string[] = []

    for (const agreement of agreements) {
      // 2. Check if it already has is_tds_only rows
      const { data: existingTdsRows, error: checkError } = await supabase
        .from('payout_schedule')
        .select('id')
        .eq('agreement_id', agreement.id)
        .eq('is_tds_only', true)
        .limit(1)

      if (checkError) {
        errors.push(`Agreement ${agreement.id}: ${checkError.message}`)
        continue
      }

      if (existingTdsRows && existingTdsRows.length > 0) {
        continue // Already has TDS rows
      }

      // 3. Generate TDS-only rows
      const tdsOnlyRows = generateTdsOnlyRows({
        agreementId: agreement.id,
        startDate: agreement.investment_start_date,
        maturityDate: agreement.maturity_date,
        principal: agreement.principal_amount,
        roi: agreement.roi_percentage,
        interestType: agreement.interest_type || 'simple',
      })

      if (tdsOnlyRows.length > 0) {
        const { error: insertError } = await supabase
          .from('payout_schedule')
          .insert(tdsOnlyRows.map(r => ({ ...r, agreement_id: agreement.id })))

        if (insertError) {
          errors.push(`Agreement ${agreement.id}: ${insertError.message}`)
        } else {
          totalAdded += tdsOnlyRows.length
        }
      }
    }

    return NextResponse.json({
      success: true,
      total_agreements_processed: agreements.length,
      total_tds_rows_added: totalAdded,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
