
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole !== 'coordinator' && userRole !== 'accountant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const supabase = createAdminClient()
    const todayStr = new Date().toISOString().split('T')[0]

    // Find all 'active' agreements where maturity_date is in the past
    const { data: expired, error: fetchError } = await supabase
      .from('agreements')
      .select('id, reference_id, investor_name, maturity_date')
      .eq('status', 'active')
      .lt('maturity_date', todayStr)
      .is('deleted_at', null)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!expired || expired.length === 0) {
      return NextResponse.json({ 
        success: true, 
        updated: 0, 
        message: 'No active agreements found with past maturity dates.' 
      })
    }

    // Update them to 'matured'
    const { error: updateError } = await supabase
      .from('agreements')
      .update({ status: 'matured', updated_at: new Date().toISOString() })
      .in('id', expired.map(a => a.id))

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Add audit logs for each
    const auditLogs = expired.map(a => ({
      agreement_id: a.id,
      change_type: 'status_changed',
      old_values: { status: 'active' },
      new_values: { status: 'matured' },
    }))

    await supabase.from('agreement_audit_log').insert(auditLogs)

    return NextResponse.json({
      success: true,
      updated: expired.length,
      affected: expired.map(a => `${a.reference_id} (${a.investor_name})`)
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
