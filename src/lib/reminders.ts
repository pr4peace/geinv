import { addDays, subDays, isBefore, startOfDay } from 'date-fns'
import type { Agreement, PayoutSchedule, Reminder } from '@/types/database'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface ReminderInput {
  agreement_id: string
  payout_schedule_id?: string
  reminder_type: Reminder['reminder_type']
  lead_days: number | null
  scheduled_at: Date
  email_to: string[]
  email_subject: string
  email_body: string
}

// Default lead days configuration
export const REMINDER_CONFIG = {
  payout: [14, 7],           // days before due_by
  maturity: [90, 30, 14, 7], // days before maturity_date
  doc_return: 14,            // days after sent_to_client before first reminder
  doc_return_repeat: 7,      // repeat interval
}

export function generatePayoutReminders(
  agreement: Agreement,
  payoutRow: PayoutSchedule,
  internalEmail: string,
  salespersonEmail: string | null
): ReminderInput[] {
  const reminders: ReminderInput[] = []
  const dueDate = new Date(payoutRow.due_by)
  const emailTo = [internalEmail, salespersonEmail].filter(Boolean) as string[]

  const subject = `Payout Reminder: ${agreement.investor_name} — ₹${payoutRow.net_interest.toLocaleString('en-IN')} due ${payoutRow.due_by}`

  for (const leadDays of REMINDER_CONFIG.payout) {
    const scheduledAt = subDays(dueDate, leadDays)
    if (isBefore(startOfDay(new Date()), scheduledAt)) {
      reminders.push({
        agreement_id: agreement.id,
        payout_schedule_id: payoutRow.id,
        reminder_type: 'payout',
        lead_days: leadDays,
        scheduled_at: scheduledAt,
        email_to: emailTo,
        email_subject: subject,
        email_body: buildPayoutReminderBody(agreement, payoutRow, leadDays),
      })
    }
  }

  return reminders
}

export function generateMaturityReminders(
  agreement: Agreement,
  internalEmail: string,
  salespersonEmail: string | null
): ReminderInput[] {
  const reminders: ReminderInput[] = []
  const maturityDate = new Date(agreement.maturity_date)
  const emailTo = [internalEmail, salespersonEmail].filter(Boolean) as string[]

  for (const leadDays of REMINDER_CONFIG.maturity) {
    const scheduledAt = subDays(maturityDate, leadDays)
    if (isBefore(startOfDay(new Date()), scheduledAt)) {
      reminders.push({
        agreement_id: agreement.id,
        payout_schedule_id: undefined,
        reminder_type: 'maturity',
        lead_days: leadDays,
        scheduled_at: scheduledAt,
        email_to: emailTo,
        email_subject: `Maturity Notice: ${agreement.investor_name} — ₹${agreement.principal_amount.toLocaleString('en-IN')} matures in ${leadDays} days`,
        email_body: buildMaturityReminderBody(agreement, leadDays),
      })
    }
  }

  return reminders
}

export function generateDocReturnReminders(
  agreement: Agreement,
  internalEmail: string,
  salespersonEmail: string | null
): ReminderInput[] {
  if (!agreement.doc_sent_to_client_date) return []

  const sentDate = new Date(agreement.doc_sent_to_client_date)
  const emailTo = [internalEmail, salespersonEmail].filter(Boolean) as string[]
  const reminders: ReminderInput[] = []

  // Initial reminder after configured days, then repeat every 7 days for up to 5 total
  for (let i = 0; i < 5; i++) {
    const daysOffset = agreement.doc_return_reminder_days + (i * REMINDER_CONFIG.doc_return_repeat)
    const scheduledAt = addDays(sentDate, daysOffset)
    const daysSinceSent = daysOffset

    reminders.push({
      agreement_id: agreement.id,
      reminder_type: 'doc_return',
      lead_days: null,
      scheduled_at: scheduledAt,
      email_to: emailTo,
      email_subject: `Follow-up ${i + 1}: Agreement not returned — ${agreement.investor_name} (${daysSinceSent} days since dispatch)`,
      email_body: buildDocReturnReminderBody(agreement, daysSinceSent),
    })
  }

  return reminders
}

function buildPayoutReminderBody(agreement: Agreement, payout: PayoutSchedule, leadDays: number): string {
  return `
    <h2>Interest Payout Reminder</h2>
    <p>This is a reminder that an interest payout is due in <strong>${leadDays} days</strong>.</p>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
      <tr><td><strong>Investor</strong></td><td>${esc(agreement.investor_name)}</td></tr>
      <tr><td><strong>Agreement Ref</strong></td><td>${esc(agreement.reference_id)}</td></tr>
      <tr><td><strong>Period</strong></td><td>${esc(payout.period_from)} to ${esc(payout.period_to)}</td></tr>
      <tr><td><strong>Due By</strong></td><td>${esc(payout.due_by)}</td></tr>
      <tr><td><strong>Gross Interest</strong></td><td>₹${payout.gross_interest.toLocaleString('en-IN')}</td></tr>
      <tr><td><strong>TDS (10%)</strong></td><td>₹${payout.tds_amount.toLocaleString('en-IN')}</td></tr>
      <tr><td><strong>Net Payable</strong></td><td>₹${payout.net_interest.toLocaleString('en-IN')}</td></tr>
    </table>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/agreements/${agreement.id}">View in Investment Tracker →</a></p>
  `.trim()
}

function buildMaturityReminderBody(agreement: Agreement, leadDays: number): string {
  return `
    <h2>Investment Maturity Notice</h2>
    <p>The following investment agreement matures in <strong>${leadDays} days</strong>.</p>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
      <tr><td><strong>Investor</strong></td><td>${esc(agreement.investor_name)}</td></tr>
      <tr><td><strong>Agreement Ref</strong></td><td>${esc(agreement.reference_id)}</td></tr>
      <tr><td><strong>Principal Amount</strong></td><td>₹${agreement.principal_amount.toLocaleString('en-IN')}</td></tr>
      <tr><td><strong>Maturity Date</strong></td><td>${esc(agreement.maturity_date)}</td></tr>
    </table>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/agreements/${agreement.id}">View in Investment Tracker →</a></p>
  `.trim()
}

function buildDocReturnReminderBody(agreement: Agreement, daysSinceSent: number): string {
  return `
    <h2>Agreement Document Not Yet Returned (Follow-up)</h2>
    <p>The signed agreement for <strong>${esc(agreement.investor_name)}</strong> was sent to the client on ${esc(agreement.doc_sent_to_client_date ?? '')} and has not been returned after <strong>${daysSinceSent} days</strong>.</p>
    <p>Please follow up with the salesperson to collect the signed document.</p>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/agreements/${agreement.id}">View Agreement →</a></p>
  `.trim()
}
