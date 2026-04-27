import { describe, it, expect } from 'vitest'
import { calculatePayoutSchedule } from '../lib/payout-calculator'

describe('calculatePayoutSchedule', () => {
  const params = {
    principal: 1000000,
    roiPercentage: 12,
    payoutFrequency: 'quarterly' as const,
    interestType: 'simple' as const,
    startDate: '2026-01-01',
    maturityDate: '2027-01-01',
  }

  it('calculates quarterly schedule correctly', () => {
    const rows = calculatePayoutSchedule(params)
    expect(rows).toHaveLength(4)
    expect(rows[0].gross_interest).toBe(30000) // 1M * 12% * 3/12
    expect(rows[0].tds_amount).toBe(3000)
    expect(rows[0].net_interest).toBe(27000)
    expect(rows[0].period_from).toBe('2026-01-01')
    expect(rows[0].period_to).toBe('2026-04-01')
  })

  it('calculates cumulative schedule as two rows (interest + TDS tracking)', () => {
    const rows = calculatePayoutSchedule({
      ...params,
      payoutFrequency: 'cumulative',
    })
    expect(rows).toHaveLength(2)
    // Row 1: Interest
    expect(rows[0].gross_interest).toBe(120000) // 1M * 12% * 1yr
    expect(rows[0].is_tds_only).toBe(false)
    // Row 2: TDS Tracking
    expect(rows[1].gross_interest).toBe(0)
    expect(rows[1].tds_amount).toBe(12000)
    expect(rows[1].is_tds_only).toBe(true)
    
    expect(rows[0].period_from).toBe('2026-01-01')
    expect(rows[0].period_to).toBe('2027-01-01')
  })

  it('calculates annual schedule correctly', () => {
    const rows = calculatePayoutSchedule({
      ...params,
      payoutFrequency: 'annual',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].gross_interest).toBe(120000)
  })

  it('pro-rates the last period if it is short', () => {
    const rows = calculatePayoutSchedule({
      ...params,
      maturityDate: '2026-05-01', // 4 months total
    })
    expect(rows).toHaveLength(2)
    expect(rows[0].no_of_days).toBe(90) // Jan 1 to Apr 1
    expect(rows[1].no_of_days).toBe(30) // Apr 1 to May 1
    expect(rows[1].gross_interest).toBeLessThan(30000)
    // 1M * 12% * 30/365 = 9863.01
    expect(rows[1].gross_interest).toBe(9863.01)
  })

  it('returns empty array if maturity is before start', () => {
    const rows = calculatePayoutSchedule({
      ...params,
      maturityDate: '2025-01-01',
    })
    expect(rows).toHaveLength(0)
  })
})
