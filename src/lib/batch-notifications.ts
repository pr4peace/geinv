import type { NotificationQueue, NotificationType } from '@/types/database'

type EnrichedItem = NotificationQueue & {
  agreement?: {
    id: string
    investor_name: string
    reference_id: string
    principal_amount?: number
    salesperson?: { name: string; email?: string } | null
  } | null
  gross_interest?: number | null
  tds_amount?: number | null
  net_interest?: number | null
}

export interface Recipient {
  key: string
  name: string
  email: string
  role: string
  checked: boolean
}

export interface AmountSummary {
  gross: number
  tds: number
  net: number
}

export interface BatchedEmail {
  groupKey: string
  groupLabel: string
  recipients: Recipient[]
  subject: string
  body: string
  items: EnrichedItem[]
  amounts: AmountSummary
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

function calcAmounts(items: EnrichedItem[]): AmountSummary {
  let gross = 0, tds = 0, net = 0
  for (const item of items) {
    if (item.notification_type === 'payout' || item.notification_type === 'tds_filing') {
      gross += item.gross_interest ?? 0
      tds += item.tds_amount ?? 0
      net += item.net_interest ?? 0
    }
    if (item.notification_type === 'maturity') {
      net += item.agreement?.principal_amount ?? 0
    }
  }
  return { gross, tds, net }
}

function fmtCurrency(n: number): string {
  return n === 0 ? '—' : `₹${n.toLocaleString('en-IN')}`
}

function fmtCurrencyStrict(n: number): string {
  return `₹${n.toLocaleString('en-IN')}`
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
  const amounts = calcAmounts(items)
  const amountPart = amounts.net > 0 ? ` (${fmtCurrency(amounts.net)} net)` : ''
  return `${prefix}: ${count} ${typeLabel}${amountPart}`
}

function buildBatchBody(items: EnrichedItem[], isSalespersonBatch: boolean, amounts: AmountSummary): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://geinv.vercel.app'

  // Group by type
  const byType: Record<string, EnrichedItem[]> = {}
  const typeOrder: NotificationType[] = ['payout', 'tds_filing', 'maturity', 'doc_return', 'monthly_summary', 'quarterly_forecast']
  for (const item of items) {
    if (!byType[item.notification_type]) byType[item.notification_type] = []
    byType[item.notification_type].push(item)
  }

  const typeSections = typeOrder
    .filter(t => byType[t]?.length)
    .map(type => {
      const typeItems = byType[type]
      const typeLabel = TYPE_LABEL[type] ?? type
      const typeAmounts = calcAmounts(typeItems)
      const hasAmounts = type === 'payout' || type === 'tds_filing' || type === 'maturity'

      const rows = typeItems.map(item => {
        const inv = item.agreement?.investor_name ?? '—'
        const ref = item.agreement?.reference_id ?? '—'
        const due = fmtDate(item.due_date)
        const link = `${appUrl}/agreements/${item.agreement_id}`

        let amountCell = ''
        if (type === 'payout' || type === 'tds_filing') {
          amountCell = fmtCurrencyStrict(item.net_interest ?? 0)
        } else if (type === 'maturity') {
          amountCell = fmtCurrencyStrict(item.agreement?.principal_amount ?? 0)
        } else {
          amountCell = '—'
        }

        let extra = ''
        if (type === 'payout' || type === 'tds_filing') {
          extra = `
            <tr>
              <td colspan="6" style="padding:0 12px 6px 12px; color:#94a3b8; font-size:12px;">
                Gross: ${fmtCurrencyStrict(item.gross_interest ?? 0)} · TDS: ${fmtCurrencyStrict(item.tds_amount ?? 0)} · Due: ${esc(due)} · <a href="${esc(link)}" style="color:#818cf8;">View Agreement →</a>
              </td>
            </tr>
          `
        } else if (type === 'maturity') {
          const principal = item.agreement?.principal_amount ?? 0
          const maturityDate = item.due_date ?? '—'
          extra = `
            <tr>
              <td colspan="6" style="padding:0 12px 6px 12px; color:#94a3b8; font-size:12px;">
                Principal: ${fmtCurrencyStrict(principal)} · Matures: ${esc(maturityDate)} · <a href="${esc(link)}" style="color:#818cf8;">View Agreement →</a>
              </td>
            </tr>
          `
        } else {
          extra = `
            <tr>
              <td colspan="6" style="padding:0 12px 6px 12px; color:#94a3b8; font-size:12px;">
                Due: ${esc(due)} · <a href="${esc(link)}" style="color:#818cf8;">View Agreement →</a>
              </td>
            </tr>
          `
        }

        return `
          <tr style="border-bottom:1px solid #1e293b;">
            <td style="padding:10px 12px; font-weight:600; color:#e2e8f0;">${esc(inv)}</td>
            <td style="padding:10px 12px; font-family:monospace; font-size:12px; color:#64748b;">${esc(ref)}</td>
            <td style="padding:10px 12px; font-size:12px; color:#94a3b8;">${esc(due)}</td>
            <td style="padding:10px 12px; font-family:monospace; font-size:12px; color:#e2e8f0; text-align:right;">${esc(amountCell)}</td>
            <td style="padding:10px 12px; color:#94a3b8;">${item.agreement?.salesperson?.name ? esc(item.agreement.salesperson.name) : '<span style="color:#64748b;font-style:italic;">Unassigned</span>'}</td>
          </tr>
          ${extra}
        `
      }).join('')

      const subtotalRow = hasAmounts && typeAmounts.net > 0
        ? `
          <tr style="background:#0f172a;">
            <td colspan="3" style="padding:8px 12px; color:#94a3b8; font-size:12px; font-weight:600;">SUBTOTAL</td>
            <td style="padding:8px 12px; text-align:right; font-family:monospace; font-size:12px; color:#e2e8f0; font-weight:600;">${fmtCurrencyStrict(typeAmounts.net)}</td>
            <td></td>
          </tr>
        `
        : ''

      return `
        <div style="margin-bottom:20px;">
          <h3 style="margin:0 0 8px 0; font-size:14px; color:#f1f5f9; padding-bottom:6px; border-bottom:2px solid #334155;">
            ${esc(typeLabel)} (${typeItems.length} item${typeItems.length !== 1 ? 's' : ''})
          </h3>
          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr style="background:#0f172a; text-align:left;">
                <th style="padding:8px 12px; color:#64748b; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Investor</th>
                <th style="padding:8px 12px; color:#64748b; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Ref</th>
                <th style="padding:8px 12px; color:#64748b; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Due Date</th>
                <th style="padding:8px 12px; color:#64748b; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; text-align:right;">Amount</th>
                <th style="padding:8px 12px; color:#64748b; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.05em;">Salesperson</th>
              </tr>
            </thead>
            <tbody>${rows}${subtotalRow}</tbody>
          </table>
        </div>
      `
    }).join('')

  const totalLabel = items.length === 1 ? '1 notification' : `${items.length} notifications`
  const contextLabel = isSalespersonBatch ? 'for your assigned agreements' : 'for the accounts team to process'

  const grandTotals = amounts.net > 0
    ? `
      <div style="background:#1e293b; border-radius:8px; padding:12px 16px; margin-top:20px; display:flex; gap:24px; font-size:13px;">
        ${amounts.gross > 0 ? `<div><span style="color:#64748b;">Total Gross:</span> <strong style="color:#e2e8f0;">${fmtCurrencyStrict(amounts.gross)}</strong></div>` : ''}
        ${amounts.tds > 0 ? `<div><span style="color:#64748b;">Total TDS:</span> <strong style="color:#e2e8f0;">${fmtCurrencyStrict(amounts.tds)}</strong></div>` : ''}
        <div><span style="color:#64748b;">Total Net:</span> <strong style="color:#e2e8f0;">${fmtCurrencyStrict(amounts.net)}</strong></div>
      </div>
    `
    : ''

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; color:#e2e8f0; line-height:1.6;">
      <h2 style="margin:0 0 8px 0; font-size:18px; color:#f1f5f9;">Batch Notification — ${esc(totalLabel)}</h2>
      <p style="margin:0 0 16px 0; color:#94a3b8; font-size:14px;">
        The following items are due and require action ${contextLabel}.
      </p>
      ${typeSections}
      ${grandTotals}
      <p style="margin:16px 0 0; font-size:12px; color:#64748b;">
        <a href="${appUrl}/notifications" style="color:#818cf8;">View all notifications →</a>
      </p>
    </div>
  `
}

export interface TeamMember {
  id: string
  name: string
  email: string
  role: string
}

export function buildBatchedEmails(
  items: EnrichedItem[],
  teamMembers: TeamMember[],
  grouping: 'single' | 'per-person' = 'single',
): BatchedEmail[] {
  if (items.length === 0) return []

  const valli = teamMembers.find(m => m.role === 'accountant')
  const liya = teamMembers.find(m => m.role === 'financial_analyst')

  const allRecipients: Recipient[] = [
    ...(valli ? [{ key: valli.id, name: valli.name, email: valli.email, role: 'accountant', checked: true }] : []),
    ...(liya ? [{ key: liya.id, name: liya.name, email: liya.email, role: 'financial_analyst', checked: false }] : []),
  ]

  if (grouping === 'single') {
    const amounts = calcAmounts(items)
    return [
      {
        groupKey: 'single',
        groupLabel: 'All Items',
        recipients: [...allRecipients],
        subject: buildBatchSubject(items, false),
        body: buildBatchBody(items, false, amounts),
        items,
        amounts,
      },
    ]
  }

  // Per-person grouping: group by salesperson/coordinator
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
    const amounts = calcAmounts(groupItems)

    const spMember = isSalespersonBatch
      ? teamMembers.find(m => m.name === key)
      : null

    const recipients = [...allRecipients]
    if (spMember) {
      const alreadyExists = recipients.find(r => r.email === spMember.email)
      if (!alreadyExists) {
        recipients.push({
          key: spMember.id,
          name: spMember.name,
          email: spMember.email,
          role: spMember.role,
          checked: true,
        })
      }
    }

    return {
      groupKey: key,
      groupLabel: label,
      recipients,
      subject: buildBatchSubject(groupItems, isSalespersonBatch),
      body: buildBatchBody(groupItems, isSalespersonBatch, amounts),
      items: groupItems,
      amounts,
    }
  })
}

export function getAmountsBreakdown(items: EnrichedItem[]): Record<string, AmountSummary> {
  const breakdown: Record<string, AmountSummary> = {}
  for (const item of items) {
    if (item.notification_type !== 'payout' && item.notification_type !== 'tds_filing') continue
    const key = item.agreement?.salesperson?.name ?? 'Unassigned'
    if (!breakdown[key]) breakdown[key] = { gross: 0, tds: 0, net: 0 }
    breakdown[key].gross += item.gross_interest ?? 0
    breakdown[key].tds += item.tds_amount ?? 0
    breakdown[key].net += item.net_interest ?? 0
  }
  return breakdown
}
