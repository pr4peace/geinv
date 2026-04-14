import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { addDays, format } from 'date-fns'
import { REMINDER_CONFIG } from '@/lib/reminders'

export async function POST(request: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createAdminClient()
    const now = new Date()
    const nowIso = now.toISOString()
    const todayStr = format(now, 'yyyy-MM-dd')

    // Fetch pending reminders due now or in the past
    const { data: reminders, error: remindersError } = await supabase
      .from('reminders')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', nowIso)

    if (remindersError) {
      return NextResponse.json({ error: remindersError.message }, { status: 500 })
    }

    let processed = 0
    let failed = 0

    for (const reminder of reminders ?? []) {
      const result = await sendEmail({
        to: reminder.email_to,
        subject: reminder.email_subject ?? '(No subject)',
        html: reminder.email_body ?? '',
      })

      const newStatus = result.success ? 'sent' : 'failed'

      await supabase
        .from('reminders')
        .update({ status: newStatus, sent_at: nowIso })
        .eq('id', reminder.id)

      if (result.success) {
        processed++

        // For doc_return reminders that were sent: if agreement doc_status is still not
        // 'returned' or 'uploaded', create the next repeat reminder (+7 days)
        if (reminder.reminder_type === 'doc_return') {
          const { data: agreement } = await supabase
            .from('agreements')
            .select('doc_status')
            .eq('id', reminder.agreement_id)
            .single()

          if (
            agreement &&
            agreement.doc_status !== 'returned' &&
            agreement.doc_status !== 'uploaded'
          ) {
            const nextScheduledAt = addDays(
              new Date(reminder.scheduled_at),
              REMINDER_CONFIG.doc_return_repeat
            )

            await supabase.from('reminders').insert({
              agreement_id: reminder.agreement_id,
              payout_schedule_id: null,
              reminder_type: 'doc_return',
              lead_days: null,
              scheduled_at: nextScheduledAt.toISOString(),
              status: 'pending',
              email_to: reminder.email_to,
              email_subject: reminder.email_subject,
              email_body: reminder.email_body,
            })
          }
        }
      } else {
        failed++
      }
    }

    // Mark payout_schedule rows as 'overdue' where due_by < today AND status = 'pending'
    await supabase
      .from('payout_schedule')
      .update({ status: 'overdue' })
      .eq('status', 'pending')
      .lt('due_by', todayStr)

    return NextResponse.json({ processed, failed })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
