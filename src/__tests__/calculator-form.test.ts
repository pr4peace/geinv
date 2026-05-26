import { describe, it, expect } from 'vitest'
import { validateCalculatorForm } from '@/lib/calculator-validation'

const base = {
  agreement_type: 'Investment Agreement',
  agreement_date: '',
  lock_in_years: '3',
  salesperson_id: '',
  investor_name: 'Ramesh Kumar',
  investor_pan: '',
  investor_aadhaar: '',
  principal_amount: '5000000',
  roi_percentage: '12.5',
  payout_frequency: 'quarterly' as const,
  interest_type: 'simple' as const,
  investment_start_date: '2025-01-01',
  maturity_date: '2028-01-01',
}

describe('validateCalculatorForm', () => {
  it('returns no errors for a valid form', () => {
    expect(validateCalculatorForm(base)).toEqual([])
  })

  it('requires investor name', () => {
    const errors = validateCalculatorForm({ ...base, investor_name: '' })
    expect(errors).toContain('Investor name is required')
  })

  it('requires positive principal', () => {
    const errors = validateCalculatorForm({ ...base, principal_amount: '0' })
    expect(errors.some(e => e.includes('Principal'))).toBe(true)
  })

  it('requires positive ROI', () => {
    const errors = validateCalculatorForm({ ...base, roi_percentage: '-1' })
    expect(errors.some(e => e.includes('ROI'))).toBe(true)
  })

  it('requires start date', () => {
    const errors = validateCalculatorForm({ ...base, investment_start_date: '' })
    expect(errors.some(e => e.includes('Start date'))).toBe(true)
  })

  it('requires maturity date', () => {
    const errors = validateCalculatorForm({ ...base, maturity_date: '' })
    expect(errors.some(e => e.includes('Maturity date'))).toBe(true)
  })

  it('rejects maturity before start', () => {
    const errors = validateCalculatorForm({ ...base, maturity_date: '2024-01-01' })
    expect(errors.some(e => e.includes('after start date'))).toBe(true)
  })
})
