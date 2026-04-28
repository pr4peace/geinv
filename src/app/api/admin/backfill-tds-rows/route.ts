import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole !== 'coordinator' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const supabase = createAdminClient()

    // 1. Fetch all cumulative/compound agreements
    const { data: agreements, error: fetchError } = await supabase
      .from('agreements')
      .select('id, investment_start_date, maturity_date, payout_frequency, interest_type')
      .is('deleted_at', null)
      .or('payout_frequency.eq.cumulative,interest_type.eq.compound')

    if (fetchError) throw fetchError

    let updated = 0
    let skipped = 0

    for (const agreement of agreements) {
      // 2. Check if any is_tds_only rows exist
      const { data: existingRows, error: checkError } = await supabase
        .from('payout_schedule')
        .select('id')
        .eq('agreement_id', agreement.id)
        .eq('is_tds_only', true)
        .limit(1)

      if (checkError) continue

      if (existingRows && existingRows.length > 0) {
        skipped++
        continue
      }

      // 3. Generate missing rows
      const startDateStr = agreement.investment_start_date
      const maturityDateStr = agreement.maturity_date

      if (!startDateStr || !maturityDateStr) {
        skipped++
        continue
      }

      const start = new Date(startDateStr)
      const maturity = new Date(maturityDateStr)
      let currentYear = start.getUTCFullYear()
      let lastDate = start
      const newRows = []

      while (true) {
        const march31 = new Date(Date.UTC(currentYear, 2, 31))
        if (march31 < start) { currentYear++; continue }
        if (march31 > maturity) break

        const periodFrom = lastDate === start
          ? start
          : new Date(lastDate.getTime() + 24 * 60 * 60 * 1000)

        newRows.push({
          agreement_id: agreement.id,
          period_from: periodFrom.toISOString().split('T')[0],
          period_to: march31.toISOString().split('T')[0],
          due_by: march31.toISOString().split('T')[0],
          gross_interest: 0,
          tds_amount: 0,
          net_interest: 0,
          is_tds_only: true,
          is_principal_repayment: false,
          no_of_days: null,
        })

        lastDate = march31
        currentYear++
      }

      if (newRows.length > 0) {
        const { error: insertError } = await supabase.from('payout_schedule').insert(newRows)
        if (insertError) {
          console.error(`Failed to insert rows for agreement ${agreement.id}:`, insertError.message)
          skipped++
        } else {
          updated++
        }
      } else {
        skipped++
      }
    }

    return NextResponse.json({ updated, skipped })
  } catch (err) {
    console.error('Backfill error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
