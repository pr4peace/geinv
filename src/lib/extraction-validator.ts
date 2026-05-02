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
  | 'principal_mismatch'
  | 'invalid_pan'
  | 'invalid_aadhaar'
  | 'low_confidence'

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

const TOLERANCE = 0.1

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/
const AADHAAR_REGEX = /^[0-9]{12}$/

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function dayAfter(dateStr: string): string {
  // Parse as local date (IST for India) to avoid UTC timezone shifts
  const parts = dateStr.split('-')
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  d.setDate(d.getDate() + 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function validateExtraction(extracted: ExtractedAgreement): ExtractionFlag[] {
  const flags: ExtractionFlag[] = []
  let flagIndex = 0

  const rows = extracted.payout_schedule ?? []

  // PAN format validation
  if (extracted.investor_pan && !PAN_REGEX.test(extracted.investor_pan.replace(/\s/g, ''))) {
    flags.push({
      id: `flag-${flagIndex++}`,
      type: 'invalid_pan',
      severity: 'error',
      rowIndex: null,
      message: `PAN format is invalid: "${extracted.investor_pan}". Expected format: ABCDE1234F`,
      expected: 'ABCDE1234F format',
      found: extracted.investor_pan,
      resolution: 'pending',
    })
  }

  // Aadhaar format validation
  if (extracted.investor_aadhaar && !AADHAAR_REGEX.test(extracted.investor_aadhaar.replace(/\s/g, ''))) {
    flags.push({
      id: `flag-${flagIndex++}`,
      type: 'invalid_aadhaar',
      severity: 'warning',
      rowIndex: null,
      message: `Aadhaar format is invalid: "${extracted.investor_aadhaar}". Expected: 12 digits`,
      expected: '12-digit number',
      found: extracted.investor_aadhaar,
      resolution: 'pending',
    })
  }

  // Low confidence field warnings
  if (extracted.confidence) {
    const LOW_THRESHOLD = 0.7
    const fieldLabels: Record<string, string> = {
      principal_amount: 'Principal Amount',
      roi_percentage: 'ROI',
      payout_frequency: 'Payout Frequency',
      investor_pan: 'PAN',
      investor_aadhaar: 'Aadhaar',
      investor_name: 'Investor Name',
      investment_start_date: 'Start Date',
      maturity_date: 'Maturity Date',
      agreement_date: 'Agreement Date',
      interest_type: 'Interest Type',
      lock_in_years: 'Lock-in Years',
      agreement_type: 'Agreement Type',
    }
    for (const [field, score] of Object.entries(extracted.confidence)) {
      if (score < LOW_THRESHOLD && fieldLabels[field]) {
        flags.push({
          id: `flag-${flagIndex++}`,
          type: 'low_confidence',
          severity: score < 0.5 ? 'error' : 'warning',
          rowIndex: null,
          message: `Low confidence on ${fieldLabels[field]} (${Math.round(score * 100)}%). Verify carefully.`,
          expected: '>70% confidence',
          found: `${Math.round(score * 100)}%`,
          resolution: 'pending',
        })
      }
    }
  }

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

  // principal_mismatch — cross-check principal against payout schedule
  if (rows.length > 0 && extracted.roi_percentage > 0 && extracted.payout_frequency) {
    const regularRows = rows.filter(r => !r.is_principal_repayment && !r.is_tds_only)
    if (regularRows.length > 0) {
      // For simple interest: gross_interest = principal × roi × (no_of_days / 365) / 100
      // So: principal = gross_interest × 365 × 100 / (roi × no_of_days)
      const firstRow = regularRows[0]
      const days = firstRow.no_of_days ?? 0
      if (days > 0) {
        const impliedPrincipal = round2((firstRow.gross_interest * 365 * 100) / (extracted.roi_percentage * days))
        const ratio = extracted.principal_amount / impliedPrincipal
        // Flag if principal is off by more than 5x (likely extra/missing zero)
        if (ratio > 5 || ratio < 0.2) {
          flags.push({
            id: `flag-${flagIndex++}`,
            type: 'principal_mismatch',
            severity: 'error',
            rowIndex: null,
            message: `Principal amount (₹${extracted.principal_amount.toLocaleString('en-IN')}) appears incorrect. Based on first payout row's gross interest (₹${firstRow.gross_interest.toLocaleString('en-IN')}) over ${days} days at ${extracted.roi_percentage}%, the implied principal is ₹${impliedPrincipal.toLocaleString('en-IN')}.`,
            expected: `₹${impliedPrincipal.toLocaleString('en-IN')}`,
            found: `₹${extracted.principal_amount.toLocaleString('en-IN')}`,
            resolution: 'pending',
          })
        }
      }
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

    // period_gap — compare with next row (skip TDS-only rows in gap check)
    if (i < rows.length - 1) {
      const nextRow = rows[i + 1]
      if (!row.is_tds_only && !nextRow.is_tds_only) {
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
