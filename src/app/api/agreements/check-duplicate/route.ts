import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const userRole = request.headers.get('x-user-role') ?? ''
  const userTeamId = request.headers.get('x-user-team-id') ?? ''

  const { searchParams } = request.nextUrl
  const investorName = searchParams.get('investor_name')?.trim()
  const agreementDate = searchParams.get('agreement_date')?.trim()
  const investorPan = searchParams.get('investor_pan')?.trim() || null

  if (!investorName || !agreementDate) {
    return NextResponse.json({ duplicates: [] })
  }

  const supabase = createAdminClient()

  // Build OR filter: name+date match OR pan+date match (if pan provided)
  let orFilter = `and(investor_name.ilike.${investorName},agreement_date.eq.${agreementDate})`
  if (investorPan) {
    orFilter += `,and(investor_pan.eq.${investorPan},agreement_date.eq.${agreementDate})`
  }

  const { data, error } = await supabase
    .from('agreements')
    .select('id, reference_id, investor_name, agreement_date, principal_amount, status, salesperson_id')
    .neq('status', 'cancelled')
    .is('deleted_at', null)
    .or(orFilter)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ duplicates: [] })
  }

  // If salesperson, only show duplicates from their own portfolio
  let duplicates = data ?? []
  if (userRole === 'salesperson') {
    duplicates = duplicates.filter(d => d.salesperson_id === userTeamId)
  }

  return NextResponse.json({ duplicates })
}
