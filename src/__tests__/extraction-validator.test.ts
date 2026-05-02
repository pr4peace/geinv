import { describe, it, expect } from 'vitest'
import { validateExtraction } from '../lib/extraction-validator'
import type { ExtractedAgreement } from '../lib/claude'

function makeRow(overrides: Partial<{
  period_from: string
  period_to: string
  due_by: string
  no_of_days: number | null
  gross_interest: number
  tds_amount: number
  net_interest: number
  is_principal_repayment: boolean
}> = {}) {
  return {
    period_from: '2026-04-01',
    period_to: '2027-03-31',
    due_by: '2027-04-07',
    no_of_days: 365,
    gross_interest: 140000,
    tds_amount: 14000,
    net_interest: 126000,
    is_principal_repayment: false,
    is_tds_only: false,
    ...overrides,
  }
}

function makeAgreement(overrides: Partial<ExtractedAgreement> = {}): ExtractedAgreement {
  return {
    agreement_date: '2026-01-01',
    investment_start_date: '2026-04-01',
    agreement_type: 'FD',
    investor_name: 'Test',
    investor_pan: null,
    investor_aadhaar: null,
    investor_address: null,
    nominees: [],
    tds_filing_name: null,
    principal_amount: 1000000,
    roi_percentage: 14,
    payout_frequency: 'annual',
    interest_type: 'simple',
    lock_in_years: 1,
    maturity_date: '2027-03-31',
    payments: [],
    payout_schedule: [makeRow()],
    confidence_warnings: [],
    confidence: {},
    is_draft: false,
    ...overrides,
  }
}

describe('validateExtraction', () => {
  it('returns no flags for a valid agreement', () => {
    const flags = validateExtraction(makeAgreement())
    expect(flags).toHaveLength(0)
  })

  it('flags tds_mismatch when TDS is not 10% of gross', () => {
    const flags = validateExtraction(makeAgreement({
      payout_schedule: [makeRow({ gross_interest: 140000, tds_amount: 17380, net_interest: 122620 })],
    }))
    expect(flags.some(f => f.type === 'tds_mismatch')).toBe(true)
    expect(flags.find(f => f.type === 'tds_mismatch')?.rowIndex).toBe(0)
  })

  it('does not flag tds_mismatch within ₹0.10 tolerance', () => {
    const flags = validateExtraction(makeAgreement({
      payout_schedule: [makeRow({ gross_interest: 140000, tds_amount: 14000.09, net_interest: 125999.91 })],
    }))
    expect(flags.some(f => f.type === 'tds_mismatch')).toBe(false)
  })

  it('flags net_mismatch when net ≠ gross - tds', () => {
    const flags = validateExtraction(makeAgreement({
      payout_schedule: [makeRow({ gross_interest: 140000, tds_amount: 14000, net_interest: 130000 })],
    }))
    expect(flags.some(f => f.type === 'net_mismatch')).toBe(true)
  })

  it('flags period_gap when rows are not consecutive', () => {
    const flags = validateExtraction(makeAgreement({
      payout_schedule: [
        makeRow({ period_from: '2026-04-01', period_to: '2027-03-31' }),
        makeRow({ period_from: '2027-04-03', period_to: '2028-03-31' }), // gap: missing 2027-04-02
      ],
    }))
    expect(flags.some(f => f.type === 'period_gap')).toBe(true)
  })

  it('does not flag period_gap for consecutive rows', () => {
    const flags = validateExtraction(makeAgreement({
      maturity_date: '2028-03-31',
      payout_schedule: [
        makeRow({ period_from: '2026-04-01', period_to: '2027-03-31' }),
        makeRow({ period_from: '2027-04-01', period_to: '2028-03-31' }),
      ],
    }))
    expect(flags.some(f => f.type === 'period_gap')).toBe(false)
  })

  it('flags coverage_short when last row does not reach maturity_date', () => {
    const flags = validateExtraction(makeAgreement({
      maturity_date: '2028-03-31',
      payout_schedule: [makeRow({ period_to: '2027-03-31' })],
    }))
    expect(flags.some(f => f.type === 'coverage_short')).toBe(true)
  })

  it('does not flag coverage_short when last row reaches maturity_date', () => {
    const flags = validateExtraction(makeAgreement({
      maturity_date: '2027-03-31',
      payout_schedule: [makeRow({ period_to: '2027-03-31' })],
    }))
    expect(flags.some(f => f.type === 'coverage_short')).toBe(false)
  })

  it('does not flag principal repayment rows for tds_mismatch', () => {
    const flags = validateExtraction(makeAgreement({
      payout_schedule: [
        makeRow(),
        makeRow({ gross_interest: 1000000, tds_amount: 0, net_interest: 1000000, is_principal_repayment: true }),
      ],
    }))
    expect(flags.filter(f => f.type === 'tds_mismatch')).toHaveLength(0)
  })

  it('flags start_date_mismatch when investment_start_date ≠ first period_from', () => {
    const flags = validateExtraction(makeAgreement({
      investment_start_date: '2026-03-15',
      payout_schedule: [makeRow({ period_from: '2026-04-01' })],
    }))
    expect(flags.some(f => f.type === 'start_date_mismatch')).toBe(true)
    expect(flags.find(f => f.type === 'start_date_mismatch')?.severity).toBe('error')
  })

  it('flags matured_agreement when maturity_date is in the past', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    const flags = validateExtraction(makeAgreement({
      maturity_date: yesterdayStr,
      payout_schedule: [makeRow({ period_to: yesterdayStr })],
    }))
    expect(flags.some(f => f.type === 'matured_agreement')).toBe(true)
    expect(flags.find(f => f.type === 'matured_agreement')?.severity).toBe('info')
  })
})
