import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userRole = request.headers.get('x-user-role') ?? ''
    if (userRole === 'salesperson') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
    const { id } = await params
    const supabase = createAdminClient()

    const todayStr = new Date().toISOString().split('T')[0]

    // Revert all 'paid' rows that were paid TODAY for this agreement
    // This is a safe enough heuristic for an "undo" of a bulk mark-paid action
    const { data, error } = await supabase
      .from('payout_schedule')
      .update({ 
        status: 'pending', 
        paid_date: null
      })
      .eq('agreement_id', id)
      .eq('status', 'paid')
      .eq('paid_date', todayStr)
      .eq('is_tds_only', false)
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    if (data && data.length > 0) {
      await supabase.from('agreement_audit_log').insert({
        agreement_id: id,
        change_type: 'updated',
        new_values: { bulk_revert_paid: `${data.length} rows reverted to pending` },
      })
    }

    return NextResponse.json({ success: true, count: data?.length ?? 0 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
