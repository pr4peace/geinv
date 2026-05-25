import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendBatchNotification, type BatchNotificationItem } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  console.log('[notifications/send] POST request received')
  try {
    const userRole = request.headers.get('x-user-role')
    console.log('[notifications/send] userRole:', userRole)
    if (userRole !== 'coordinator' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    let body
    try {
      body = await request.json()
    } catch (e) {
      console.error('[notifications/send] Failed to parse request body:', e)
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    
    const { type: rawType, ids: rawIds } = body as { type?: unknown; ids?: unknown }
    console.log('[notifications/send] type:', rawType, 'ids count:', Array.isArray(rawIds) ? rawIds.length : 0)
    const allowedTypes = new Set(['payouts', 'maturities', 'tds'])

    if (typeof rawType !== 'string' || !allowedTypes.has(rawType)) {
      return NextResponse.json({ error: 'type must be payouts, maturities, or tds' }, { status: 400 })
    }
    if (
      !Array.isArray(rawIds) ||
      rawIds.length === 0 ||
      rawIds.some((id) => typeof id !== 'string' || id.length === 0)
    ) {
      return NextResponse.json({ error: 'ids must be a non-empty string array' }, { status: 400 })
    }

    const type = rawType as 'payouts' | 'maturities' | 'tds'
    const ids = Array.from(new Set(rawIds))

    const supabase = createAdminClient()

    // 1. Fetch items
    let items: BatchNotificationItem[] = []
    let payoutScheduleIds: string[] = []
    let agreementIds: string[] = []

    if (type === 'payouts' || type === 'tds') {
      const { data, error } = await supabase
        .from('payout_schedule')
        .select('id, due_by, gross_interest, tds_amount, net_interest, is_tds_only, agreement:agreements!inner(investor_name, reference_id, status, deleted_at)')
        .eq('status', 'pending')
        .eq('is_tds_only', type === 'tds')
        .eq('agreements.status', 'active')
        .is('agreements.deleted_at', null)
        .in('id', ids)
      if (error) throw error
      payoutScheduleIds = ids
      items = (data ?? []).map((p) => {
        const agreement = p.agreement as unknown as { investor_name: string; reference_id: string }
        return {
          investor_name: agreement.investor_name,
          reference_id: agreement.reference_id,
          due_by: p.due_by,
          gross_interest: p.gross_interest,
          tds_amount: p.tds_amount,
          net_interest: p.net_interest,
        }
      })
    } else {
      const { data, error } = await supabase
        .from('agreements')
        .select('id, investor_name, reference_id, maturity_date, principal_amount')
        .eq('status', 'active')
        .is('deleted_at', null)
        .in('id', ids)
      if (error) throw error
      agreementIds = ids
      items = (data ?? []).map((a) => ({
        investor_name: a.investor_name,
        reference_id: a.reference_id,
        maturity_date: a.maturity_date,
        principal_amount: a.principal_amount,
      }))
    }

    if (items.length !== ids.length) {
      return NextResponse.json({ error: 'Some selected items were not found or are no longer pending' }, { status: 400 })
    }

    // 2. Idempotency check — warn if any item notified in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    let warned = false

    if (payoutScheduleIds.length > 0) {
      const { data: recent } = await supabase
        .from('reminders')
        .select('id')
        .in('payout_schedule_id', payoutScheduleIds)
        .eq('status', 'sent')
        .gte('sent_at', sevenDaysAgo)
        .limit(1)
      if ((recent ?? []).length > 0) warned = true
    }
    if (agreementIds.length > 0) {
      const { data: recent } = await supabase
        .from('reminders')
        .select('id')
        .in('agreement_id', agreementIds)
        .eq('reminder_type', 'batch_notification')
        .eq('status', 'sent')
        .gte('sent_at', sevenDaysAgo)
        .limit(1)
      if ((recent ?? []).length > 0) warned = true
    }

    // 3. Fetch accountant email
    const { data: accountants, error: accountantError } = await supabase
      .from('team_members')
      .select('email')
      .eq('role', 'accountant')
      .eq('is_active', true)
      .limit(1)
    if (accountantError || !accountants?.length) {
      return NextResponse.json({ error: 'Accountant not found' }, { status: 404 })
    }
    const recipientEmail = accountants[0].email

    // 4. Send email
    const result = await sendBatchNotification({ type, items, recipientEmail })
    if (!result.success) {
      return NextResponse.json({ error: `Email failed: ${result.error}` }, { status: 500 })
    }

    // 5. Log one reminders row per item
    const now = new Date().toISOString()
    const subject =
      type === 'payouts'
        ? `Interest Payouts — ${items.length} items`
        : type === 'maturities'
        ? `Principal Maturities — ${items.length} agreements maturing`
        : `TDS Filings Due — ${items.length} items`

    const reminderRows = ids.map((id) => ({
      reminder_type: 'batch_notification' as const,
      status: 'sent' as const,
      email_to: [recipientEmail],
      email_subject: subject,
      sent_at: now,
      scheduled_at: now,
      ...(type === 'maturities' ? { agreement_id: id } : { payout_schedule_id: id }),
    }))

    const { error: insertError } = await supabase.from('reminders').insert(reminderRows)
    if (insertError) {
      console.error('Failed to log reminders:', insertError)
      // Don't fail the request — email was sent successfully
    }

    return NextResponse.json({ success: true, warned, emailId: result.id })
  } catch (err) {
    console.error('notifications/send error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
