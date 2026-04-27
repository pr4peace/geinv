import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = createAdminClient()

  const userRole = request.headers.get('x-user-role') ?? ''
  const userTeamId = request.headers.get('x-user-team-id') ?? ''

  let investorIdFilter: string[] | null = null

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
      return new Response('Name,PAN,Aadhaar,Address\n', {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="investors.csv"',
        },
      })
    }
  }

  let query = supabase
    .from('investors')
    .select('name, pan, aadhaar, address, birth_year, payout_bank_name, payout_bank_account, payout_bank_ifsc, created_at')
    .order('name', { ascending: true })

  if (investorIdFilter !== null) {
    query = query.in('id', investorIdFilter)
  }

  const { data: investors, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const header = ['Name', 'PAN', 'Aadhaar', 'Address', 'Birth Year', 'Payout Bank', 'Payout Account', 'IFSC', 'Created']
  const rows = (investors ?? []).map(inv => [
    inv.name,
    inv.pan ?? '',
    inv.aadhaar ?? '',
    (inv.address ?? '').replace(/\n/g, ' '),
    inv.birth_year ?? '',
    inv.payout_bank_name ?? '',
    inv.payout_bank_account ?? '',
    inv.payout_bank_ifsc ?? '',
    inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-IN') : '',
  ])

  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="investors-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
}
