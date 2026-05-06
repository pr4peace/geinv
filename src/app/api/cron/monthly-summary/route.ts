import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { startOfMonth, endOfMonth, addDays, endOfQuarter, format, getQuarter } from 'date-fns'
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

function computeWindow(window: string, today: Date): { endDate: string; windowLabel: string; monthLabel: string } {
  const monthLabel = format(today, 'MMMM yyyy')
  if (window === '30days') {
    return {
      endDate: format(addDays(today, 30), 'yyyy-MM-dd'),
      windowLabel: 'Next 30 Days',
      monthLabel,
    }
  }
  if (window === 'quarter') {
    const q = getQuarter(today)
    const year = today.getFullYear()
    return {
      endDate: format(endOfQuarter(today), 'yyyy-MM-dd'),
      windowLabel: `Next Quarter (Q${q} ${year})`,
      monthLabel,
    }
  }
  // default: month
  return {
    endDate: format(endOfMonth(today), 'yyyy-MM-dd'),
    windowLabel: `This Month (${monthLabel})`,
    monthLabel,
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
    const { searchParams } = new URL(request.url)
    const windowParam = searchParams.get('window') ?? 'month'
    const { endDate: monthEnd, windowLabel, monthLabel } = computeWindow(windowParam, today)
    const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')

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
      return NextResponse.json({ message: 'No events in selected window. No email sent.' })
    }

    // 4. Fetch active accountants as recipients
    const { data: accountantsData } = await supabase
      .from('team_members')
      .select('email')
      .eq('role', 'accountant')
      .eq('is_active', true)
    const recipients = (accountantsData ?? []).map((a: { email: string }) => a.email).filter(Boolean)
    if (recipients.length === 0) {
      return NextResponse.json({ error: 'No active accountants found in team members' }, { status: 400 })
    }

    // 5. Build and Send
    const html = buildMonthlySummaryEmail(monthLabel, summaryData, windowLabel)
    const result = await sendEmail({
      to: recipients,
      subject: `Investment Report — ${windowLabel}`,
      html,
    })

    return NextResponse.json({
      message: 'Report sent',
      window: windowParam,
      payouts: summaryData.payouts.length,
      maturities: summaryData.maturities.length,
      recipients,
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
