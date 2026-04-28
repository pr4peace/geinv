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

    // Update all pending/notified payout_schedule rows where due_by < today
    // and is_tds_only is false (we only mark real payouts as paid here)
    const { data, error } = await supabase
      .from('payout_schedule')
      .update({ 
        status: 'paid', 
        paid_date: todayStr
      })
      .eq('agreement_id', id)
      .eq('is_tds_only', false)
      .neq('status', 'paid')
      .lt('due_by', todayStr)
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Audit log
    if (data && data.length > 0) {
      await supabase.from('agreement_audit_log').insert({
        agreement_id: id,
        change_type: 'updated',
        new_values: { bulk_mark_paid: `${data.length} rows marked as paid` },
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
