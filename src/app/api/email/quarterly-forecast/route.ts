import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getQuarterlyForecast } from '@/lib/kpi'
import { sendQuarterlyForecast } from '@/lib/email'
import type { Agreement, PayoutSchedule } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json().catch(() => ({}))
    const { quarter } = body as { quarter?: string }

    // Get quarterly forecast data
    const forecast = await getQuarterlyForecast(quarter)

    // Fetch Valli (accountant) and Liya (coordinator or financial_analyst) emails
    const { data: recipients, error: recipientsError } = await supabase
      .from('team_members')
      .select('email, role')
      .in('role', ['accountant', 'financial_analyst', 'coordinator'])
      .eq('is_active', true)

    if (recipientsError) {
      return NextResponse.json({ error: recipientsError.message }, { status: 500 })
    }

    const recipientEmails = (recipients ?? []).map((m) => m.email)

    if (recipientEmails.length === 0) {
      return NextResponse.json({ error: 'No recipients found' }, { status: 404 })
    }

    // Fetch full agreement and payout data for email
    // Build payouts list with agreement objects
    const agreementIds = Array.from(new Set(forecast.payouts.map((p) => p.agreement_id)))

    const { data: agreements, error: agreementsError } = await supabase
      .from('agreements')
      .select('*')
      .in('id', agreementIds)

    if (agreementsError) {
      return NextResponse.json({ error: agreementsError.message }, { status: 500 })
    }

    const agreementMap = new Map((agreements ?? []).map((a) => [a.id, a as Agreement]))

    const { data: maturingAgreements } = await supabase
      .from('agreements')
      .select('*')
      .in('id', forecast.maturities.map((m) => m.agreement_id))

    // Build payout pairs for email
    const payoutPairs: Array<{ agreement: Agreement; payout: PayoutSchedule }> = []

    for (const forecastPayout of forecast.payouts) {
      const agreement = agreementMap.get(forecastPayout.agreement_id)
      if (!agreement) continue

      payoutPairs.push({
        agreement,
        payout: {
          id: '',
          agreement_id: forecastPayout.agreement_id,
          period_from: '',
          period_to: '',
          no_of_days: null,
          due_by: forecastPayout.due_by,
          gross_interest: forecastPayout.gross_interest,
          tds_amount: forecastPayout.tds_amount,
          net_interest: forecastPayout.net_interest,
          is_principal_repayment: forecastPayout.is_principal_repayment,
          status: forecastPayout.status as PayoutSchedule['status'],
          paid_date: null,
          is_tds_only: false,
          tds_filed: false,
          created_at: '',
        },
      })
    }

    const result = await sendQuarterlyForecast({
      quarter: forecast.quarter,
      payouts: payoutPairs,
      maturities: (maturingAgreements ?? []) as Agreement[],
      recipients: recipientEmails,
    })

    if (!result.success) {
      return NextResponse.json({ error: `Email failed: ${result.error}` }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
