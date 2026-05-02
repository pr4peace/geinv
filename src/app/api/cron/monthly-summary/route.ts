import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startOfMonth, endOfMonth, format } from 'date-fns'
import { buildMonthlySummaryEmail, type MonthlySummaryData } from '@/lib/reminders'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

interface PayoutWithAgreement {
  due_by: string
  gross_interest: number
  tds_amount: number
  net_interest: number
  is_tds_only: boolean
  agreement: {
    investor_name: string
    reference_id: string
  }
}

export async function GET(request: NextRequest) {
  try {
    // Basic auth check for Vercel Cron
    const authHeader = request.headers.get('authorization')
    if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      // Allow if x-vercel-cron header is present (Vercel sets this)
      if (request.headers.get('x-vercel-cron') !== '1') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const supabase = createAdminClient()
    const today = new Date()
    const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
    const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd')
    const monthLabel = format(today, 'MMMM yyyy')

    // 1. Fetch Payouts (Current Month + Overdue)
    const { data: payoutsData, error: payoutsErr } = await supabase
      .from('payout_schedule')
      .select(`
        due_by, gross_interest, tds_amount, net_interest, is_tds_only,
        agreement:agreements!inner(investor_name, reference_id, status, deleted_at)
      `)
      .eq('status', 'pending')
      .eq('agreements.status', 'active')
      .is('agreements.deleted_at', null)
      .lte('due_by', monthEnd) // Everything up to end of this month

    if (payoutsErr) throw payoutsErr

    // 2. Fetch Maturities (Current Month + Overdue)
    const { data: maturitiesData, error: maturitiesErr } = await supabase
      .from('agreements')
      .select('investor_name, reference_id, maturity_date, principal_amount')
      .eq('status', 'active')
      .is('deleted_at', null)
      .lte('maturity_date', monthEnd) // Everything up to end of this month

    if (maturitiesErr) throw maturitiesErr

    const typedPayouts = (payoutsData || []) as unknown as PayoutWithAgreement[]

    // 3. Format data & flag overdues
    const summaryData: MonthlySummaryData = {
      payouts: typedPayouts.map((p) => ({
        investor_name: p.agreement.investor_name,
        reference_id: p.agreement.reference_id,
        due_by: p.due_by,
        gross_interest: p.gross_interest,
        tds_amount: p.tds_amount,
        net_interest: p.net_interest,
        is_tds_only: p.is_tds_only,
        is_overdue: p.due_by < monthStart,
      })),
      maturities: (maturitiesData ?? []).map((m) => ({
        investor_name: m.investor_name,
        reference_id: m.reference_id,
        maturity_date: m.maturity_date,
        principal_amount: m.principal_amount,
        is_overdue: m.maturity_date < monthStart,
      })),
    }

    if (summaryData.payouts.length === 0 && summaryData.maturities.length === 0) {
      return NextResponse.json({ message: 'No events this month. No email sent.' })
    }

    // 4. Set recipient (Valli)
    const recipients = ['valli.sivakumar@goodearth.org.in']

    // 5. Build and Send
    const html = buildMonthlySummaryEmail(monthLabel, summaryData)
    const result = await sendEmail({
      to: recipients,
      subject: `Investment Payout Summary — ${monthLabel}`,
      html,
    })

    return NextResponse.json({
      message: 'Monthly summary sent',
      payouts: summaryData.payouts.length,
      maturities: summaryData.maturities.length,
      email_id: result.id,
    })
  } catch (err) {
    console.error('Monthly summary cron error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
