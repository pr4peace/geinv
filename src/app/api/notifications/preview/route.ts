import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildBatchedEmails } from '@/lib/batch-notifications'

export async function POST(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role') ?? ''
    if (userRole === 'salesperson') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const ids: string[] = body.ids ?? []
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }

    const grouping: 'single' | 'per-person' = body.grouping ?? 'single'

    const supabase = createAdminClient()

    // Fetch notification items with agreement + salesperson data
    const { data: items } = await supabase
      .from('notification_queue')
      .select(`
        *,
        agreement:agreements(
          id,
          investor_name,
          reference_id,
          salesperson:team_members!salesperson_id(id, name, email)
        )
      `)
      .in('id', ids)

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items found' }, { status: 404 })
    }

    // Fetch team members for dynamic recipient list
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('id, name, email, role')
      .in('role', ['accountant', 'financial_analyst', 'coordinator', 'salesperson'])
      .eq('is_active', true)
      .order('name')

    const batches = buildBatchedEmails(items ?? [], teamMembers ?? [], grouping)

    // Compute amounts summary
    const totals = { gross: 0, tds: 0, net: 0 }
    const byPerson: Record<string, { gross: number; tds: number; net: number }> = {}
    for (const item of items ?? []) {
      if (item.notification_type === 'payout' || item.notification_type === 'tds_filing') {
        const g = item.gross_interest ?? 0
        const t = item.tds_amount ?? 0
        const n = item.net_interest ?? 0
        totals.gross += g
        totals.tds += t
        totals.net += n

        const key = ((item as Record<string, unknown>).agreement as { salesperson?: { name?: string } } | null)?.salesperson?.name ?? 'Unassigned'
        if (!byPerson[key]) byPerson[key] = { gross: 0, tds: 0, net: 0 }
        byPerson[key].gross += g
        byPerson[key].tds += t
        byPerson[key].net += n
      }
    }

    return NextResponse.json({ batches, totals, byPerson, itemCount: items?.length ?? 0 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
