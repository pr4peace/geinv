import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import NotificationsClient from '@/components/notifications/NotificationsClient'
import type { NotificationQueue } from '@/types/database'

export const dynamic = 'force-dynamic'

type EnrichedItem = NotificationQueue & {
  agreement?: {
    id: string
    investor_name: string
    reference_id: string
    salesperson?: { id?: string; name: string } | null
  } | null
  sent_by_member?: { name: string } | null
}

type NotificationStats = {
  payouts: number
  maturities: number
  tdsFilings: number
  docsOverdue: number
  payoutAmounts: { gross: number; tds: number; net: number }
  maturityAmounts: { gross: number; tds: number; net: number }
  tdsAmounts: { gross: number; tds: number; net: number }
}

async function fetchItems(status: string, salespersonId?: string): Promise<EnrichedItem[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('notification_queue')
    .select(`
      *,
      agreement:agreements(id, investor_name, reference_id, salesperson:team_members!salesperson_id(id, name)),
      sent_by_member:team_members!sent_by(name)
    `)
    .eq('status', status)
    .order('due_date', { ascending: true })
    .limit(200)

  if (salespersonId) {
    const { data: spAgreements } = await supabase
      .from('agreements')
      .select('id')
      .eq('salesperson_id', salespersonId)
      .is('deleted_at', null)
    const ids = (spAgreements ?? []).map((a: { id: string }) => a.id)
    if (ids.length === 0) return []
    query = query.in('agreement_id', ids)
  }

  const { data } = await query
  return (data ?? []) as EnrichedItem[]
}

async function fetchStats(): Promise<NotificationStats> {
  const supabase = createAdminClient()
  const todayStr = new Date().toISOString().split('T')[0]
  const plus30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  const plus90 = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0]
  const plus60 = new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]
  const minus30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]

  const [payoutsRes, maturitiesRes, tdsRes, docsRes, payoutsAmounts, tdsAmounts] = await Promise.all([
    supabase
      .from('payout_schedule')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'paid')
      .eq('is_tds_only', false)
      .eq('is_principal_repayment', false)
      .gte('due_by', todayStr)
      .lte('due_by', plus30),
    supabase
      .from('agreements')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .is('deleted_at', null)
      .gte('maturity_date', todayStr)
      .lte('maturity_date', plus90),
    supabase
      .from('payout_schedule')
      .select('id', { count: 'exact', head: true })
      .eq('is_tds_only', true)
      .neq('status', 'paid')
      .gte('due_by', todayStr)
      .lte('due_by', plus60),
    supabase
      .from('agreements')
      .select('id', { count: 'exact', head: true })
      .eq('doc_status', 'sent_to_client')
      .is('doc_returned_date', null)
      .is('deleted_at', null)
      .lte('doc_sent_to_client_date', minus30),
    // Fetch payout amounts for the KPI
    supabase
      .from('payout_schedule')
      .select('gross_interest, tds_amount, net_interest')
      .neq('status', 'paid')
      .eq('is_tds_only', false)
      .eq('is_principal_repayment', false)
      .gte('due_by', todayStr)
      .lte('due_by', plus30),
    // Fetch TDS amounts for the KPI
    supabase
      .from('payout_schedule')
      .select('gross_interest, tds_amount, net_interest')
      .eq('is_tds_only', true)
      .neq('status', 'paid')
      .gte('due_by', todayStr)
      .lte('due_by', plus60),
  ])

  const calcAmounts = (rows: Array<{ gross_interest: number | null; tds_amount: number | null; net_interest: number | null } | null>) => {
    let gross = 0, tds = 0, net = 0
    for (const row of rows ?? []) {
      if (!row) continue
      gross += row.gross_interest ?? 0
      tds += row.tds_amount ?? 0
      net += row.net_interest ?? 0
    }
    return { gross, tds, net }
  }

  return {
    payouts: payoutsRes.count ?? 0,
    maturities: maturitiesRes.count ?? 0,
    tdsFilings: tdsRes.count ?? 0,
    docsOverdue: docsRes.count ?? 0,
    payoutAmounts: calcAmounts(payoutsAmounts.data ?? []),
    maturityAmounts: { gross: 0, tds: 0, net: 0 },
    tdsAmounts: calcAmounts(tdsAmounts.data ?? []),
  }
}

export default async function NotificationsPage() {
  const headersList = await headers()
  const userRole = headersList.get('x-user-role') ?? ''
  const userTeamId = headersList.get('x-user-team-id') ?? ''
  const salespersonId = userRole === 'salesperson' ? userTeamId : undefined

  const supabase = createAdminClient()

  const [pending, sent, stats, salespersonsRes] = await Promise.all([
    fetchItems('pending', salespersonId).catch(() => [] as EnrichedItem[]),
    fetchItems('sent', salespersonId).catch(() => [] as EnrichedItem[]),
    fetchStats().catch(() => ({
      payouts: 0, maturities: 0, tdsFilings: 0, docsOverdue: 0,
      payoutAmounts: { gross: 0, tds: 0, net: 0 },
      maturityAmounts: { gross: 0, tds: 0, net: 0 },
      tdsAmounts: { gross: 0, tds: 0, net: 0 },
    })),
    supabase
      .from('team_members')
      .select('id, name')
      .eq('role', 'salesperson')
      .eq('is_active', true)
      .order('name'),
  ])

  const salespersons = (salespersonsRes.data ?? []).map((m: { id: string; name: string }) => ({
    id: m.id,
    name: m.name,
  }))

  return (
    <NotificationsClient
      pending={pending}
      history={sent}
      userRole={userRole}
      stats={stats}
      salespersons={salespersons}
    />
  )
}
