import { describe, it, expect } from 'vitest'
import { isQuarterStart } from '@/lib/notification-queue'

describe('isQuarterStart', () => {
  it('returns true for 1 Apr', () => {
    expect(isQuarterStart('2026-04-01')).toBe(true)
  })
  it('returns true for 1 Jul', () => {
    expect(isQuarterStart('2026-07-01')).toBe(true)
  })
  it('returns true for 1 Oct', () => {
    expect(isQuarterStart('2026-10-01')).toBe(true)
  })
  it('returns true for 1 Jan', () => {
    expect(isQuarterStart('2027-01-01')).toBe(true)
  })
  it('returns false for 2 Apr', () => {
    expect(isQuarterStart('2026-04-02')).toBe(false)
  })
  it('returns false for 1 May', () => {
    expect(isQuarterStart('2026-05-01')).toBe(false)
  })
})
