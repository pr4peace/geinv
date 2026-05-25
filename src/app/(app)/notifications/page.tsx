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

  const payouts = (payoutsRaw ?? []).map((p) => {
    const agreement = p.agreement as unknown as AgreementInner
    return {
      id: p.id,
      investor_name: agreement.investor_name,
      reference_id: agreement.reference_id,
      due_by: p.due_by,
      gross_interest: p.gross_interest,
      tds_amount: p.tds_amount,
      net_interest: p.net_interest,
      is_overdue: p.due_by < todayStr,
    }
  })

  const tdsFilings = (tdsRaw ?? []).map((p) => {
    const agreement = p.agreement as unknown as AgreementInner
    return {
      id: p.id,
      investor_name: agreement.investor_name,
      reference_id: agreement.reference_id,
      due_by: p.due_by,
      tds_amount: p.tds_amount,
      is_overdue: p.due_by < todayStr,
    }
  })

  const maturities = (maturitiesRaw ?? []).map((m) => ({
    id: m.id,
    investor_name: m.investor_name,
    reference_id: m.reference_id,
    maturity_date: m.maturity_date,
    principal_amount: m.principal_amount,
    is_overdue: m.maturity_date < todayStr,
  }))

  const history = (historyRaw ?? []).map((r) => ({
    id: r.id,
    reminder_type: r.reminder_type,
    sent_at: r.sent_at,
    email_subject: r.email_subject || '',
    email_to: r.email_to,
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
