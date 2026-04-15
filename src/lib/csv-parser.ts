/**
 * Client-side CSV parsing for the KYC Google Sheet export.
 * Column order (0-indexed):
 *  0  Timestamp
 *  1  SL No
 *  2  Name of first applicant
 *  3  Date of Birth (first)
 *  4  Address (first)
 *  5  Aadhar Number (first)
 *  6  PAN (first)
 *  7  Name of second applicant
 *  8  Date of Birth (second)
 *  9  Address (second)
 *  10 Aadhar (second)
 *  11 PAN (second)
 *  12 Principal Amount
 *  13 Rate of Interest
 *  14 Mode of Payment (interest_type)
 *  15 Frequency of interest payout
 *  16 Start Date
 *  17 End Date
 *  18 Tenure
 *  19 Status
 *  20 Agreement Status (doc_status)
 *  21 Email ID (skip)
 *  22 Payout and TDS Account (skip)
 */

import type { ImportRow } from '@/app/api/agreements/import/route'

export type ParsedImportRow = ImportRow & {
  _raw: string[]
  _rowIndex: number
  _parseWarnings: string[]
}

// ─── Date parsing ─────────────────────────────────────────────────────────────

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
}

export function parseDate(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  const s = raw.trim()

  // DD-Mon-YYYY → "19-Feb-2025"
  const dmY = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (dmY) {
    const mon = MONTHS[dmY[2].toLowerCase()]
    if (mon) return `${dmY[3]}-${mon}-${dmY[1].padStart(2, '0')}`
  }

  // DD-MM-YY → "15-10-23"
  const dmyShort = s.match(/^(\d{1,2})-(\d{2})-(\d{2})$/)
  if (dmyShort) {
    return `20${dmyShort[3]}-${dmyShort[2].padStart(2, '0')}-${dmyShort[1].padStart(2, '0')}`
  }

  // M/D/YYYY → "9/29/2024" (US format: month first)
  const mdY = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdY) {
    // Disambiguate: if "day" > 12, it's actually D/M/YYYY (Indian style)
    const second = parseInt(mdY[2])
    if (second > 12) {
      // DD/MM/YYYY
      return `${mdY[3]}-${mdY[1].padStart(2, '0')}-${mdY[2].padStart(2, '0')}`
    }
    // Assume M/D/YYYY (US)
    return `${mdY[3]}-${mdY[1].padStart(2, '0')}-${mdY[2].padStart(2, '0')}`
  }

  // DD/MM/YYYY → "20/10/2022"
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }

  // ISO already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  return null
}

// ─── Birth year parsing ───────────────────────────────────────────────────────

export function parseBirthYear(raw: string | undefined): number | null {
  if (!raw?.trim()) return null
  const s = raw.trim()

  // Year only: "1970"
  if (/^\d{4}$/.test(s)) return parseInt(s)

  // M/D/YYYY or D/M/YYYY
  const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) return parseInt(slashMatch[3])

  // D-Mon-YYYY
  const dashMatch = s.match(/^(\d{1,2})-([A-Za-z]{3,})-(\d{4})$/)
  if (dashMatch) return parseInt(dashMatch[3])

  // DD-MM-YY
  const shortMatch = s.match(/^(\d{1,2})-(\d{2})-(\d{2})$/)
  if (shortMatch) return 2000 + parseInt(shortMatch[3])

  return null
}

// ─── Amount parsing ───────────────────────────────────────────────────────────

export function parseAmount(raw: string | undefined): number | null {
  if (!raw?.trim()) return null
  const cleaned = raw.replace(/[₹,\s]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? null : n
}

// ─── ROI parsing ──────────────────────────────────────────────────────────────

export function parseROI(raw: string | undefined): number | null {
  if (!raw?.trim()) return null
  const cleaned = raw.replace('%', '').trim()
  const n = parseFloat(cleaned)
  if (isNaN(n)) return null
  // If entered as decimal (0.16 instead of 16%), multiply by 100
  return n < 1 ? Math.round(n * 100 * 100) / 100 : n
}

// ─── Tenure parsing ───────────────────────────────────────────────────────────

export function parseTenure(raw: string | undefined): number | null {
  if (!raw?.trim()) return null
  const n = parseInt(raw.replace(/[^0-9]/g, ''))
  return isNaN(n) ? null : n
}

// ─── Frequency mapping ────────────────────────────────────────────────────────

export function parseFrequency(raw: string | undefined): ImportRow['payout_frequency'] | null {
  if (!raw?.trim()) return null
  const s = raw.trim().toLowerCase()
  if (s.includes('month')) return 'monthly'
  if (s.includes('quart') || s.includes('quaterly')) return 'quarterly'
  if (s.includes('bi') || s.includes('semi')) return 'biannual'
  if (s.includes('annual') || s.includes('year')) return 'annual'
  if (s.includes('cumul')) return 'cumulative'
  return null
}

// ─── Interest type mapping ────────────────────────────────────────────────────

export function parseInterestType(raw: string | undefined): ImportRow['interest_type'] {
  if (!raw?.trim()) return 'simple'
  const s = raw.trim().toLowerCase()
  if (s.includes('cumul') || s.includes('compound')) return 'compound'
  return 'simple'
}

// ─── Status mapping ───────────────────────────────────────────────────────────

export function parseStatus(raw: string | undefined): ImportRow['status'] {
  if (!raw?.trim()) return 'matured'
  const s = raw.trim().toLowerCase()
  if (s.includes('active')) return 'active'
  if (s.includes('cancel')) return 'cancelled'
  if (s.includes('combin')) return 'combined'
  return 'matured' // Expired → matured
}

// ─── Doc status mapping ───────────────────────────────────────────────────────

export function parseDocStatus(raw: string | undefined): ImportRow['doc_status'] {
  if (!raw?.trim() || raw.trim() === '-') return 'draft'
  const s = raw.trim().toLowerCase()
  if (s.includes('second party') || s.includes('second applicant') || s.includes('partner')) return 'partner_signed'
  if (s.includes('to be returned') || s.includes('sent to client')) return 'sent_to_client'
  if (s.includes('signed digitally') || s === 'signed') return 'uploaded'
  if (s.startsWith('signed')) return 'uploaded'
  return 'draft'
}

// ─── Clean PAN / Aadhaar ─────────────────────────────────────────────────────

function cleanPAN(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  const s = raw.trim().toUpperCase()
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(s) ? s : s.length > 3 ? s : null
}

function cleanAadhaar(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  const s = raw.trim().replace(/\s/g, '')
  return s.length >= 8 ? s : null
}

// ─── Main row parser ──────────────────────────────────────────────────────────

export function parseCSVRow(cols: string[], rowIndex: number): ParsedImportRow {
  const warnings: string[] = []

  const get = (i: number) => cols[i]?.trim() ?? ''

  const name = get(2)
  const startDateRaw = get(16)
  const endDateRaw = get(17)

  const startDate = parseDate(startDateRaw)
  const maturityDate = parseDate(endDateRaw)
  const principal = parseAmount(get(12))
  const roi = parseROI(get(13))
  const tenure = parseTenure(get(18))
  const frequency = parseFrequency(get(15))
  const status = parseStatus(get(19))
  const docStatus = parseDocStatus(get(20))

  if (!startDate) warnings.push(`Could not parse start date: "${startDateRaw}"`)
  if (!maturityDate) warnings.push(`Could not parse end date: "${endDateRaw}"`)
  if (principal === null) warnings.push(`Could not parse amount: "${get(12)}"`)
  if (roi === null) warnings.push(`Could not parse ROI: "${get(13)}"`)
  if (!frequency) warnings.push(`Could not parse frequency: "${get(15)}"`)

  return {
    investor_name: name,
    investor_pan: cleanPAN(get(6)),
    investor_aadhaar: cleanAadhaar(get(5)),
    investor_address: get(4) || null,
    investor_birth_year: parseBirthYear(get(3)),
    investor2_name: get(7) || null,
    investor2_pan: cleanPAN(get(11)),
    investor2_aadhaar: cleanAadhaar(get(10)),
    investor2_address: get(9) || null,
    investor2_birth_year: parseBirthYear(get(8)),
    principal_amount: principal ?? 0,
    roi_percentage: roi ?? 0,
    interest_type: parseInterestType(get(14)),
    payout_frequency: frequency ?? 'annual',
    agreement_date: startDate ?? '',
    investment_start_date: startDate ?? '',
    maturity_date: maturityDate ?? '',
    lock_in_years: tenure ?? 0,
    status,
    doc_status: docStatus,
    _raw: cols,
    _rowIndex: rowIndex,
    _parseWarnings: warnings,
  }
}
