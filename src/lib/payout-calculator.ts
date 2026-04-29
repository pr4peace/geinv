/**
 * Pure payout schedule calculation for imported (historical) agreements.
 * All rows are marked as 'paid' since these are historical records.
 */

export interface PayoutRow {
  period_from: string   // ISO date
  period_to: string     // ISO date
  due_by: string        // ISO date
  no_of_days: number
  gross_interest: number
  tds_amount: number
  net_interest: number
  is_principal_repayment: boolean
  is_tds_only: boolean
  tds_filed: boolean
  status: 'paid'
}

import { generateTdsOnlyRows } from './tds-calculator'

function addMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  // Handle end-of-month overflow (e.g. Jan 31 + 1 month → Feb 28)
  return d
}

function toISO(date: Date): string {
  return date.toISOString().split('T')[0]
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function calculatePayoutSchedule({
  principal,
  roiPercentage,
  payoutFrequency,
  interestType,
  startDate,
  maturityDate,
}: {
  principal: number
  roiPercentage: number
  payoutFrequency: 'quarterly' | 'annual' | 'cumulative' | 'monthly' | 'biannual'
  interestType: 'simple' | 'compound'
  startDate: string
  maturityDate: string
}): PayoutRow[] {
  const start = new Date(startDate)
  const maturity = new Date(maturityDate)
  const rows: PayoutRow[] = []

  if (payoutFrequency === 'cumulative' || interestType === 'compound') {
    // Single payout at maturity
    const totalDays = daysBetween(start, maturity)
    const years = totalDays / 365

    let gross: number
    if (interestType === 'compound') {
      gross = round2(principal * (Math.pow(1 + roiPercentage / 100, years) - 1))
    } else {
      gross = round2(principal * (roiPercentage / 100) * years)
    }

    const tds = round2(gross * 0.1)
    const net = round2(gross - tds)

    rows.push({
      period_from: toISO(start),
      period_to: toISO(maturity),
      due_by: toISO(maturity),
      no_of_days: totalDays,
      gross_interest: gross,
      tds_amount: tds,
      net_interest: net,
      is_principal_repayment: false,
      is_tds_only: false,
      tds_filed: false,
      status: 'paid',
    })

    // Generate annual TDS-only rows for every 31 March
    const tdsOnlyRows = generateTdsOnlyRows({
      agreementId: '', // Not used in this function's output
      startDate: startDate,
      maturityDate: maturityDate,
      principal: principal,
      roi: roiPercentage,
      interestType: interestType,
    })

    for (const tdsRow of tdsOnlyRows) {
      rows.push({
        ...tdsRow,
        tds_filed: false,
        status: 'paid',
      })
    }

    // Final TDS filing tracking row for maturity (covers from last 31 March to maturity)
    // Find the last date used for TDS rows, or start if none
    const lastTdsDate = tdsOnlyRows.length > 0 
      ? new Date(tdsOnlyRows[tdsOnlyRows.length - 1].period_to) 
      : start
    
    // Only add if maturity is not already covered by a 31 March row
    if (toISO(lastTdsDate) !== toISO(maturity)) {
      const periodFrom = lastTdsDate === start 
        ? start 
        : new Date(lastTdsDate.getTime() + 24 * 60 * 60 * 1000)
      
      const lastPeriodDays = daysBetween(periodFrom, maturity) + 1
      const totalAccrued = rows.reduce((sum, r) => sum + (r.is_tds_only ? r.gross_interest : 0), 0)
      const finalPeriodInterest = round2(gross - totalAccrued)
      const finalTds = round2(tds - rows.reduce((sum, r) => sum + (r.is_tds_only ? r.tds_amount : 0), 0))

      rows.push({
        period_from: toISO(periodFrom),
        period_to: toISO(maturity),
        due_by: toISO(maturity),
        no_of_days: lastPeriodDays,
        gross_interest: finalPeriodInterest,
        tds_amount: finalTds,
        net_interest: 0,
        is_principal_repayment: false,
        is_tds_only: true,
        tds_filed: false,
        status: 'paid',
      })
    }

    return rows
  }

  // Periodic payouts
  const monthsPerPeriod =
    payoutFrequency === 'monthly' ? 1
    : payoutFrequency === 'quarterly' ? 3
    : payoutFrequency === 'biannual' ? 6
    : 12 // annual

  const nominalDaysPerPeriod =
    payoutFrequency === 'monthly' ? 30
    : payoutFrequency === 'quarterly' ? 91
    : payoutFrequency === 'biannual' ? 182
    : 365

  const grossPerPeriod = round2(principal * (roiPercentage / 100) * (monthsPerPeriod / 12))
  const tdsPerPeriod = round2(grossPerPeriod * 0.1)
  const netPerPeriod = round2(grossPerPeriod - tdsPerPeriod)

  let periodStart = new Date(start)

  while (periodStart < maturity) {
    const periodEnd = addMonths(periodStart, monthsPerPeriod)
    const actualEnd = periodEnd > maturity ? maturity : periodEnd
    const isLastPeriod = actualEnd >= maturity

    // For the last period, pro-rate if it's shorter than a full period
    let gross = grossPerPeriod
    let tds = tdsPerPeriod
    let net = netPerPeriod
    const actualDays = daysBetween(periodStart, actualEnd)

    if (isLastPeriod && actualDays < nominalDaysPerPeriod * 0.95) {
      // Pro-rate the last period
      gross = round2(principal * (roiPercentage / 100) * (actualDays / 365))
      tds = round2(gross * 0.1)
      net = round2(gross - tds)
    }

    rows.push({
      period_from: toISO(periodStart),
      period_to: toISO(actualEnd),
      due_by: toISO(actualEnd),
      no_of_days: actualDays,
      gross_interest: gross,
      tds_amount: tds,
      net_interest: net,
      is_principal_repayment: false,
      is_tds_only: false,
      tds_filed: false,
      status: 'paid',
    })

    periodStart = new Date(periodEnd)
    if (periodStart >= maturity) break
  }

  return rows
}
