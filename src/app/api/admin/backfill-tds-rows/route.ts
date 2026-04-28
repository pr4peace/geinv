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
      .select('id, investment_start_date, maturity_date, payout_frequency, interest_type, principal_amount, roi_percentage')
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
      const principal = Number(agreement.principal_amount) || 0
      const roi = Number(agreement.roi_percentage) || 0

      let currentYear = start.getUTCFullYear()
      let lastDate = start
      let totalAccruedSoFar = 0
      const newRows = []

      while (true) {
        const march31 = new Date(Date.UTC(currentYear, 2, 31))
        if (march31 < start) { currentYear++; continue }
        if (march31 > maturity) break

        const periodFrom = lastDate === start
          ? start
          : new Date(lastDate.getTime() + 24 * 60 * 60 * 1000)

        // Calculate accrued interest for this FY period using compound interest formula
        const daysSinceStart = Math.floor((march31.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
        const totalAccruedUntilNow = principal * (Math.pow(1 + roi / 100, daysSinceStart / 365) - 1)
        
        const periodInterest = Number((totalAccruedUntilNow - totalAccruedSoFar).toFixed(2))
        const tdsAmount = Number((periodInterest * 0.10).toFixed(2))
        const netInterest = Number((periodInterest - tdsAmount).toFixed(2))

        newRows.push({
          agreement_id: agreement.id,
          period_from: periodFrom.toISOString().split('T')[0],
          period_to: march31.toISOString().split('T')[0],
          due_by: march31.toISOString().split('T')[0],
          gross_interest: periodInterest,
          tds_amount: tdsAmount,
          net_interest: netInterest,
          is_tds_only: true,
          is_principal_repayment: false,
          no_of_days: Math.floor((march31.getTime() - periodFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1,
        })

        totalAccruedSoFar += periodInterest
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
