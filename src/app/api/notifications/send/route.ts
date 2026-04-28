import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
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

    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    let sent = 0
    let failed = 0
    const errors: string[] = []

    const { data: items } = await supabase
      .from('notification_queue')
      .select('*')
      .in('id', ids)

    for (const item of (items ?? []) as NotificationQueue[]) {
      if (item.status === 'sent') continue // idempotent skip

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
        // Mark sent
        await supabase
          .from('notification_queue')
          .update({ status: 'sent', sent_at: nowIso, sent_by: userTeamId || null })
          .eq('id', item.id)

        // Map notification_type to reminder_type
        const reminderType = ({
          payout: 'payout',
          maturity: 'maturity',
          tds_filing: 'payout',
          doc_return: 'doc_return',
          monthly_summary: 'payout_monthly_summary',
          quarterly_forecast: 'quarterly_forecast',
        } as const)[item.notification_type] as ReminderType

        // Write to reminders table as audit log
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
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
