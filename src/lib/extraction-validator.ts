import type { ExtractedAgreement } from './claude'

export type ExtractionFlagType =
  | 'tds_mismatch'
  | 'net_mismatch'
  | 'period_gap'
  | 'coverage_short'
  | 'row_count_warning'

export type ExtractionFlagResolution = 'pending' | 'fixed' | 'accepted'

export interface ExtractionFlag {
  id: string
  type: ExtractionFlagType
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

  rows.forEach((row, i) => {
    if (row.is_principal_repayment) return

    // tds_mismatch
    const expectedTds = round2(row.gross_interest * 0.1)
    if (Math.abs(row.tds_amount - expectedTds) > TOLERANCE) {
      flags.push({
        id: `flag-${flagIndex++}`,
        type: 'tds_mismatch',
        rowIndex: i,
        message: `Row ${i + 1}: TDS does not equal 10% of gross interest`,
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
        rowIndex: i,
        message: `Row ${i + 1}: Net interest does not equal gross minus TDS`,
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
          rowIndex: i,
          message: `Gap between row ${i + 1} and row ${i + 2}: missing coverage`,
          expected: `Row ${i + 2} period_from = ${expectedNextFrom}`,
          found: `Row ${i + 2} period_from = ${nextRow.period_from}`,
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
        rowIndex: rows.length - 1,
        message: `Payout schedule does not reach maturity date — likely a missing row`,
        expected: `Last row period_to = ${extracted.maturity_date}`,
        found: `Last row period_to = ${lastRow.period_to}`,
        resolution: 'pending',
      })
    }
  }

  return flags
}
