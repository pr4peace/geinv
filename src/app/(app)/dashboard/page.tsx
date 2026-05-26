import { createAdminClient } from '@/lib/supabase/admin'
import { format, addDays, differenceInDays } from 'date-fns'
import DashboardClient from '@/components/dashboard/DashboardClient'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createAdminClient()
  const todayDate = new Date()
  const todayStr = format(todayDate, 'yyyy-MM-dd')
  const weekStr = format(addDays(todayDate, 7), 'yyyy-MM-dd')
  const monthStr = format(addDays(todayDate, 30), 'yyyy-MM-dd')
  const d90Str = format(addDays(todayDate, 90), 'yyyy-MM-dd')

  // 1. Overdue payouts
  const { data: overdue } = await supabase
    .from('payout_schedule')
    .select('*, agreement:agreements!inner(investor_name, reference_id, id, payout_frequency, status, deleted_at)')
    .in('status', ['pending', 'notified'])
    .eq('is_tds_only', false)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .lt('due_by', todayStr)
    .order('due_by', { ascending: true })

  // 2. This-week payouts
  const { data: thisWeek } = await supabase
    .from('payout_schedule')
    .select('*, agreement:agreements!inner(investor_name, reference_id, id, payout_frequency, status, deleted_at)')
    .in('status', ['pending', 'notified'])
    .eq('is_tds_only', false)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .gte('due_by', todayStr)
    .lte('due_by', weekStr)
    .order('due_by', { ascending: true })

  // 3. Later-this-month payouts
  const { data: laterThisMonth } = await supabase
    .from('payout_schedule')
    .select('*, agreement:agreements!inner(investor_name, reference_id, id, payout_frequency, status, deleted_at)')
    .in('status', ['pending', 'notified'])
    .eq('is_tds_only', false)
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .gt('due_by', weekStr)
    .lte('due_by', monthStr)
    .order('due_by', { ascending: true })

  // 4. Maturing soon (90 days)
  const { data: maturingSoonRaw } = await supabase
    .from('agreements')
    .select('id, investor_name, reference_id, maturity_date, principal_amount')
    .eq('status', 'active')
    .lte('maturity_date', d90Str)
    .is('deleted_at', null)
    .order('maturity_date', { ascending: true })

  const maturingSoon = (maturingSoonRaw ?? []).map(m => ({
    ...m,
    daysLeft: differenceInDays(new Date(m.maturity_date), todayDate)
  }))

  // 5. Docs pending
  const { data: docsPendingRaw } = await supabase
    .from('agreements')
    .select('id, investor_name, reference_id, doc_status, doc_sent_to_client_date, doc_return_reminder_days')
    .eq('status', 'active')
    .eq('doc_status', 'sent_to_client')
    .is('deleted_at', null)
    .order('doc_sent_to_client_date', { ascending: true })

  const docsPending = (docsPendingRaw ?? []).map(d => ({
    ...d,
    daysSince: d.doc_sent_to_client_date 
      ? differenceInDays(todayDate, new Date(d.doc_sent_to_client_date))
      : 0
  }))

  // 6. Today's activity
  const { data: activity } = await supabase
    .from('reminders')
    .select('sent_at, email_subject, reminder_type')
    .gte('sent_at', todayStr)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(5)

  return (
    <DashboardClient 
      overdue={overdue ?? []}
      thisWeek={thisWeek ?? []}
      laterThisMonth={laterThisMonth ?? []}
      maturingSoon={maturingSoon}
      docsPending={docsPending}
      activity={activity ?? []}
    />
  )
}
