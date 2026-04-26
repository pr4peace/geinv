import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agreements')
    .select('interest_type, roi_percentage, principal_amount, investor_name, reference_id, maturity_date')
    .eq('status', 'active')
    .is('deleted_at', null)
    .order('interest_type')
    .order('roi_percentage')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const header = ['Interest Type', 'ROI %', 'Investor Name', 'Reference ID', 'Principal Amount', 'Maturity Date']
  const rows = (data ?? []).map(a => [
    a.interest_type,
    a.roi_percentage,
    a.investor_name,
    a.reference_id,
    a.principal_amount,
    a.maturity_date,
  ])

  const csv = [header, ...rows]
    .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\r\n')

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="roi-breakdown-${new Date().toISOString().split('T')[0]}.csv"`,
    },
  })
}
