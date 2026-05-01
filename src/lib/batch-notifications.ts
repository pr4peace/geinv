import type { NotificationQueue, NotificationType } from '@/types/database'

type EnrichedItem = NotificationQueue & {
  agreement?: {
    id: string
    investor_name: string
    reference_id: string
    salesperson?: { name: string; email?: string } | null
  } | null
}

export interface BatchedEmail {
  groupKey: string
  groupLabel: string
  recipients: string[]
  subject: string
  body: string
  items: EnrichedItem[]
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const TYPE_LABEL: Record<NotificationType, string> = {
  payout: 'Payout',
  maturity: 'Maturity',
  tds_filing: 'TDS Filing',
  doc_return: 'Doc Return',
  monthly_summary: 'Monthly Summary',
  quarterly_forecast: 'Quarterly Forecast',
}

function buildBatchSubject(items: EnrichedItem[], isSalespersonBatch: boolean): string {
  const types = new Set(items.map(i => i.notification_type))
  const count = items.length

  let typeLabel = 'Notifications'
  if (types.size === 1) {
    const t = Array.from(types)[0]
    typeLabel = TYPE_LABEL[t] ?? 'Notifications'
  }

  const prefix = isSalespersonBatch ? 'Action Required' : 'Batch'
  return `${prefix}: ${count} ${typeLabel} — Review & Process`
}

function buildBatchBody(items: EnrichedItem[], isSalespersonBatch: boolean): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://geinv.vercel.app'

  const rows = items
    .map(item => {
      const inv = item.agreement?.investor_name ?? '—'
      const ref = item.agreement?.reference_id ?? '—'
      const type = TYPE_LABEL[item.notification_type] ?? item.notification_type
      const due = fmtDate(item.due_date)
      const link = `${appUrl}/agreements/${item.agreement_id}`

      // Extra detail for payout types
      let extra = ''
      if (item.notification_type === 'payout' || item.notification_type === 'tds_filing') {
        extra = `
          <tr>
            <td colspan="5" style="padding:0 12px 6px 12px; color:#94a3b8; font-size:12px;">
              Due: ${esc(due)} · <a href="${esc(link)}" style="color:#818cf8;">View Agreement →</a>
            </td>
          </tr>
        `
      }

      return `
        <tr style="border-bottom:1px solid #1e293b;">
          <td style="padding:10px 12px; font-weight:600; color:#e2e8f0;">${esc(inv)}</td>
          <td style="padding:10px 12px; font-family:monospace; font-size:12px; color:#64748b;">${esc(ref)}</td>
          <td style="padding:10px 12px; color:#94a3b8;">${esc(type)}</td>
          <td style="padding:10px 12px; font-size:12px; color:#94a3b8;">${esc(due)}</td>
          <td style="padding:10px 12px; color:#94a3b8;">${item.agreement?.salesperson?.name ? esc(item.agreement.salesperson.name) : '<span style="color:#64748b;font-style:italic;">Unassigned</span>'}</td>
        </tr>
        ${extra}
      `
    })
    .join('')

  const totalLabel = items.length === 1 ? '1 notification' : `${items.length} notifications`
  const contextLabel = isSalespersonBatch ? 'for your assigned agreements' : 'for the accounts team to process'

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#e2e8f0; line-height:1.6;">
      <h2 style="margin:0 0 8px 0; font-size:18px; color:#f1f5f9;">Batch Notification — ${esc(totalLabel)}</h2>
      <p style="margin:0 0 16px 0; color:#94a3b8; font-size:14px;">
        The following items are due and require action ${contextLabel}.
      </p>
      <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:20px;">
        <thead>
          <tr style="background:#0f172a; text-align:left;">
            <th style="padding:8px 12px; color:#64748b; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Investor</th>
            <th style="padding:8px 12px; color:#64748b; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Ref</th>
            <th style="padding:8px 12px; color:#64748b; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Type</th>
            <th style="padding:8px 12px; color:#64748b; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Due Date</th>
            <th style="padding:8px 12px; color:#64748b; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Salesperson</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin:0; font-size:12px; color:#64748b;">
        <a href="${appUrl}/notifications" style="color:#818cf8;">View all notifications →</a>
      </p>
    </div>
  `
}

export function buildBatchedEmails(
  items: EnrichedItem[],
  accountsEmails: string[],
  mode: 'batched' | 'per-salesperson' = 'batched',
): BatchedEmail[] {
  if (items.length === 0 || accountsEmails.length === 0) return []

  if (mode === 'batched') {
    // Single email to accounts team with all items
    return [
      {
        groupKey: 'accounts',
        groupLabel: 'Accounts Team',
        recipients: accountsEmails,
        subject: buildBatchSubject(items, false),
        body: buildBatchBody(items, false),
        items,
      },
    ]
  }

  // Per-salesperson mode: group by salesperson, each email goes to accounts + that salesperson
  const groups: Record<string, EnrichedItem[]> = {}
  for (const item of items) {
    const spName = item.agreement?.salesperson?.name
    const key = spName ?? '__unassigned__'
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }

  return Object.entries(groups).map(([key, groupItems]) => {
    const isSalespersonBatch = key !== '__unassigned__'
    const label = isSalespersonBatch ? key : 'Unassigned'
    const spEmail = isSalespersonBatch
      ? items.find(i => i.agreement?.salesperson?.name === key)?.agreement?.salesperson?.email
      : null

    const recipients = [...accountsEmails]
    if (spEmail && !recipients.includes(spEmail)) {
      recipients.push(spEmail)
    }

    return {
      groupKey: key,
      groupLabel: label,
      recipients,
      subject: buildBatchSubject(groupItems, isSalespersonBatch),
      body: buildBatchBody(groupItems, isSalespersonBatch),
      items: groupItems,
    }
  })
}
