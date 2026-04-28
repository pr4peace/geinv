import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const q = request.nextUrl.searchParams.get('q')?.trim()
    const userRole = request.headers.get('x-user-role')
    const userTeamId = request.headers.get('x-user-team-id')

    let investorIdFilter: string[] | null = null

    // RBAC: Salesperson can only see their own investors
    if (userRole === 'salesperson' && userTeamId) {
      const { data: agreements } = await supabase
        .from('agreements')
        .select('investor_id')
        .eq('salesperson_id', userTeamId)
        .is('deleted_at', null)
        .not('investor_id', 'is', null)

      investorIdFilter = Array.from(
        new Set((agreements ?? []).map(a => a.investor_id).filter(Boolean) as string[])
      )

      if (investorIdFilter.length === 0) {
        return NextResponse.json([])
      }
    }

    let query = supabase
      .from('investors')
      .select('*')
      .order('name', { ascending: true })

    if (investorIdFilter) {
      query = query.in('id', investorIdFilter)
    }

    if (q) {
      query = query.or(`name.ilike.%${q}%,pan.ilike.%${q}%`)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
