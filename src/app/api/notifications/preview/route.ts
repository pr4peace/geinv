import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAccountsEmails } from '@/lib/notification-queue'
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

    const mode: 'batched' | 'per-salesperson' = body.mode ?? 'batched'

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
          salesperson:team_members!salesperson_id(name, email)
        )
      `)
      .in('id', ids)

    if (!items || items.length === 0) {
      return NextResponse.json({ error: 'No items found' }, { status: 404 })
    }

    const accountsEmails = await getAccountsEmails(supabase)
    const batches = buildBatchedEmails(items, accountsEmails, mode)

    return NextResponse.json({ batches })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
