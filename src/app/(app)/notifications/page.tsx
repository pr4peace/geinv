import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import NotificationsClient from '@/components/notifications/NotificationsClient'
import type { NotificationQueue } from '@/types/database'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Notifications — Good Earth Investment Tracker' }

type EnrichedItem = NotificationQueue & {
  agreement?: { id: string; investor_name: string; reference_id: string } | null
  sent_by_member?: { name: string } | null
}

async function fetchItems(status: string, salespersonId?: string): Promise<EnrichedItem[]> {
  const supabase = createAdminClient()

  let query = supabase
    .from('notification_queue')
    .select(`
      *,
      agreement:agreements(id, investor_name, reference_id),
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

export default async function NotificationsPage() {
  const headersList = await headers()
  const userRole = headersList.get('x-user-role') ?? ''
  const userTeamId = headersList.get('x-user-team-id') ?? ''
  const salespersonId = userRole === 'salesperson' ? userTeamId : undefined

  const [pending, sent] = await Promise.all([
    fetchItems('pending', salespersonId).catch(() => [] as EnrichedItem[]),
    fetchItems('sent', salespersonId).catch(() => [] as EnrichedItem[]),
  ])

  const todayStr = new Date().toISOString().split('T')[0]
  const sevenDaysOut = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]

  const redFlags = pending.filter(item => {
    if (!item.due_date) return false
    const type = item.notification_type
    if (type === 'payout') return item.due_date < todayStr
    if (type === 'maturity') return item.due_date <= sevenDaysOut
    if (type === 'tds_filing') return item.due_date <= sevenDaysOut
    if (type === 'doc_return') return true
    return false
  })

  return (
    <NotificationsClient
      pending={pending}
      redFlags={redFlags}
      history={sent}
      userRole={userRole}
    />
  )
}
