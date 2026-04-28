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
        sent_by_member:team_members!sent_by(name)
      `)
      .eq('status', status)
      .order('due_date', { ascending: true })
      .limit(limit)

    // Salesperson sees only their agreements' items; never sees summary/forecast
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
    return NextResponse.json(data ?? [])
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
