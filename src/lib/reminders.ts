const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface MonthlySummaryData {
  payouts: Array<{
    investor_name: string
    reference_id: string
    due_by: string
    gross_interest: number
    tds_amount: number
    net_interest: number
    is_tds_only: boolean
    is_overdue?: boolean
  }>
  maturities: Array<{
    investor_name: string
    reference_id: string
    maturity_date: string
    principal_amount: number
    is_overdue?: boolean
  }>
}

export function buildMonthlySummaryEmail(monthLabel: string, data: MonthlySummaryData): string {
  const interestPayouts = data.payouts.filter(p => !p.is_tds_only)
  const tdsFilings = data.payouts.filter(p => p.is_tds_only)
  const maturities = data.maturities

  let body = `<h2>Monthly Investment Summary — ${esc(monthLabel)}</h2>`

  const renderPayoutRow = (p: MonthlySummaryData['payouts'][0]) => `
    <tr style="${p.is_overdue ? 'color:#b91c1c;background:#fef2f2' : ''}">
      <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${esc(p.investor_name)}${p.is_overdue ? ' <strong style="font-size:10px;text-transform:uppercase">[Overdue]</strong>' : ''}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:12px">${esc(p.reference_id)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${esc(p.due_by)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right">₹${p.gross_interest.toLocaleString('en-IN')}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right">₹${p.tds_amount.toLocaleString('en-IN')}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">₹${p.net_interest.toLocaleString('en-IN')}</td>
    </tr>`

  // Interest Payouts Section
  if (interestPayouts.length > 0) {
    body += `
      <h3 style="margin-top:24px;color:#1e293b">Interest Payouts Due</h3>
      <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
        <thead>
          <tr style="background:#f1f5f9;color:#475569">
            <th style="padding:8px 12px;text-align:left">Investor</th>
            <th style="padding:8px 12px;text-align:left">Ref</th>
            <th style="padding:8px 12px;text-align:left">Due By</th>
            <th style="padding:8px 12px;text-align:right">Gross</th>
            <th style="padding:8px 12px;text-align:right">TDS</th>
            <th style="padding:8px 12px;text-align:right">Net Payable</th>
          </tr>
        </thead>
        <tbody>${interestPayouts.map(renderPayoutRow).join('')}</tbody>
      </table>`
  }

  // Maturities Section
  if (maturities.length > 0) {
    const rows = maturities.map(m => `
      <tr style="${m.is_overdue ? 'color:#b91c1c;background:#fef2f2' : ''}">
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${esc(m.investor_name)}${m.is_overdue ? ' <strong style="font-size:10px;text-transform:uppercase">[Overdue]</strong>' : ''}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:12px">${esc(m.reference_id)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${esc(m.maturity_date)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">₹${m.principal_amount.toLocaleString('en-IN')}</td>
      </tr>`).join('')

    body += `
      <h3 style="margin-top:32px;color:#b91c1c">Investments Maturing</h3>
      <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
        <thead>
          <tr style="background:#fef2f2;color:#991b1b">
            <th style="padding:8px 12px;text-align:left">Investor</th>
            <th style="padding:8px 12px;text-align:left">Ref</th>
            <th style="padding:8px 12px;text-align:left">Maturity Date</th>
            <th style="padding:8px 12px;text-align:right">Principal</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
  }

  // TDS Filing Section
  if (tdsFilings.length > 0) {
    const rows = tdsFilings.map(p => `
      <tr style="${p.is_overdue ? 'color:#b91c1c;background:#fef2f2' : ''}">
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${esc(p.investor_name)}${p.is_overdue ? ' <strong style="font-size:10px;text-transform:uppercase">[Overdue]</strong>' : ''}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;font-size:12px">${esc(p.reference_id)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0">${esc(p.due_by)}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">₹${p.tds_amount.toLocaleString('en-IN')}</td>
      </tr>`).join('')

    body += `
      <h3 style="margin-top:32px;color:#0369a1">TDS Filing Due</h3>
      <p style="font-size:12px;color:#64748b;margin-bottom:8px">For cumulative/compound interest agreements requiring annual TDS filing.</p>
      <table border="0" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px">
        <thead>
          <tr style="background:#f0f9ff;color:#075985">
            <th style="padding:8px 12px;text-align:left">Investor</th>
            <th style="padding:8px 12px;text-align:left">Ref</th>
            <th style="padding:8px 12px;text-align:left">Due By</th>
            <th style="padding:8px 12px;text-align:right">TDS Amount</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`
  }

  body += `
    <p style="margin-top:32px;font-size:12px;color:#94a3b8">
      Sent automatically by Good Earth Investment Tracker. 
      <a href="${process.env.NEXT_PUBLIC_APP_URL}/agreements">View all agreements →</a>
    </p>`

  return body
}
