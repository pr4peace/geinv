import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email'
import { getPayoutReminders, getMaturingAgreements, getDocsPendingReturn } from '@/lib/dashboard-reminders'
import { format } from 'date-fns'

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function fmt(n: number) {
  return '₹' + n.toLocaleString('en-IN')
}

function buildSummaryEmail(
  monthLabel: string,
  overdue: Awaited<ReturnType<typeof getPayoutReminders>>['overdue'],
  thisMonth: Awaited<ReturnType<typeof getPayoutReminders>>['thisMonth'],
  maturing: Awaited<ReturnType<typeof getMaturingAgreements>>['agreements'],
  docs: Awaited<ReturnType<typeof getDocsPendingReturn>>
): string {
  const td = (content: string, extra = '') =>
    `<td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:13px;color:#374151;${extra}">${content}</td>`

  const tdMono = (content: string) =>
    `<td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;font-size:12px;color:#6b7280;font-family:monospace;">${content}</td>`

  const tableHead = (cols: string[]) =>
    `<tr style="background:#f8fafc;">${cols.map(c =>
      `<th style="padding:8px 12px;text-align:left;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#9ca3af;border-bottom:2px solid #e5e7eb;">${c}</th>`
    ).join('')}</tr>`

  const sectionBlock = (title: string, accentColor: string, badge: string, rows: string, cols: string[], emptyMsg: string) => `
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">
      <tr>
        <td>
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">
            <tr>
              <td style="font-size:14px;font-weight:600;color:#111827;">${title}</td>
              <td style="text-align:right;">
                <span style="background:${accentColor}18;color:${accentColor};font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;">${badge}</span>
              </td>
            </tr>
          </table>
          ${rows
            ? `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
                <thead>${tableHead(cols)}</thead>
                <tbody>${rows}</tbody>
               </table>`
            : `<p style="font-size:13px;color:#9ca3af;font-style:italic;margin:0;">${emptyMsg}</p>`
          }
        </td>
      </tr>
    </table>`

  const overdueRows = overdue.map(r => `<tr>
    ${td(esc(r.investor_name), 'font-weight:500;')}
    ${tdMono(esc(r.reference_id))}
    ${td(esc(r.period_to))}
    ${td(fmt(r.net_interest), 'text-align:right;font-weight:600;color:#dc2626;')}
  </tr>`).join('')

  const thisMonthRows = thisMonth.map(r => `<tr>
    ${td(esc(r.investor_name), 'font-weight:500;')}
    ${tdMono(esc(r.reference_id))}
    ${td(esc(r.period_to))}
    ${td(fmt(r.net_interest), 'text-align:right;font-weight:600;color:#1d4ed8;')}
  </tr>`).join('')

  const maturingRows = maturing.map(a => `<tr>
    ${td(esc(a.investor_name), 'font-weight:500;')}
    ${tdMono(esc(a.reference_id))}
    ${td(esc(a.maturity_date))}
    ${td(fmt(a.principal_amount), 'text-align:right;font-weight:600;color:#059669;')}
  </tr>`).join('')

  const docRows = docs.map(d => `<tr>
    ${td(esc(d.investor_name), 'font-weight:500;')}
    ${tdMono(esc(d.reference_id))}
    ${td(esc(d.doc_sent_to_client_date))}
    ${td(`${d.daysSinceSent} days${d.isOverdue ? ' — overdue' : ''}`, `color:${d.isOverdue ? '#ea580c' : '#6b7280'};font-weight:${d.isOverdue ? '600' : '400'};`)}
  </tr>`).join('')

  const netTotal = [...overdue, ...thisMonth].reduce((s, r) => s + r.net_interest, 0)

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1a3a2a;padding:24px 32px;">
            <p style="margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:#86efac;">Good Earth Investments</p>
            <h1 style="margin:4px 0 0;font-size:20px;font-weight:700;color:#ffffff;">Reminder Summary</h1>
            <p style="margin:4px 0 0;font-size:13px;color:#86efac;">${esc(monthLabel)}</p>
          </td>
        </tr>

        <!-- Summary bar -->
        ${netTotal > 0 ? `<tr>
          <td style="background:#f0fdf4;padding:12px 32px;border-bottom:1px solid #dcfce7;">
            <p style="margin:0;font-size:13px;color:#166534;">
              Total net payable this month: <strong style="font-size:15px;">${fmt(netTotal)}</strong>
              ${overdue.length > 0 ? `&nbsp;·&nbsp;<span style="color:#dc2626;font-weight:600;">${overdue.length} overdue</span>` : ''}
            </p>
          </td>
        </tr>` : ''}

        <!-- Body -->
        <tr>
          <td style="padding:32px;">

            ${sectionBlock(
              '⚠️ Overdue Interest Payouts',
              '#dc2626',
              overdue.length > 0 ? `${overdue.length} overdue` : 'None',
              overdueRows,
              ['Investor', 'Ref', 'Due Till', 'Net Amount'],
              'No overdue payouts.'
            )}

            ${sectionBlock(
              `📅 Interest Payouts — ${esc(monthLabel)}`,
              '#1d4ed8',
              thisMonth.length > 0 ? `${thisMonth.length} due` : 'None',
              thisMonthRows,
              ['Investor', 'Ref', 'Due Till', 'Net Amount'],
              'No payouts due this month.'
            )}

            ${sectionBlock(
              '📋 Agreements Maturing This Month',
              '#059669',
              maturing.length > 0 ? `${maturing.length} maturing` : 'None',
              maturingRows,
              ['Investor', 'Ref', 'Maturity Date', 'Principal'],
              'No agreements maturing this month.'
            )}

            ${sectionBlock(
              '📁 Documents Pending Return',
              '#ea580c',
              docs.length > 0 ? `${docs.length} pending` : 'None',
              docRows,
              ['Investor', 'Ref', 'Sent Date', 'Days Since Sent'],
              'No documents pending return.'
            )}

            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" style="padding-top:8px;">
                  <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard"
                     style="display:inline-block;background:#1a3a2a;color:#ffffff;text-decoration:none;font-size:13px;font-weight:600;padding:10px 24px;border-radius:6px;">
                    View Dashboard →
                  </a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 32px;background:#f8fafc;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
              Good Earth Investment Tracker · This is an automated reminder summary
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`.trim()
}

export async function POST() {
  try {
    const supabase = createAdminClient()

    const { data: accountants } = await supabase
      .from('team_members')
      .select('email, name')
      .eq('role', 'accountant')
      .eq('is_active', true)

    if (!accountants?.length) {
      return NextResponse.json({ error: 'No active accountant found' }, { status: 404 })
    }

    const emailTo = accountants.map(a => a.email)
    const monthLabel = format(new Date(), 'MMMM yyyy')

    const [payouts, maturing, docs] = await Promise.all([
      getPayoutReminders(),
      getMaturingAgreements(),
      getDocsPendingReturn(),
    ])

    const html = buildSummaryEmail(monthLabel, payouts.overdue, payouts.thisMonth, maturing.agreements, docs)

    const result = await sendEmail({
      to: emailTo,
      subject: `Reminder Summary — ${monthLabel}`,
      html,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error ?? 'Failed to send email' }, { status: 500 })
    }

    return NextResponse.json({ success: true, sentTo: emailTo })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
