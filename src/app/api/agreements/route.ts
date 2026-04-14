import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReferenceId } from '@/lib/reference-id'
import {
  generatePayoutReminders,
  generateMaturityReminders,
  generateDocReturnReminders,
  type ReminderInput,
} from '@/lib/reminders'
import type { ExtractedPayoutRow } from '@/lib/claude'

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)

    const status = searchParams.get('status')
    const payoutFrequency = searchParams.get('payout_frequency')
    const isDraft = searchParams.get('is_draft')
    const salespersonId = searchParams.get('salesperson_id')
    const sortBy = searchParams.get('sort_by') ?? 'created_at'
    const sortOrder = searchParams.get('sort_order') ?? 'desc'

    const allowedSortColumns = ['principal_amount', 'roi_percentage', 'maturity_date', 'investment_start_date', 'created_at']
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at'
    const ascending = sortOrder === 'asc'

    let query = supabase
      .from('agreements')
      .select('*, salesperson:team_members!salesperson_id(*)')
      .order(safeSortBy, { ascending })

    if (status) query = query.eq('status', status)
    if (payoutFrequency) query = query.eq('payout_frequency', payoutFrequency)
    if (isDraft !== null) query = query.eq('is_draft', isDraft === 'true')
    if (salespersonId) query = query.eq('salesperson_id', salespersonId)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    const body = await request.json()

    const { payout_schedule: payoutScheduleRows, ...agreementFields } = body as {
      payout_schedule: ExtractedPayoutRow[]
      [key: string]: unknown
    }

    // Generate reference_id
    const reference_id = await generateReferenceId()

    // Insert agreement
    const { data: agreement, error: agreementError } = await supabase
      .from('agreements')
      .insert({ ...agreementFields, reference_id })
      .select()
      .single()

    if (agreementError) {
      return NextResponse.json({ error: agreementError.message }, { status: 400 })
    }

    // Insert payout schedule rows
    if (Array.isArray(payoutScheduleRows) && payoutScheduleRows.length > 0) {
      const rows = payoutScheduleRows.map((row) => ({
        ...row,
        agreement_id: agreement.id,
      }))

      const { error: payoutError } = await supabase.from('payout_schedule').insert(rows)

      if (payoutError) {
        return NextResponse.json({ error: `Failed to insert payout schedule: ${payoutError.message}` }, { status: 400 })
      }
    }

    // Fetch the payout_schedule rows with ids for reminder generation
    const { data: payoutRows, error: fetchPayoutError } = await supabase
      .from('payout_schedule')
      .select('*')
      .eq('agreement_id', agreement.id)
      .order('due_by', { ascending: true })

    if (fetchPayoutError) {
      return NextResponse.json({ error: fetchPayoutError.message }, { status: 500 })
    }

    // Fetch internal email (coordinator) for reminders
    const { data: internalMembers } = await supabase
      .from('team_members')
      .select('email')
      .eq('role', 'coordinator')
      .eq('is_active', true)
      .limit(1)

    const internalEmail = internalMembers?.[0]?.email ?? 'coordinator@goodearth.com'

    // Fetch salesperson email if assigned
    let salespersonEmail: string | null = null
    if (agreement.salesperson_id) {
      const { data: sp } = await supabase
        .from('team_members')
        .select('email')
        .eq('id', agreement.salesperson_id)
        .single()
      salespersonEmail = sp?.email ?? null
    }

    // Build reminder list
    const reminderInputs: ReminderInput[] = []

    for (const payoutRow of payoutRows ?? []) {
      const payoutReminders = generatePayoutReminders(
        agreement,
        payoutRow,
        internalEmail,
        salespersonEmail
      )
      reminderInputs.push(...payoutReminders)
    }

    const maturityReminders = generateMaturityReminders(agreement, internalEmail, salespersonEmail)
    reminderInputs.push(...maturityReminders)

    // Doc return reminders if doc_sent_to_client_date is set
    if (agreement.doc_sent_to_client_date) {
      const docReturnReminders = generateDocReturnReminders(agreement, internalEmail, salespersonEmail)
      reminderInputs.push(...docReturnReminders)
    }

    // Insert reminders
    if (reminderInputs.length > 0) {
      const reminderRows = reminderInputs.map((r) => ({
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
        console.error('Failed to insert reminders:', reminderError.message)
      }
    }

    return NextResponse.json(agreement, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
