import { addDays, format } from 'date-fns'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Agreement, PayoutSchedule } from '@/types/database'
import type { NotificationQueue } from '@/types/database'
import {
  buildPayoutReminderBody,
  buildMaturityReminderBody,
  buildDocReturnReminderBody,
  buildTdsFilingReminderBody,
  buildMonthlyPayoutSummaryEmail,
} from '@/lib/reminders'

type QueueInsert = Omit<NotificationQueue, 'id' | 'created_at' | 'sent_at' | 'sent_by'>

// Fetch coordinator + financial_analyst emails (the "accounts" recipients)
export async function getAccountsEmails(supabase: SupabaseClient): Promise<string[]> {
  const { data } = await supabase
    .from('team_members')
    .select('email')
    .in('role', ['coordinator', 'financial_analyst'])
    .eq('is_active', true)
  return (data ?? []).map((m: { email: string }) => m.email).filter(Boolean)
}

// Build payout queue items — payouts due within 30 days, not paid
export async function buildPayoutQueueItems(
  supabase: SupabaseClient,
  todayStr: string,
  accountsEmails: string[]
): Promise<QueueInsert[]> {
  const until = format(addDays(new Date(todayStr), 30), 'yyyy-MM-dd')

  const { data } = await supabase
    .from('payout_schedule')
    .select(`
      id, due_by, gross_interest, tds_amount, net_interest, period_from, period_to,
      agreement:agreements!inner(
        id, investor_name, reference_id, principal_amount, payout_frequency, status, deleted_at, salesperson_id,
        salesperson:team_members!salesperson_id(email)
      )
    `)
    .neq('status', 'paid')
    .eq('is_tds_only', false)
    .eq('is_principal_repayment', false)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .gte('due_by', todayStr)
    .lte('due_by', until)

  if (!data) return []

  return (data as unknown as Array<{
    id: string
    due_by: string
    gross_interest: number
    tds_amount: number
    net_interest: number
    period_from: string
    period_to: string
    agreement: Agreement & { salesperson?: { email: string } | null }
  }>).map(row => {
    const salespersonEmail = row.agreement.salesperson?.email ?? null
    const daysUntil = Math.ceil((new Date(row.due_by).getTime() - new Date(todayStr).getTime()) / 86400000)
    const subject = `Payout Reminder: ${row.agreement.investor_name} — ₹${row.net_interest.toLocaleString('en-IN')} due ${row.due_by}`
    const body = buildPayoutReminderBody(row.agreement, row as unknown as PayoutSchedule, daysUntil)
    return {
      agreement_id: row.agreement.id,
      payout_schedule_id: row.id,
      notification_type: 'payout' as const,
      due_date: row.due_by,
      status: 'pending' as const,
      recipients: { accounts: accountsEmails, salesperson: salespersonEmail },
      suggested_subject: subject,
      suggested_body: body,
    }
  })
}

// Build maturity queue items — maturities within 90 days
export async function buildMaturityQueueItems(
  supabase: SupabaseClient,
  todayStr: string,
  accountsEmails: string[]
): Promise<QueueInsert[]> {
  const until = format(addDays(new Date(todayStr), 90), 'yyyy-MM-dd')

  const { data } = await supabase
    .from('agreements')
    .select('*, salesperson:team_members!salesperson_id(email)')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gte('maturity_date', todayStr)
    .lte('maturity_date', until)

  if (!data) return []

  return (data as unknown as Array<Agreement & { salesperson?: { email: string } | null }>).map(agreement => {
    const salespersonEmail = agreement.salesperson?.email ?? null
    const daysLeft = Math.ceil((new Date(agreement.maturity_date).getTime() - new Date(todayStr).getTime()) / 86400000)
    const subject = `Maturity Notice: ${agreement.investor_name} — ₹${agreement.principal_amount.toLocaleString('en-IN')} matures in ${daysLeft} days (${agreement.maturity_date})`
    const body = buildMaturityReminderBody(agreement, daysLeft)
    return {
      agreement_id: agreement.id,
      payout_schedule_id: null,
      notification_type: 'maturity' as const,
      due_date: agreement.maturity_date,
      status: 'pending' as const,
      recipients: { accounts: accountsEmails, salesperson: salespersonEmail },
      suggested_subject: subject,
      suggested_body: body,
    }
  })
}

// Build TDS filing queue items — is_tds_only rows due within 60 days OR overdue (not paid/filed)
export async function buildTdsFilingQueueItems(
  supabase: SupabaseClient,
  todayStr: string,
  accountsEmails: string[]
): Promise<QueueInsert[]> {
  const until = format(addDays(new Date(todayStr), 60), 'yyyy-MM-dd')

  // Include overdue TDS rows too — the old query only looked at future dates,
  // meaning TDS filings due in the past were silently dropped
  const { data } = await supabase
    .from('payout_schedule')
    .select(`
      id, due_by,
      agreement:agreements!inner(
        id, investor_name, reference_id, principal_amount, status, deleted_at, salesperson_id,
        salesperson:team_members!salesperson_id(email)
      )
    `)
    .eq('is_tds_only', true)
    .neq('status', 'paid')
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .lte('due_by', until)

  if (!data) return []

  return (data as unknown as Array<{
    id: string
    due_by: string
    agreement: Agreement & { salesperson?: { email: string } | null }
  }>).map(row => {
    const salespersonEmail = row.agreement.salesperson?.email ?? null
    const isOverdue = row.due_by < todayStr
    const fyYear = new Date(row.due_by).getFullYear()
    const overdueLabel = isOverdue ? ' (OVERDUE)' : ''
    const subject = `TDS Filing Due${overdueLabel}: ${row.agreement.investor_name} — 31 Mar ${fyYear}`
    const body = buildTdsFilingReminderBody(row.agreement, row.due_by)
    return {
      agreement_id: row.agreement.id,
      payout_schedule_id: row.id,
      notification_type: 'tds_filing' as const,
      due_date: row.due_by,
      status: 'pending' as const,
      recipients: { accounts: accountsEmails, salesperson: salespersonEmail },
      suggested_subject: subject,
      suggested_body: body,
    }
  })
}

// Build doc return queue items — docs sent >30 days ago not yet returned
export async function buildDocReturnQueueItems(
  supabase: SupabaseClient,
  todayStr: string,
  accountsEmails: string[]
): Promise<QueueInsert[]> {
  const thirtyDaysAgo = format(addDays(new Date(todayStr), -30), 'yyyy-MM-dd')

  const { data } = await supabase
    .from('agreements')
    .select('*, salesperson:team_members!salesperson_id(email)')
    .eq('doc_status', 'sent_to_client')
    .is('doc_returned_date', null)
    .is('deleted_at', null)
    .lte('doc_sent_to_client_date', thirtyDaysAgo)

  if (!data) return []

  return (data as unknown as Array<Agreement & { salesperson?: { email: string } | null }>).map(agreement => {
    const salespersonEmail = agreement.salesperson?.email ?? null
    const daysSinceSent = Math.ceil(
      (new Date(todayStr).getTime() - new Date(agreement.doc_sent_to_client_date!).getTime()) / 86400000
    )
    const subject = `Doc Return Overdue: ${agreement.investor_name} (${daysSinceSent} days since dispatch)`
    const body = buildDocReturnReminderBody(agreement, daysSinceSent)
    return {
      agreement_id: agreement.id,
      payout_schedule_id: null,
      notification_type: 'doc_return' as const,
      due_date: todayStr,
      status: 'pending' as const,
      recipients: { accounts: accountsEmails, salesperson: salespersonEmail },
      suggested_subject: subject,
      suggested_body: body,
    }
  })
}

// Build monthly summary queue item — only on 1st of each month
export async function buildMonthlySummaryQueueItem(
  supabase: SupabaseClient,
  todayStr: string,
  accountsEmails: string[]
): Promise<QueueInsert | null> {
  const day = new Date(todayStr).getDate()
  if (day !== 1) return null

  const monthLabel = format(new Date(todayStr), 'MMMM yyyy')

  // Fetch payouts due this month for the summary body
  const monthEnd = format(new Date(new Date(todayStr).getFullYear(), new Date(todayStr).getMonth() + 1, 0), 'yyyy-MM-dd')
  const { data } = await supabase
    .from('payout_schedule')
    .select(`
      due_by, gross_interest, tds_amount, net_interest,
      agreement:agreements!inner(investor_name, reference_id, status, deleted_at)
    `)
    .neq('status', 'paid')
    .eq('is_tds_only', false)
    .eq('is_principal_repayment', false)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .gte('due_by', todayStr)
    .lte('due_by', monthEnd)

  const payouts = (data ?? []) as unknown as Array<{
    due_by: string
    gross_interest: number
    tds_amount: number
    net_interest: number
    agreement: { investor_name: string; reference_id: string }
  }>

  const body = buildMonthlyPayoutSummaryEmail(monthLabel, payouts.map(p => ({
    investor_name: p.agreement.investor_name,
    reference_id: p.agreement.reference_id,
    due_by: p.due_by,
    gross_interest: p.gross_interest,
    tds_amount: p.tds_amount,
    net_interest: p.net_interest,
  })))

  return {
    agreement_id: null,
    payout_schedule_id: null,
    notification_type: 'monthly_summary' as const,
    due_date: todayStr,
    status: 'pending' as const,
    recipients: { accounts: accountsEmails, salesperson: null },
    suggested_subject: `Monthly Payout Summary — ${monthLabel}`,
    suggested_body: body,
  }
}

// Build quarterly forecast queue item — only on quarter start dates
export function isQuarterStart(dateStr: string): boolean {
  const d = new Date(dateStr)
  const month = d.getMonth() + 1
  const day = d.getDate()
  return day === 1 && (month === 4 || month === 7 || month === 10 || month === 1)
}
