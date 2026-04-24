import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { buildMonthlyPayoutSummaryEmail } from '@/lib/reminders'
import { format } from 'date-fns'

export async function handleMonthlySummary(
  supabase: ReturnType<typeof createAdminClient>,
  today: Date
): Promise<boolean> {
  if (today.getDate() !== 1) return false

  const year = today.getFullYear()
  const month = today.getMonth() // 0-based
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month + 1, 0)
  const monthStartStr = format(monthStart, 'yyyy-MM-dd')
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd')

  // Idempotency: skip if already sent this month
  const { data: existing } = await supabase
    .from('reminders')
    .select('id')
    .eq('reminder_type', 'payout_monthly_summary')
    .gte('scheduled_at', monthStart.toISOString())
    .lte('scheduled_at', monthEnd.toISOString())

  if (existing && existing.length > 0) return false

  const { data: monthPayouts } = await supabase
    .from('payout_schedule')
    .select(`
      id, due_by, gross_interest, tds_amount, net_interest,
      agreements!inner(investor_name, reference_id, status, deleted_at)
    `)
    .gte('due_by', monthStartStr)
    .lte('due_by', monthEndStr)
    .eq('is_principal_repayment', false)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)

  if (!monthPayouts || monthPayouts.length === 0) return false

  const monthLabel = today.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  const payoutList = (monthPayouts as unknown as Array<{
    id: string
    due_by: string
    gross_interest: number
    tds_amount: number
    net_interest: number
    agreements: { investor_name: string; reference_id: string }
  }>).map(p => ({
    investor_name: p.agreements.investor_name,
    reference_id: p.agreements.reference_id,
    due_by: p.due_by,
    gross_interest: p.gross_interest,
    tds_amount: p.tds_amount,
    net_interest: p.net_interest,
  }))

  // Insert audit row before sending (idempotency guard on cron retry)
  await supabase.from('reminders').insert({
    agreement_id: null,
    payout_schedule_id: null,
    reminder_type: 'payout_monthly_summary',
    lead_days: null,
    scheduled_at: today.toISOString(),
    status: 'sent',
    email_to: [],
    email_subject: `Payout Summary — ${monthLabel}`,
    email_body: null,
  })

  const { data: recipients } = await supabase
    .from('team_members')
    .select('email')
    .in('role', ['coordinator', 'financial_analyst'])
    .eq('is_active', true)

  const emailTo = (recipients ?? []).map((m: { email: string }) => m.email).filter(Boolean)

  if (emailTo.length > 0) {
    const summaryBody = buildMonthlyPayoutSummaryEmail(monthLabel, payoutList)
    await sendEmail({
      to: emailTo,
      subject: `Payout Summary — ${monthLabel}`,
      html: summaryBody,
    })
  }

  return true
}
