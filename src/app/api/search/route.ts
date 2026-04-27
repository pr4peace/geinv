import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const userRole = request.headers.get('x-user-role')
    const userTeamId = request.headers.get('x-user-team-id')

    if (!query || query.length < 2) {
      return NextResponse.json([])
    }

    const supabase = createAdminClient()

    // 1. Search Agreements
    let agreementQuery = supabase
      .from('agreements')
      .select('id, reference_id, investor_name')
      .is('deleted_at', null)
      .or(`reference_id.ilike.%${query}%,investor_name.ilike.%${query}%`)
      .limit(10)

    if (userRole === 'salesperson') {
      agreementQuery = agreementQuery.eq('salesperson_id', userTeamId)
    }

    // 2. Search Investors
    const investorQuery = supabase
      .from('investors')
      .select('id, name, pan')
      .ilike('name', `%${query}%`)
      .limit(10)

    // Execute in parallel
    const [agreementsRes, investorsRes] = await Promise.all([
      agreementQuery,
      investorQuery
    ])

    const results: Array<{ id: string; type: 'agreement' | 'investor'; title: string; subtitle: string }> = []

    // Map Agreement results
    if (agreementsRes.data) {
      for (const a of agreementsRes.data) {
        results.push({
          id: a.id,
          type: 'agreement',
          title: a.reference_id,
          subtitle: a.investor_name
        })
      }
    }

    // Map Investor results
    if (investorsRes.data) {
      for (const i of investorsRes.data) {
        results.push({
          id: i.id,
          type: 'investor',
          title: i.name,
          subtitle: i.pan ?? 'No PAN'
        })
      }
    }

    return NextResponse.json(results)
  } catch (err) {
    console.error('Search API error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}
