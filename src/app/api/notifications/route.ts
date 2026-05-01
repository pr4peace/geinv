import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role') ?? ''
    const userTeamId = request.headers.get('x-user-team-id') ?? ''
    const supabase = createAdminClient()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? 'pending'
    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 200)

    let query = supabase
      .from('notification_queue')
      .select(`
        *,
        agreement:agreements(id, investor_name, reference_id, salesperson_id),
        payout:payout_schedule!payout_schedule_id(status),
        sent_by_member:team_members!sent_by(name)
      `)
      .eq('status', status)
      .order('due_date', { ascending: true })
      .limit(limit)

    // Salesperson sees only their agreements' items
    if (userRole === 'salesperson') {
      const { data: spAgreements } = await supabase
        .from('agreements')
        .select('id')
        .eq('salesperson_id', userTeamId)
        .is('deleted_at', null)
      const ids = (spAgreements ?? []).map((a: { id: string }) => a.id)
      if (ids.length === 0) return NextResponse.json([])
      query = query.in('agreement_id', ids)
    }

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Post-filter stale items: if it's a payout reminder but the payout is already paid, skip it
    // NOTE: This is safer than an inner join if some notification types (like forecast) don't have a payout_schedule_id
    const filtered = (data ?? []).filter(item => {
      if (item.notification_type === 'payout' && item.payout?.status === 'paid') return false
      return true
    })

    return NextResponse.json(filtered)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
