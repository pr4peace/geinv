import type { ExtractedAgreement } from './claude'

export type ExtractionFlagType =
  | 'tds_mismatch'
  | 'net_mismatch'
  | 'period_gap'
  | 'coverage_short'
  | 'row_count_warning'
  | 'generated_row'
  | 'start_date_mismatch'
  | 'matured_agreement'

export type ExtractionFlagSeverity = 'info' | 'warning' | 'error'

export type ExtractionFlagResolution = 'pending' | 'fixed' | 'accepted'

export interface ExtractionFlag {
  id: string
  type: ExtractionFlagType
  severity: ExtractionFlagSeverity
  rowIndex: number | null
  message: string
  expected: string
  found: string
  resolution: ExtractionFlagResolution
  acceptanceNote?: string
}

const TOLERANCE = 0.5

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function dayAfter(dateStr: string): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().split('T')[0]
}

export function validateExtraction(extracted: ExtractedAgreement): ExtractionFlag[] {
  const flags: ExtractionFlag[] = []
  let flagIndex = 0

  const rows = extracted.payout_schedule ?? []

  // investment_start_date mismatch with first row
  if (rows.length > 0 && extracted.investment_start_date) {
    const firstRowFrom = rows[0].period_from
    if (extracted.investment_start_date !== firstRowFrom) {
      flags.push({
        id: `flag-${flagIndex++}`,
        type: 'start_date_mismatch',
        severity: 'error',
        rowIndex: null,
        message: `Investment start date (${extracted.investment_start_date}) does not match first payout period (${firstRowFrom})`,
        expected: firstRowFrom,
        found: extracted.investment_start_date,
        resolution: 'pending',
      })
    }
  }

  // matured agreement warning
  if (extracted.maturity_date) {
    const todayStr = new Date().toISOString().split('T')[0]
    if (extracted.maturity_date < todayStr) {
      flags.push({
        id: `flag-${flagIndex++}`,
        type: 'matured_agreement',
        severity: 'info',
        rowIndex: null,
        message: `This agreement reached maturity on ${extracted.maturity_date}. It will be saved with status 'Matured'.`,
        expected: `Status: Matured`,
        found: `Matured on ${extracted.maturity_date}`,
        resolution: 'pending',
      })
    }
  }

  rows.forEach((row, i) => {
    if (row.is_principal_repayment) return

    // tds_mismatch
    const expectedTds = round2(row.gross_interest * 0.1)
    if (Math.abs(row.tds_amount - expectedTds) > TOLERANCE) {
      flags.push({
        id: `flag-${flagIndex++}`,
        type: 'tds_mismatch',
        severity: row.is_tds_only ? 'info' : 'warning',
        rowIndex: i,
        message: `Row ${i + 1}: TDS amount (₹${row.tds_amount}) differs from calculated 10% (₹${expectedTds})`,
        expected: `₹${expectedTds.toLocaleString('en-IN')}`,
        found: `₹${row.tds_amount.toLocaleString('en-IN')}`,
        resolution: 'pending',
      })
    }

    // net_mismatch
    const expectedNet = round2(row.gross_interest - row.tds_amount)
    if (Math.abs(row.net_interest - expectedNet) > TOLERANCE) {
      flags.push({
        id: `flag-${flagIndex++}`,
        type: 'net_mismatch',
        severity: 'warning',
        rowIndex: i,
        message: `Row ${i + 1}: Net interest (₹${row.net_interest}) doesn't match Gross - TDS (₹${expectedNet})`,
        expected: `₹${expectedNet.toLocaleString('en-IN')}`,
        found: `₹${row.net_interest.toLocaleString('en-IN')}`,
        resolution: 'pending',
      })
    }

    // period_gap — compare with next row
    if (i < rows.length - 1) {
      const nextRow = rows[i + 1]
      const expectedNextFrom = dayAfter(row.period_to)
      if (nextRow.period_from !== expectedNextFrom) {
        flags.push({
          id: `flag-${flagIndex++}`,
          type: 'period_gap',
          severity: 'info',
          rowIndex: i,
          message: `Date gap: Row ${i + 1} ends ${row.period_to}, but Row ${i + 2} starts ${nextRow.period_from}`,
          expected: `Start date: ${expectedNextFrom}`,
          found: `Start date: ${nextRow.period_from}`,
          resolution: 'pending',
        })
      }
    }
  })

  // coverage_short — last row period_to must reach maturity_date
  if (rows.length > 0 && extracted.maturity_date) {
    const lastRow = rows[rows.length - 1]
    if (lastRow.period_to < extracted.maturity_date) {
      flags.push({
        id: `flag-${flagIndex++}`,
        type: 'coverage_short',
        severity: 'warning',
        rowIndex: rows.length - 1,
        message: `Payout schedule ends on ${lastRow.period_to}, but maturity is ${extracted.maturity_date}`,
        expected: `End date: ${extracted.maturity_date}`,
        found: `End date: ${lastRow.period_to}`,
        resolution: 'pending',
      })
    }
  }

  return flags
}
