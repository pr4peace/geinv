import { startOfMonth, endOfMonth, format, differenceInDays } from 'date-fns'
import { createAdminClient } from '@/lib/supabase/admin'

export type PayoutReminderRow = {
  id: string
  agreement_id: string
  period_to: string
  due_by: string
  gross_interest: number
  tds_amount: number
  net_interest: number
  status: string
  investor_name: string
  reference_id: string
  payout_frequency: string
}

export type MaturingRow = {
  id: string
  investor_name: string
  reference_id: string
  principal_amount: number
  maturity_date: string
  interest_type: string
  daysRemaining: number
}

export type DocReturnRow = {
  id: string
  investor_name: string
  reference_id: string
  doc_sent_to_client_date: string
  doc_return_reminder_days: number
  daysSinceSent: number
  isOverdue: boolean
}

export type PayoutRemindersResult = {
  overdue: PayoutReminderRow[]
  thisMonth: PayoutReminderRow[]
  netTotal: number
}

export async function getPayoutReminders(): Promise<PayoutRemindersResult> {
  const supabase = createAdminClient()
  const today = new Date()
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from('payout_schedule')
    .select(`
      id, agreement_id, period_to, due_by,
      gross_interest, tds_amount, net_interest, status,
      agreements!inner(id, investor_name, reference_id, payout_frequency, status, deleted_at)
    `)
    .neq('status', 'paid')
    .eq('is_principal_repayment', false)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)   // PostgREST !inner join filter — excludes soft-deleted agreements
    .lte('period_to', monthEnd)

  if (error || !data) return { overdue: [], thisMonth: [], netTotal: 0 }

  const rows = (data as unknown as Array<{
    id: string
    agreement_id: string
    period_to: string
    due_by: string
    gross_interest: number
    tds_amount: number
    net_interest: number
    status: string
    agreements: { id: string; investor_name: string; reference_id: string; payout_frequency: string }
  }>).map(r => ({
    id: r.id,
    agreement_id: r.agreements.id,
    period_to: r.period_to,
    due_by: r.due_by,
    gross_interest: r.gross_interest,
    tds_amount: r.tds_amount,
    net_interest: r.net_interest,
    status: r.status,
    investor_name: r.agreements.investor_name,
    reference_id: r.agreements.reference_id,
    payout_frequency: r.agreements.payout_frequency,
  }))

  const overdue = rows
    .filter(r => r.period_to < monthStart)
    .sort((a, b) => a.period_to.localeCompare(b.period_to))

  const thisMonth = rows
    .filter(r => r.period_to >= monthStart && r.period_to <= monthEnd)
    .sort((a, b) => a.period_to.localeCompare(b.period_to))

  const netTotal = rows.reduce((s, r) => s + r.net_interest, 0)

  return { overdue, thisMonth, netTotal }
}

export async function getMaturingAgreements(): Promise<{ agreements: MaturingRow[]; totalPrincipal: number }> {
  const supabase = createAdminClient()
  const today = new Date()
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from('agreements')
    .select('id, investor_name, reference_id, principal_amount, maturity_date, interest_type')
    .eq('status', 'active')
    .is('deleted_at', null)
    .gte('maturity_date', monthStart)
    .lte('maturity_date', monthEnd)
    .order('maturity_date', { ascending: true })

  if (error || !data) return { agreements: [], totalPrincipal: 0 }

  const agreements: MaturingRow[] = (data as Array<{
    id: string; investor_name: string; reference_id: string;
    principal_amount: number; maturity_date: string; interest_type: string
  }>).map(a => ({
    ...a,
    daysRemaining: differenceInDays(new Date(a.maturity_date), today),
  }))

  const totalPrincipal = agreements.reduce((s, a) => s + a.principal_amount, 0)
  return { agreements, totalPrincipal }
}

export async function getDocsPendingReturn(): Promise<DocReturnRow[]> {
  const supabase = createAdminClient()
  const today = new Date()

  const { data, error } = await supabase
    .from('agreements')
    .select('id, investor_name, reference_id, doc_sent_to_client_date, doc_return_reminder_days')
    .eq('doc_status', 'sent_to_client')
    .is('doc_returned_date', null)
    .is('deleted_at', null)
    .order('doc_sent_to_client_date', { ascending: true })

  if (error || !data) return []

  return (data as Array<{
    id: string; investor_name: string; reference_id: string;
    doc_sent_to_client_date: string; doc_return_reminder_days: number
  }>).map(a => {
    const daysSinceSent = differenceInDays(today, new Date(a.doc_sent_to_client_date))
    return {
      ...a,
      daysSinceSent,
      isOverdue: daysSinceSent > a.doc_return_reminder_days,
    }
  }).sort((a, b) => b.daysSinceSent - a.daysSinceSent)
}
