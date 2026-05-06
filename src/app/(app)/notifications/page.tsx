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

function getEndDate(window: string, today: Date): string {
  if (window === '30days') return format(addDays(today, 30), 'yyyy-MM-dd')
  if (window === 'quarter') return format(endOfQuarter(today), 'yyyy-MM-dd')
  return format(endOfMonth(today), 'yyyy-MM-dd')
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  const { window: windowParam = 'month' } = await searchParams
  const supabase = createAdminClient()
  const today = new Date()
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd')
  const monthEnd = getEndDate(windowParam, today)
  const monthLabel = windowParam === '30days'
    ? 'Next 30 Days'
    : windowParam === 'quarter'
      ? `Next Quarter (Q${getQuarter(today)} ${today.getFullYear()})`
      : format(today, 'MMMM yyyy')

  // 1. Fetch Payouts (Current Month + Overdue)
  const { data: payouts } = await supabase
    .from('payout_schedule')
    .select(`
      due_by, gross_interest, tds_amount, net_interest, is_tds_only,
      agreement:agreements!inner(investor_name, reference_id, status, deleted_at)
    `)
    .eq('status', 'pending')
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .lte('due_by', monthEnd)
    .order('due_by', { ascending: true })

  // 2. Fetch Maturities
  const { data: maturities } = await supabase
    .from('agreements')
    .select('id, investor_name, reference_id, maturity_date, principal_amount')
    .eq('status', 'active')
    .is('deleted_at', null)
    .lte('maturity_date', monthEnd)
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
      is_overdue: p.due_by < monthStart,
    })),
    maturities: (maturities ?? []).map((m) => ({
      investor_name: m.investor_name,
      reference_id: m.reference_id,
      maturity_date: m.maturity_date,
      principal_amount: m.principal_amount,
      is_overdue: m.maturity_date < monthStart,
    })),
  }

  return (
    <NotificationsClient
      monthLabel={monthLabel}
      data={summaryData}
      window={windowParam}
      accountants={accountants}
    />
  )
}
