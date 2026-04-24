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
  const overdueRows = overdue.map(r => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #334155">${esc(r.investor_name)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #334155;font-family:monospace">${esc(r.reference_id)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #334155">${esc(r.period_to)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #334155;text-align:right;color:#f87171;font-weight:600">${fmt(r.net_interest)}</td>
    </tr>`).join('')

  const thisMonthRows = thisMonth.map(r => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #334155">${esc(r.investor_name)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #334155;font-family:monospace">${esc(r.reference_id)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #334155">${esc(r.period_to)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #334155;text-align:right">${fmt(r.net_interest)}</td>
    </tr>`).join('')

  const maturingRows = maturing.map(a => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #334155">${esc(a.investor_name)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #334155;font-family:monospace">${esc(a.reference_id)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #334155">${esc(a.maturity_date)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #334155;text-align:right;color:#34d399;font-weight:600">${fmt(a.principal_amount)}</td>
    </tr>`).join('')

  const docRows = docs.map(d => `
    <tr>
      <td style="padding:6px 12px;border-bottom:1px solid #334155">${esc(d.investor_name)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #334155;font-family:monospace">${esc(d.reference_id)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #334155">${esc(d.doc_sent_to_client_date)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #334155;color:${d.isOverdue ? '#fb923c' : '#94a3b8'}">${d.daysSinceSent} days${d.isOverdue ? ' (overdue)' : ''}</td>
    </tr>`).join('')

  const tableHead = (cols: string[]) => `
    <tr style="background:#1e293b;color:#94a3b8;font-size:12px">
      ${cols.map(c => `<th style="padding:8px 12px;text-align:left">${c}</th>`).join('')}
    </tr>`

  const section = (title: string, color: string, rows: string, cols: string[], emptyMsg: string) => `
    <h3 style="color:${color};font-size:15px;margin:24px 0 8px">${title}</h3>
    ${rows ? `<table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;background:#0f172a">
      <thead>${tableHead(cols)}</thead>
      <tbody>${rows}</tbody>
    </table>` : `<p style="color:#64748b;font-style:italic">${emptyMsg}</p>`}`

  return `
    <div style="font-family:sans-serif;color:#e2e8f0;background:#0f172a;padding:24px;max-width:700px">
      <h2 style="color:#f1f5f9;margin:0 0 4px">Reminder Summary — ${esc(monthLabel)}</h2>
      <p style="color:#64748b;font-size:13px;margin:0 0 20px">Good Earth Investment Tracker</p>

      ${section('Overdue Interest Payouts', '#f87171', overdueRows,
        ['Investor', 'Ref', 'Due Till', 'Net Amount'],
        'No overdue payouts.')}

      ${section(`Interest Payouts Due in ${esc(monthLabel)}`, '#93c5fd', thisMonthRows,
        ['Investor', 'Ref', 'Due Till', 'Net Amount'],
        'No payouts due this month.')}

      ${section('Agreements Maturing This Month', '#34d399', maturingRows,
        ['Investor', 'Ref', 'Maturity Date', 'Principal'],
        'No agreements maturing this month.')}

      ${section('Documents Pending Return', '#fb923c', docRows,
        ['Investor', 'Ref', 'Sent Date', 'Days Since Sent'],
        'No documents pending return.')}

      <p style="margin-top:24px;font-size:12px;color:#475569">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="color:#6366f1">View Dashboard →</a>
      </p>
    </div>`.trim()
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
