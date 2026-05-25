import { createAdminClient } from '@/lib/supabase/admin'
import NotificationsClient from '@/components/notifications/NotificationsClient'
import { addDays, format } from 'date-fns'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const supabase = createAdminClient()
  const today = new Date()
  const window60 = format(addDays(today, 60), 'yyyy-MM-dd')

  // 1. Pending interest payouts (not TDS-only) — overdue + next 60 days
  const { data: payoutsRaw } = await supabase
    .from('payout_schedule')
    .select('id, due_by, gross_interest, tds_amount, net_interest, agreement:agreements!inner(investor_name, reference_id, status, deleted_at)')
    .eq('status', 'pending')
    .eq('is_tds_only', false)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .lte('due_by', window60)
    .order('due_by', { ascending: true })

  // 2. Pending TDS-only rows — overdue + next 60 days
  const { data: tdsRaw } = await supabase
    .from('payout_schedule')
    .select('id, due_by, tds_amount, agreement:agreements!inner(investor_name, reference_id, status, deleted_at)')
    .eq('status', 'pending')
    .eq('is_tds_only', true)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .lte('due_by', window60)
    .order('due_by', { ascending: true })

  // 3. Active agreements maturing — overdue + next 60 days
  const { data: maturitiesRaw } = await supabase
    .from('agreements')
    .select('id, investor_name, reference_id, maturity_date, principal_amount')
    .eq('status', 'active')
    .is('deleted_at', null)
    .lte('maturity_date', window60)
    .order('maturity_date', { ascending: true })

  // 4. Sent history — last 30 days
  const thirtyDaysAgo = format(addDays(today, -30), 'yyyy-MM-dd')
  const { data: historyRaw } = await supabase
    .from('reminders')
    .select('id, reminder_type, sent_at, email_subject, email_to')
    .eq('status', 'sent')
    .eq('reminder_type', 'batch_notification')
    .gte('sent_at', thirtyDaysAgo)
    .order('sent_at', { ascending: false })

  const todayStr = format(today, 'yyyy-MM-dd')

  type AgreementInner = { investor_name: string; reference_id: string }

  const payouts = (payoutsRaw ?? []).map((p: any) => ({
    id: p.id as string,
    investor_name: (p.agreement as AgreementInner).investor_name,
    reference_id: (p.agreement as AgreementInner).reference_id,
    due_by: p.due_by as string,
    gross_interest: p.gross_interest as number,
    tds_amount: p.tds_amount as number,
    net_interest: p.net_interest as number,
    is_overdue: (p.due_by as string) < todayStr,
  }))

  const tdsFilings = (tdsRaw ?? []).map((p: any) => ({
    id: p.id as string,
    investor_name: (p.agreement as AgreementInner).investor_name,
    reference_id: (p.agreement as AgreementInner).reference_id,
    due_by: p.due_by as string,
    tds_amount: p.tds_amount as number,
    is_overdue: (p.due_by as string) < todayStr,
  }))

  const maturities = (maturitiesRaw ?? []).map((m: any) => ({
    id: m.id as string,
    investor_name: m.investor_name as string,
    reference_id: m.reference_id as string,
    maturity_date: m.maturity_date as string,
    principal_amount: m.principal_amount as number,
    is_overdue: (m.maturity_date as string) < todayStr,
  }))

  const history = (historyRaw ?? []).map((r: any) => ({
    id: r.id as string,
    reminder_type: r.reminder_type as string,
    sent_at: r.sent_at as string,
    email_subject: r.email_subject as string,
    email_to: r.email_to as string[],
  }))

  return (
    <NotificationsClient
      payouts={payouts}
      tdsFilings={tdsFilings}
      maturities={maturities}
      history={history}
    />
  )
}
