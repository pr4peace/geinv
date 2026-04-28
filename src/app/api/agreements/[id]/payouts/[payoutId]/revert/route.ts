import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; payoutId: string }> }
) {
  try {
    const userRole = request.headers.get('x-user-role') ?? ''
    if (userRole === 'salesperson') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const { id, payoutId } = await params
    const supabase = createAdminClient()

    const { error } = await supabase
      .from('payout_schedule')
      .update({ 
        status: 'pending', 
        paid_date: null
      })
      .eq('id', payoutId)
      .eq('agreement_id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    await supabase.from('agreement_audit_log').insert({
      agreement_id: id,
      change_type: 'updated',
      new_values: { payout_reverted: payoutId },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
