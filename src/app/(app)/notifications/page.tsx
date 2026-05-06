import { createAdminClient } from '@/lib/supabase/admin'
import NotificationsClient from '@/components/notifications/NotificationsClient'
import { startOfMonth, endOfMonth, addDays, endOfQuarter, format, getQuarter } from 'date-fns'

export const dynamic = 'force-dynamic'

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

function resolveWindow(
  windowParam: string,
  from: string | undefined,
  to: string | undefined,
  today: Date,
): { startDate: string; endDate: string; windowLabel: string } {
  const todayStr = format(today, 'yyyy-MM-dd')
  if (windowParam === 'custom' && from && to) {
    const fmt = (s: string) => new Date(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    return { startDate: from, endDate: to, windowLabel: `${fmt(from)} → ${fmt(to)}` }
  }
  if (windowParam === '30days') {
    const end = format(addDays(today, 30), 'yyyy-MM-dd')
    return { startDate: todayStr, endDate: end, windowLabel: 'Next 30 Days' }
  }
  if (windowParam === 'quarter') {
    const end = format(endOfQuarter(today), 'yyyy-MM-dd')
    return { startDate: todayStr, endDate: end, windowLabel: `Next Quarter (Q${getQuarter(today)} ${today.getFullYear()})` }
  }
  // default: month
  const start = format(startOfMonth(today), 'yyyy-MM-dd')
  const end = format(endOfMonth(today), 'yyyy-MM-dd')
  return { startDate: start, endDate: end, windowLabel: format(today, 'MMMM yyyy') }
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; from?: string; to?: string }>
}) {
  const { window: windowParam = 'month', from, to } = await searchParams
  const supabase = createAdminClient()
  const today = new Date()
  const todayStr = format(today, 'yyyy-MM-dd')
  const { startDate, endDate, windowLabel } = resolveWindow(windowParam, from, to, today)

  // Compute actual display dates for the selector
  const displayRange = `${new Date(startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} → ${new Date(endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`

  // 1. Fetch Payouts (window + overdue)
  const { data: payouts } = await supabase
    .from('payout_schedule')
    .select(`
      due_by, gross_interest, tds_amount, net_interest, is_tds_only,
      agreement:agreements!inner(investor_name, reference_id, status, deleted_at)
    `)
    .eq('status', 'pending')
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .lte('due_by', endDate)
    .order('due_by', { ascending: true })

  // 2. Fetch Maturities
  const { data: maturities } = await supabase
    .from('agreements')
    .select('id, investor_name, reference_id, maturity_date, principal_amount')
    .eq('status', 'active')
    .is('deleted_at', null)
    .lte('maturity_date', endDate)
    .order('maturity_date', { ascending: true })

  // 3. Fetch active accountants for preview modal
  const { data: accountantsData } = await supabase
    .from('team_members')
    .select('name, email')
    .eq('role', 'accountant')
    .eq('is_active', true)
  const accountants = (accountantsData ?? []) as { name: string; email: string }[]

  const typedPayouts = (payouts || []) as unknown as PayoutWithAgreement[]

  const summaryData = {
    payouts: typedPayouts.map((p) => ({
      investor_name: p.agreement.investor_name,
      reference_id: p.agreement.reference_id,
      due_by: p.due_by,
      gross_interest: p.gross_interest,
      tds_amount: p.tds_amount,
      net_interest: p.net_interest,
      is_tds_only: p.is_tds_only,
      is_overdue: p.due_by < todayStr,
    })),
    maturities: (maturities ?? []).map((m) => ({
      investor_name: m.investor_name,
      reference_id: m.reference_id,
      maturity_date: m.maturity_date,
      principal_amount: m.principal_amount,
      is_overdue: m.maturity_date < todayStr,
    })),
  }

  return (
    <NotificationsClient
      monthLabel={windowLabel}
      data={summaryData}
      window={windowParam}
      from={from}
      to={to}
      displayRange={displayRange}
      accountants={accountants}
    />
  )
}
