import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { buildBatchedEmails } from '@/lib/batch-notifications'
import type { ReminderType } from '@/types/database'

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

    const grouping: 'single' | 'per-person' = body.grouping ?? 'single'
    // recipientOverrides: { [recipientKey]: boolean } — false means exclude that recipient
    const recipientOverrides: Record<string, boolean> = body.recipients ?? {}

    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()

    // Fetch with agreement + salesperson data for batch grouping
    const { data: items } = await supabase
      .from('notification_queue')
      .select(`
        *,
        agreement:agreements(
          id,
          investor_name,
          reference_id,
          salesperson:team_members!salesperson_id(id, name, email)
        )
      `)
      .in('id', ids)

    // Fetch team members for dynamic recipient list
    const { data: teamMembers } = await supabase
      .from('team_members')
      .select('id, name, email, role')
      .in('role', ['accountant', 'financial_analyst', 'coordinator', 'salesperson'])
      .eq('is_active', true)
      .order('name')

    const batches = buildBatchedEmails(items ?? [], teamMembers ?? [], grouping)

    // Apply recipient overrides
    for (const batch of batches) {
      batch.recipients = batch.recipients.filter(r => {
        if (recipientOverrides.hasOwnProperty(r.key)) {
          return recipientOverrides[r.key] === true
        }
        return r.checked // default: use initial checked state
      })
    }

    let sent = 0
    let failed = 0
    const errors: string[] = []

    for (const batch of batches) {
      // Filter recipients to only emails
      const toEmails = batch.recipients.map(r => r.email)
      if (toEmails.length === 0) {
        errors.push(`${batch.groupKey}: no recipients after filtering`)
        failed += batch.items.length
        continue
      }

      const result = await sendEmail({
        to: toEmails,
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
            email_to: toEmails,
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

    return NextResponse.json({ sent, failed, errors, emailCount: batches.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
