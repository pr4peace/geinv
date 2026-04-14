import { addDays, subDays, isBefore, startOfDay } from 'date-fns'
import type { Agreement, PayoutSchedule, Reminder } from '@/types/database'

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

export function generateDocReturnReminder(
  agreement: Agreement,
  internalEmail: string,
  salespersonEmail: string | null
): ReminderInput | null {
  if (!agreement.doc_sent_to_client_date) return null

  const sentDate = new Date(agreement.doc_sent_to_client_date)
  const scheduledAt = addDays(sentDate, agreement.doc_return_reminder_days)
  const emailTo = [internalEmail, salespersonEmail].filter(Boolean) as string[]

  return {
    agreement_id: agreement.id,
    reminder_type: 'doc_return',
    lead_days: null,
    scheduled_at: scheduledAt,
    email_to: emailTo,
    email_subject: `Document Not Returned: ${agreement.investor_name} — ${agreement.doc_return_reminder_days} days since dispatch`,
    email_body: buildDocReturnReminderBody(agreement),
  }
}

function buildPayoutReminderBody(agreement: Agreement, payout: PayoutSchedule, leadDays: number): string {
  return `
    <h2>Interest Payout Reminder</h2>
    <p>This is a reminder that an interest payout is due in <strong>${leadDays} days</strong>.</p>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
      <tr><td><strong>Investor</strong></td><td>${agreement.investor_name}</td></tr>
      <tr><td><strong>Agreement Ref</strong></td><td>${agreement.reference_id}</td></tr>
      <tr><td><strong>Period</strong></td><td>${payout.period_from} to ${payout.period_to}</td></tr>
      <tr><td><strong>Due By</strong></td><td>${payout.due_by}</td></tr>
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
      <tr><td><strong>Investor</strong></td><td>${agreement.investor_name}</td></tr>
      <tr><td><strong>Agreement Ref</strong></td><td>${agreement.reference_id}</td></tr>
      <tr><td><strong>Principal Amount</strong></td><td>₹${agreement.principal_amount.toLocaleString('en-IN')}</td></tr>
      <tr><td><strong>Maturity Date</strong></td><td>${agreement.maturity_date}</td></tr>
    </table>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/agreements/${agreement.id}">View in Investment Tracker →</a></p>
  `.trim()
}

function buildDocReturnReminderBody(agreement: Agreement): string {
  return `
    <h2>Agreement Document Not Yet Returned</h2>
    <p>The signed agreement for <strong>${agreement.investor_name}</strong> was sent to the client on ${agreement.doc_sent_to_client_date} but has not been returned yet.</p>
    <p>Please follow up with the salesperson to collect the signed document.</p>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/agreements/${agreement.id}">View Agreement →</a></p>
  `.trim()
}
