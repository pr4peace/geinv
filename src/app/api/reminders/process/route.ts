import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, sendQuarterlyForecast } from '@/lib/email'
import { addDays, format, subDays } from 'date-fns'
import { REMINDER_CONFIG, buildMonthlyPayoutSummaryEmail } from '@/lib/reminders'
import type { Agreement, PayoutSchedule } from '@/types/database'

// ─── Quarter helpers ────────────────────────────────────────────────────────

/** Returns the Indian FY quarter label for a given date, e.g. "Q1 FY2026-27" */
function getQuarterLabel(date: Date): string {
  const month = date.getMonth() + 1 // 1-based
  const year = date.getFullYear()

  if (month >= 4 && month <= 6) {
    // Apr–Jun → Q1
    return `Q1 FY${year}-${String(year + 1).slice(2)}`
  } else if (month >= 7 && month <= 9) {
    // Jul–Sep → Q2
    return `Q2 FY${year}-${String(year + 1).slice(2)}`
  } else if (month >= 10 && month <= 12) {
    // Oct–Dec → Q3
    return `Q3 FY${year}-${String(year + 1).slice(2)}`
  } else {
    // Jan–Mar → Q4 (FY started previous year)
    return `Q4 FY${year - 1}-${String(year).slice(2)}`
  }
}

/** Returns the start and end dates (yyyy-MM-dd) of the current Indian FY quarter */
function getCurrentQuarterRange(date: Date): { start: string; end: string } {
  const month = date.getMonth() + 1
  const year = date.getFullYear()

  if (month >= 4 && month <= 6) {
    return { start: `${year}-04-01`, end: `${year}-06-30` }
  } else if (month >= 7 && month <= 9) {
    return { start: `${year}-07-01`, end: `${year}-09-30` }
  } else if (month >= 10 && month <= 12) {
    return { start: `${year}-10-01`, end: `${year}-12-31` }
  } else {
    const fyStart = month <= 3 ? year - 1 : year
    return { start: `${fyStart + 1}-01-01`, end: `${fyStart + 1}-03-31` }
  }
}

/** True if date is the first day of an Indian FY quarter */
function isQuarterStart(date: Date): boolean {
  const month = date.getMonth() + 1
  const day = date.getDate()
  return day === 1 && (month === 4 || month === 7 || month === 10 || month === 1)
}

// ─── Core processing logic ──────────────────────────────────────────────────

async function processReminders(): Promise<{
  processed: number
  failed: number
  escalations: number
  overdueMarked: number
  quarterlyForecastSent: boolean
  monthly_summary_sent: boolean
}> {
  const supabase = createAdminClient()
  const now = new Date()
  const nowIso = now.toISOString()
  const todayStr = format(now, 'yyyy-MM-dd')

  let processed = 0
  let failed = 0
  let escalations = 0
  let overdueMarked = 0
  let quarterlyForecastSent = false

  // ── 1. Send pending reminders ──────────────────────────────────────────────

  const { data: reminders, error: remindersError } = await supabase
    .from('reminders')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', nowIso)

  if (remindersError) {
    throw new Error(`Failed to fetch reminders: ${remindersError.message}`)
  }

  for (const reminder of reminders ?? []) {
    try {
      const result = await sendEmail({
        to: reminder.email_to,
        subject: reminder.email_subject ?? '(No subject)',
        html: reminder.email_body ?? '',
      })

      const newStatus = result.success ? 'sent' : 'failed'

      await supabase
        .from('reminders')
        .update({ status: newStatus, sent_at: nowIso })
        .eq('id', reminder.id)

      if (result.success) {
        processed++

        // For doc_return reminders: if agreement doc not yet returned, schedule next repeat
        if (reminder.reminder_type === 'doc_return') {
          const { data: agreement } = await supabase
            .from('agreements')
            .select('doc_status')
            .eq('id', reminder.agreement_id)
            .single()

          if (
            agreement &&
            agreement.doc_status !== 'returned' &&
            agreement.doc_status !== 'uploaded'
          ) {
            const nextScheduledAt = addDays(
              new Date(reminder.scheduled_at),
              REMINDER_CONFIG.doc_return_repeat
            )

            await supabase.from('reminders').insert({
              agreement_id: reminder.agreement_id,
              payout_schedule_id: null,
              reminder_type: 'doc_return',
              lead_days: null,
              scheduled_at: nextScheduledAt.toISOString(),
              status: 'pending',
              email_to: reminder.email_to,
              email_subject: reminder.email_subject,
              email_body: reminder.email_body,
            })
          }
        }
      } else {
        failed++
      }
    } catch (err) {
      console.error(`Failed to process reminder ${reminder.id}:`, err)
      failed++
    }
  }

  // ── 2. Escalation: overdue payouts that were notified but never paid ────────

  const internalEmail = process.env.INTERNAL_USER_EMAIL
  if (internalEmail) {
    const { data: overduePending } = await supabase
      .from('payout_schedule')
      .select('*, agreement:agreements(*)')
      .eq('status', 'notified')
      .lt('due_by', todayStr)

    for (const payout of overduePending ?? []) {
      try {
      const agreement = payout.agreement as Agreement | null
      if (!agreement) continue

      // Check if an escalation reminder already exists for today (±1 day window)
      const windowStart = subDays(now, 1).toISOString()
      const windowEnd = addDays(now, 1).toISOString()

      const { data: existing } = await supabase
        .from('reminders')
        .select('id')
        .eq('payout_schedule_id', payout.id)
        .eq('reminder_type', 'payout')
        .is('lead_days', null)
        .gte('scheduled_at', windowStart)
        .lte('scheduled_at', windowEnd)
        .limit(1)

      if (existing && existing.length > 0) continue // already escalated today

      // Build escalation email
      const subject = `OVERDUE: ${agreement.investor_name} payout was due on ${payout.due_by}`
      const html = `
        <h2>⚠️ Overdue Payout Alert</h2>
        <p>The following payout was marked as <strong>notified</strong> but has not been recorded as paid.</p>
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
          <tr><td><strong>Investor</strong></td><td>${agreement.investor_name}</td></tr>
          <tr><td><strong>Agreement Ref</strong></td><td>${agreement.reference_id}</td></tr>
          <tr><td><strong>Due By</strong></td><td>${payout.due_by}</td></tr>
          <tr><td><strong>Net Payable</strong></td><td>₹${payout.net_interest.toLocaleString('en-IN')}</td></tr>
        </table>
        <p>Please follow up immediately and mark the payout as paid once confirmed.</p>
        <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/agreements/${agreement.id}">View Agreement →</a></p>
      `.trim()

      // Insert escalation reminder row
      const { data: newReminder } = await supabase
        .from('reminders')
        .insert({
          agreement_id: agreement.id,
          payout_schedule_id: payout.id,
          reminder_type: 'payout',
          lead_days: null,
          scheduled_at: nowIso,
          status: 'pending',
          email_to: [internalEmail],
          email_subject: subject,
          email_body: html,
        })
        .select('id')
        .single()

      // Send immediately
      const result = await sendEmail({
        to: [internalEmail],
        subject,
        html,
      })

      const newStatus = result.success ? 'sent' : 'failed'
      if (newReminder) {
        await supabase
          .from('reminders')
          .update({ status: newStatus, sent_at: nowIso })
          .eq('id', newReminder.id)
      }

      if (result.success) escalations++
      } catch (err) {
        console.error(`Failed to process escalation for payout ${payout.id}:`, err)
      }
    }
  }

  // ── 3. Quarter-start trigger ───────────────────────────────────────────────

  if (isQuarterStart(now)) {
    const quarter = getQuarterLabel(now)
    const { start, end } = getCurrentQuarterRange(now)

    // Fetch payout_schedule rows due this quarter (with agreement data)
    const { data: quarterPayouts } = await supabase
      .from('payout_schedule')
      .select('*, agreement:agreements(*)')
      .gte('due_by', start)
      .lte('due_by', end)
      .eq('is_principal_repayment', false)

    // Fetch agreements maturing this quarter
    const { data: quarterMaturities } = await supabase
      .from('agreements')
      .select('*')
      .gte('maturity_date', start)
      .lte('maturity_date', end)
      .eq('status', 'active')

    const payouts: Array<{ agreement: Agreement; payout: PayoutSchedule }> = (
      quarterPayouts ?? []
    )
      .filter((p) => p.agreement)
      .map((p) => ({ agreement: p.agreement as Agreement, payout: p as PayoutSchedule }))

    const maturities = (quarterMaturities ?? []) as Agreement[]

    // Collect Valli + Liya emails from team_members (coordinator role)
    const { data: coordinators } = await supabase
      .from('team_members')
      .select('email')
      .in('role', ['coordinator', 'financial_analyst'])
      .eq('is_active', true)

    const recipients = (coordinators ?? []).map((c: { email: string }) => c.email).filter(Boolean)

    if (recipients.length > 0) {
      const result = await sendQuarterlyForecast({
        quarter,
        payouts,
        maturities,
        recipients,
      })
      quarterlyForecastSent = result.success
    }
  }

  // ── 4. Mark pending payouts as overdue where due_by < today ───────────────

  const { data: overdueResult } = await supabase
    .from('payout_schedule')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .lt('due_by', todayStr)
    .select('id')

  overdueMarked = overdueResult?.length ?? 0

  // ── Monthly payout summary (1st of each month) ──────────────────────────────
  let monthlySummarySent = false
  const todayDate = new Date()
  if (todayDate.getDate() === 1) {
    const monthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
    const monthEnd = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 0)

    const { data: monthPayouts } = await supabase
      .from('payout_schedule')
      .select(`
        id, due_by, gross_interest, tds_amount, net_interest,
        agreement:agreements!inner(investor_name, reference_id, status, deleted_at)
      `)
      .gte('due_by', format(monthStart, 'yyyy-MM-dd'))
      .lte('due_by', format(monthEnd, 'yyyy-MM-dd'))
      .eq('is_principal_repayment', false)
      .eq('agreement.status', 'active')
      .is('agreement.deleted_at', null)

    if (monthPayouts && monthPayouts.length > 0) {
      const monthLabel = todayDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

      const payoutList = (monthPayouts as unknown as Array<{
        id: string
        due_by: string
        gross_interest: number
        tds_amount: number
        net_interest: number
        agreement: { investor_name: string; reference_id: string }
      }>).map(p => ({
        investor_name: p.agreement.investor_name,
        reference_id: p.agreement.reference_id,
        due_by: p.due_by,
        gross_interest: p.gross_interest,
        tds_amount: p.tds_amount,
        net_interest: p.net_interest,
      }))

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
        monthlySummarySent = true
      }
    }
  }

  return { processed, failed, escalations, overdueMarked, quarterlyForecastSent, monthly_summary_sent: monthlySummarySent }
}

// ─── Route handlers ──────────────────────────────────────────────────────────

/** GET — called by Vercel Cron (sends `x-vercel-cron: 1` header) */
export async function GET(request: NextRequest) {
  const cronHeader = request.headers.get('x-vercel-cron')
  if (cronHeader !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processReminders()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

/** POST — called manually with Authorization: Bearer {CRON_SECRET} */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await processReminders()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
