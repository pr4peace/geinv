import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { format } from 'date-fns'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; payoutId: string }> }
) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole === 'salesperson') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id, payoutId } = await params
    const supabase = createAdminClient()

    const body = await request.json().catch(() => ({}))
    const paidDate: string = body.paid_date ?? format(new Date(), 'yyyy-MM-dd')

    // Verify payout belongs to agreement
    const { data: existing, error: fetchError } = await supabase
      .from('payout_schedule')
      .select('id')
      .eq('id', payoutId)
      .eq('agreement_id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('payout_schedule')
      .update({ status: 'paid', paid_date: paidDate })
      .eq('id', payoutId)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
