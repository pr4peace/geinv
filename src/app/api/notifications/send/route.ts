import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { getAccountsEmails } from '@/lib/notification-queue'
import { buildBatchedEmails } from '@/lib/batch-notifications'
import type { NotificationQueue, ReminderType } from '@/types/database'

export async function POST(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role') ?? ''
    const userTeamId = request.headers.get('x-user-team-id') ?? ''

    if (userRole === 'salesperson') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json()
    const ids: string[] = body.ids ?? []
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids array required' }, { status: 400 })
    }

    const mode: 'batched' | 'per-salesperson' | 'per-item' = body.mode ?? 'batched'

    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    if (mode === 'per-item') {
      // Legacy mode: one email per notification item
      return sendPerItem(supabase, ids, nowIso, userTeamId)
    }

    // Batched mode: group items and send consolidated emails
    return sendBatched(supabase, ids, nowIso, userTeamId, mode)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

async function sendPerItem(
  supabase: ReturnType<typeof createAdminClient>,
  ids: string[],
  nowIso: string,
  userTeamId: string | null,
) {
  let sent = 0
  let failed = 0
  const errors: string[] = []

  const { data: items } = await supabase
    .from('notification_queue')
    .select('*')
    .in('id', ids)

  for (const item of (items ?? []) as NotificationQueue[]) {
    if (item.status === 'sent') continue

    const to = [
      ...(item.recipients.accounts ?? []),
      ...(item.recipients.salesperson ? [item.recipients.salesperson] : []),
    ].filter(Boolean)

    if (to.length === 0) {
      errors.push(`${item.id}: no recipients`)
      failed++
      continue
    }

    const result = await sendEmail({
      to,
      subject: item.suggested_subject ?? '(No subject)',
      html: item.suggested_body ?? '',
    })

    if (result.success) {
      await supabase
        .from('notification_queue')
        .update({ status: 'sent', sent_at: nowIso, sent_by: userTeamId || null })
        .eq('id', item.id)

      const reminderType = ({
        payout: 'payout',
        maturity: 'maturity',
        tds_filing: 'payout',
        doc_return: 'doc_return',
        monthly_summary: 'payout_monthly_summary',
        quarterly_forecast: 'quarterly_forecast',
      } as const)[item.notification_type] as ReminderType

      await supabase.from('reminders').insert({
        agreement_id: item.agreement_id,
        payout_schedule_id: item.payout_schedule_id,
        reminder_type: reminderType,
        lead_days: null,
        scheduled_at: nowIso,
        status: 'sent',
        sent_at: nowIso,
        email_to: to,
        email_subject: item.suggested_subject,
        email_body: item.suggested_body,
      })

      sent++
    } else {
      errors.push(`${item.id}: ${result.error ?? 'send failed'}`)
      failed++
    }
  }

  return NextResponse.json({ sent, failed, errors })
}

async function sendBatched(
  supabase: ReturnType<typeof createAdminClient>,
  ids: string[],
  nowIso: string,
  userTeamId: string | null,
  mode: 'batched' | 'per-salesperson',
) {
  let sent = 0
  let failed = 0
  const errors: string[] = []

  // Fetch with agreement + salesperson data for batch grouping
  const { data: items } = await supabase
    .from('notification_queue')
    .select(`
      *,
      agreement:agreements(
        id,
        investor_name,
        reference_id,
        salesperson:team_members!salesperson_id(name, email)
      )
    `)
    .in('id', ids)

  const accountsEmails = await getAccountsEmails(supabase)
  const batches = buildBatchedEmails(items ?? [], accountsEmails, mode)

  for (const batch of batches) {
    if (batch.recipients.length === 0) {
      errors.push(`${batch.groupKey}: no recipients`)
      failed++
      continue
    }

    const result = await sendEmail({
      to: batch.recipients,
      subject: batch.subject,
      html: batch.body,
    })

    if (result.success) {
      // Mark all items in this batch as sent
      const batchIds = batch.items.map(i => i.id)
      await supabase
        .from('notification_queue')
        .update({ status: 'sent', sent_at: nowIso, sent_by: userTeamId || null })
        .in('id', batchIds)

      // Write audit rows for each item
      for (const item of batch.items) {
        const reminderType = ({
          payout: 'payout',
          maturity: 'maturity',
          tds_filing: 'payout',
          doc_return: 'doc_return',
          monthly_summary: 'payout_monthly_summary',
          quarterly_forecast: 'quarterly_forecast',
        } as const)[item.notification_type] as ReminderType

        await supabase.from('reminders').insert({
          agreement_id: item.agreement_id,
          payout_schedule_id: item.payout_schedule_id,
          reminder_type: reminderType,
          lead_days: null,
          scheduled_at: nowIso,
          status: 'sent',
          sent_at: nowIso,
          email_to: batch.recipients,
          email_subject: batch.subject,
          email_body: batch.body,
        })
      }

      sent += batch.items.length
    } else {
      errors.push(`${batch.groupKey}: ${result.error ?? 'send failed'}`)
      failed += batch.items.length
    }
  }

  return NextResponse.json({ sent, failed, errors, batches: batches.length })
}
