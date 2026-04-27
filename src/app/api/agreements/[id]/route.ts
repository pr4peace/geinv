import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  generateDocReturnReminders,
  type ReminderInput,
} from '@/lib/reminders'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

    // If doc_status changed to 'sent_to_client' and doc_sent_to_client_date is set,
    // generate doc_return reminders
    const docStatusChanged =
      body.doc_status === 'sent_to_client' &&
      existing.doc_status !== 'sent_to_client'

    const sentDate = body.doc_sent_to_client_date ?? updated.doc_sent_to_client_date

    if (docStatusChanged && sentDate) {
      // Fetch internal email and salesperson email
      const { data: internalMembers } = await supabase
        .from('team_members')
        .select('email')
        .eq('role', 'coordinator')
        .eq('is_active', true)
        .limit(1)

      const internalEmail = internalMembers?.[0]?.email ?? 'coordinator@goodearth.org.in'

      let salespersonEmail: string | null = null
      if (updated.salesperson_id) {
        const { data: sp } = await supabase
          .from('team_members')
          .select('email')
          .eq('id', updated.salesperson_id)
          .single()
        salespersonEmail = sp?.email ?? null
      }

      const docReturnReminders: ReminderInput[] = generateDocReturnReminders(
        updated,
        internalEmail,
        salespersonEmail
      )

      if (docReturnReminders.length > 0) {
        const reminderRows = docReturnReminders.map((r) => ({
          agreement_id: r.agreement_id,
          payout_schedule_id: r.payout_schedule_id ?? null,
          reminder_type: r.reminder_type,
          lead_days: r.lead_days,
          scheduled_at: r.scheduled_at.toISOString(),
          status: 'pending',
          email_to: r.email_to,
          email_subject: r.email_subject,
          email_body: r.email_body,
        }))

        const { error: reminderError } = await supabase.from('reminders').insert(reminderRows)
        if (reminderError) {
          console.error('Failed to insert doc return reminders:', reminderError.message)
        }
      }
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
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
