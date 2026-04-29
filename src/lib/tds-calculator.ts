
export interface TdsRow {
  period_from: string
  period_to: string
  due_by: string
  gross_interest: number
  tds_amount: number
  net_interest: number
  is_tds_only: boolean
  is_principal_repayment: boolean
  no_of_days: number
}

export function generateTdsOnlyRows(params: {
  agreementId: string
  startDate: string
  maturityDate: string
  principal: number
  roi: number
  interestType: 'simple' | 'compound'
}): TdsRow[] {
  const start = new Date(params.startDate)
  const maturity = new Date(params.maturityDate)
  const rows: TdsRow[] = []

  let currentYear = start.getUTCFullYear()
  let lastDate = start
  let totalAccruedSoFar = 0

  while (true) {
    // 31 March of current year
    const march31 = new Date(Date.UTC(currentYear, 2, 31))
    
    // If 31 March is before start, go to next year
    if (march31 <= start) {
      currentYear++
      continue
    }

    // If 31 March is after maturity, we stop (maturity row handles final TDS)
    if (march31 >= maturity) {
      break
    }

    const periodFrom = lastDate === start
      ? start
      : new Date(lastDate.getTime() + 24 * 60 * 60 * 1000)

    const daysSinceStart = Math.floor((march31.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    
    let totalAccruedUntilNow: number
    if (params.interestType === 'compound') {
      totalAccruedUntilNow = params.principal * (Math.pow(1 + params.roi / 100, daysSinceStart / 365) - 1)
    } else {
      totalAccruedUntilNow = params.principal * (params.roi / 100) * (daysSinceStart / 365)
    }

    const periodInterest = Number((totalAccruedUntilNow - totalAccruedSoFar).toFixed(2))
    const tdsAmount = Number((periodInterest * 0.10).toFixed(2))
    const netInterest = Number((periodInterest - tdsAmount).toFixed(2))

    rows.push({
      period_from: periodFrom.toISOString().split('T')[0],
      period_to: march31.toISOString().split('T')[0],
      due_by: march31.toISOString().split('T')[0],
      gross_interest: periodInterest,
      tds_amount: tdsAmount,
      net_interest: netInterest,
      is_tds_only: true,
      is_principal_repayment: false,
      no_of_days: Math.floor((march31.getTime() - periodFrom.getTime()) / (1000 * 60 * 60 * 24)) + 1,
    })

    totalAccruedSoFar += periodInterest
    lastDate = march31
    currentYear++
  }

  return rows
}
