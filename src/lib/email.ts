import { Resend } from 'resend'
import type { Agreement, PayoutSchedule } from '@/types/database'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || apiKey === 'your-resend-api-key') return null
  return new Resend(apiKey)
}

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'Irene Mariam - Good Earth <irene.mariam@goodearth.org.in>'

// Comma-separated list of emails to always BCC (e.g. admin oversight)
const BCC_EMAILS: string[] = (process.env.RESEND_BCC_EMAILS ?? '')
  .split(',').map(e => e.trim()).filter(Boolean)

export interface SendEmailResult {
  success: boolean
  id?: string
  error?: string
}

export async function sendEmail(params: {
  to: string[]
  subject: string
  html: string
}): Promise<SendEmailResult> {
  const resend = getResendClient()
  if (!resend) {
    console.log('[Email stub] Would send to:', params.to, 'Subject:', params.subject)
    return { success: true, id: 'stub-' + Date.now() }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: params.to,
      bcc: BCC_EMAILS.length > 0 ? BCC_EMAILS : undefined,
      subject: params.subject,
      html: params.html,
    })
    if (error) return { success: false, error: error.message }
    return { success: true, id: data?.id }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function sendAccountsNotification(params: {
  agreement: Agreement
  payout: PayoutSchedule
  accountsEmail: string
}): Promise<SendEmailResult> {
  const { agreement, payout, accountsEmail } = params

  const html = `
    <h2>Interest Payout Action Required</h2>
    <p>Please process the following interest payout:</p>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;">
      <tr><td><strong>Investor</strong></td><td>${esc(agreement.investor_name)}</td></tr>
      <tr><td><strong>PAN</strong></td><td>${agreement.investor_pan ? esc(agreement.investor_pan) : 'N/A'}</td></tr>
      <tr><td><strong>Agreement Ref</strong></td><td>${esc(agreement.reference_id)}</td></tr>
      <tr><td><strong>Period</strong></td><td>${esc(payout.period_from)} to ${esc(payout.period_to)}</td></tr>
      <tr><td><strong>Due By</strong></td><td>${esc(payout.due_by)}</td></tr>
      <tr><td><strong>Gross Interest</strong></td><td>₹${payout.gross_interest.toLocaleString('en-IN')}</td></tr>
      <tr><td><strong>TDS (10%)</strong></td><td>₹${payout.tds_amount.toLocaleString('en-IN')}</td></tr>
      <tr><td><strong>Net Payable</strong></td><td><strong>₹${payout.net_interest.toLocaleString('en-IN')}</strong></td></tr>
    </table>
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/agreements/${agreement.id}">View in Investment Tracker →</a></p>
  `

  return sendEmail({
    to: [accountsEmail],
    subject: `Payout Action: ${agreement.investor_name} — ₹${payout.net_interest.toLocaleString('en-IN')} by ${payout.due_by}`,
    html,
  })
}

export async function sendQuarterlyForecast(params: {
  quarter: string
  payouts: Array<{ agreement: Agreement; payout: PayoutSchedule }>
  maturities: Agreement[]
  recipients: string[]
}): Promise<SendEmailResult> {
  const { quarter, payouts, maturities, recipients } = params

  const totalGross = payouts.reduce((s, p) => s + p.payout.gross_interest, 0)
  const totalTds = payouts.reduce((s, p) => s + p.payout.tds_amount, 0)
  const totalNet = payouts.reduce((s, p) => s + p.payout.net_interest, 0)

  const rows = payouts.map(({ agreement, payout }) => `
    <tr>
      <td>${esc(agreement.investor_name)}</td>
      <td>${esc(payout.due_by)}</td>
      <td style="text-align:right">₹${payout.gross_interest.toLocaleString('en-IN')}</td>
      <td style="text-align:right">₹${payout.tds_amount.toLocaleString('en-IN')}</td>
      <td style="text-align:right"><strong>₹${payout.net_interest.toLocaleString('en-IN')}</strong></td>
    </tr>
  `).join('')

  const maturityRows = maturities.map(a => `
    <tr>
      <td>${esc(a.investor_name)}</td>
      <td>${esc(a.maturity_date)}</td>
      <td colspan="3" style="text-align:right"><strong>₹${a.principal_amount.toLocaleString('en-IN')} (Principal)</strong></td>
    </tr>
  `).join('')

  const html = `
    <h2>Quarterly Cash Flow Forecast — ${quarter}</h2>
    <h3>Interest Payouts</h3>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%">
      <thead>
        <tr style="background:#f0f0f0">
          <th>Investor</th><th>Due By</th><th>Gross</th><th>TDS</th><th>Net Payable</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr style="background:#f0f0f0; font-weight:bold">
          <td colspan="2">TOTAL</td>
          <td style="text-align:right">₹${totalGross.toLocaleString('en-IN')}</td>
          <td style="text-align:right">₹${totalTds.toLocaleString('en-IN')}</td>
          <td style="text-align:right">₹${totalNet.toLocaleString('en-IN')}</td>
        </tr>
      </tfoot>
    </table>
    ${maturities.length > 0 ? `
    <h3>Principal Maturities This Quarter</h3>
    <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse; width:100%">
      <thead><tr style="background:#f0f0f0"><th>Investor</th><th>Maturity Date</th><th colspan="3">Amount</th></tr></thead>
      <tbody>${maturityRows}</tbody>
    </table>` : ''}
    <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard">View Dashboard →</a></p>
  `

  return sendEmail({
    to: recipients,
    subject: `Quarterly Forecast ${quarter}: ₹${totalNet.toLocaleString('en-IN')} net payable`,
    html,
  })
}

export interface BatchNotificationItem {
  investor_name: string
  reference_id: string
  due_by?: string           // payouts + TDS
  maturity_date?: string    // maturities
  gross_interest?: number
  tds_amount?: number
  net_interest?: number
  principal_amount?: number
  is_overdue?: boolean
}

export async function sendBatchNotification(params: {
  type: 'payouts' | 'maturities' | 'tds'
  items: BatchNotificationItem[]
  recipientEmail: string
}): Promise<SendEmailResult> {
  const { type, items, recipientEmail } = params

  const totalNet = items.reduce((s, i) => s + (i.net_interest ?? 0), 0)
  const totalTds = items.reduce((s, i) => s + (i.tds_amount ?? 0), 0)

  const subject =
    type === 'payouts'
      ? `Interest Payouts — ${items.length} items · ₹${totalNet.toLocaleString('en-IN')} net payable`
      : type === 'maturities'
      ? `Principal Maturities — ${items.length} agreements maturing`
      : `TDS Filings Due — ${items.length} items · ₹${totalTds.toLocaleString('en-IN')} due`

  const rows = items
    .map((item) => {
      const overdueBadge = item.is_overdue
        ? ` <strong style="font-size:10px;color:#b91c1c">[OVERDUE]</strong>`
        : ''
      const dateCell =
        type === 'maturities'
          ? esc(item.maturity_date ?? '')
          : esc(item.due_by ?? '')
      const amountCell =
        type === 'payouts'
          ? `<td style="padding:6px 12px;text-align:right">₹${(item.gross_interest ?? 0).toLocaleString('en-IN')}</td>
             <td style="padding:6px 12px;text-align:right">₹${(item.tds_amount ?? 0).toLocaleString('en-IN')}</td>
             <td style="padding:6px 12px;text-align:right;font-weight:600">₹${(item.net_interest ?? 0).toLocaleString('en-IN')}</td>`
          : type === 'maturities'
          ? `<td style="padding:6px 12px;text-align:right;font-weight:600">₹${(item.principal_amount ?? 0).toLocaleString('en-IN')}</td>`
          : `<td style="padding:6px 12px;text-align:right;font-weight:600">₹${(item.tds_amount ?? 0).toLocaleString('en-IN')}</td>`
      return `<tr>
        <td style="padding:6px 12px">${esc(item.investor_name)}${overdueBadge}</td>
        <td style="padding:6px 12px;font-family:monospace;font-size:12px">${esc(item.reference_id)}</td>
        <td style="padding:6px 12px">${dateCell}</td>
        ${amountCell}
      </tr>`
    })
    .join('')

  const headerCols =
    type === 'payouts'
      ? '<th>Investor</th><th>Ref</th><th>Due By</th><th>Gross</th><th>TDS</th><th>Net Payable</th>'
      : type === 'maturities'
      ? '<th>Investor</th><th>Ref</th><th>Maturity Date</th><th>Principal</th>'
      : '<th>Investor</th><th>Ref</th><th>Due By</th><th>TDS Amount</th>'

  const html = `
    <h2>${esc(subject)}</h2>
    <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
      <thead>
        <tr style="background:#f1f5f9;color:#475569">${headerCols}</tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:24px;font-size:12px;color:#94a3b8">
      Sent manually from Good Earth Investment Tracker.
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/notifications">View Notifications →</a>
    </p>`

  return sendEmail({ to: [recipientEmail], subject, html })
}

