import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userRole = request.headers.get('x-user-role')
    const userTeamId = request.headers.get('x-user-team-id')

    const { id } = await params
    const supabase = createAdminClient()

    const { data: agreement, error } = await supabase
      .from('agreements')
      .select('*, salesperson:team_members!salesperson_id(*)')
      .eq('id', id)
      .single()

    if (error || !agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    // RBAC: Salesperson can only see their own agreements
    if (userRole === 'salesperson' && agreement.salesperson_id !== userTeamId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { data: payoutSchedule } = await supabase
      .from('payout_schedule')
      .select('*')
      .eq('agreement_id', id)
      .order('due_by', { ascending: true })

    const { data: reminders } = await supabase
      .from('reminders')
      .select('*')
      .eq('agreement_id', id)
      .order('scheduled_at', { ascending: true })

    return NextResponse.json({
      ...agreement,
      payout_schedule: payoutSchedule ?? [],
      reminders: reminders ?? [],
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole === 'salesperson') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const supabase = createAdminClient()
    const body = await request.json()

    // Fetch existing agreement first
    const { data: existing, error: fetchError } = await supabase
      .from('agreements')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    const { data: updated, error: updateError } = await supabase
      .from('agreements')
      .update({ ...body, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    // Audit log — record what changed
    const changeType =
      body.status && body.status !== existing.status
        ? 'status_changed'
        : body.doc_status && body.doc_status !== existing.doc_status
          ? 'doc_status_changed'
          : 'updated'

    // Build diff: only include keys that actually changed
    const oldValues: Record<string, unknown> = {}
    const newValues: Record<string, unknown> = {}
    for (const key of Object.keys(body)) {
      if (key === 'updated_at') continue
      const existingVal = (existing as Record<string, unknown>)[key]
      const newVal = (body as Record<string, unknown>)[key]
      if (JSON.stringify(existingVal) !== JSON.stringify(newVal)) {
        oldValues[key] = existingVal
        newValues[key] = newVal
      }
    }
    if (Object.keys(newValues).length > 0) {
      await supabase.from('agreement_audit_log').insert({
        agreement_id: id,
        change_type: changeType,
        old_values: oldValues,
        new_values: newValues,
      })
    }

    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole === 'salesperson') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const supabase = createAdminClient()

    // Soft delete — sets deleted_at, record can be restored
    const deletedAt = new Date().toISOString()
    const { error } = await supabase
      .from('agreements')
      .update({ deleted_at: deletedAt })
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    await supabase.from('agreement_audit_log').insert({
      agreement_id: id,
      change_type: 'deleted',
      new_values: { deleted_at: deletedAt },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
