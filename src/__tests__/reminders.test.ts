import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.useFakeTimers()
vi.setSystemTime(new Date('2026-04-27T00:00:00.000Z'))

import { generatePayoutReminders, REMINDER_CONFIG } from '@/lib/reminders'
import type { Agreement, PayoutSchedule } from '@/types/database'

const BASE_AGREEMENT: Agreement = {
  id: 'agr-1', reference_id: 'GE-2026-001', agreement_date: '2026-01-01',
  investment_start_date: '2026-01-01', agreement_type: 'Fixed Deposit',
  document_url: null, is_draft: false, status: 'active',
  investor_name: 'Test Investor', investor_pan: null, investor_aadhaar: null,
  investor_address: null, investor_relationship: null, investor_parent_name: null,
  nominees: [], principal_amount: 100000, roi_percentage: 12,
  payout_frequency: 'quarterly', interest_type: 'simple', lock_in_years: 1,
  maturity_date: '2027-01-01', payment_date: null, payment_mode: null,
  payment_bank: null, salesperson_id: null, salesperson_custom: null,
  tds_filing_name: null, doc_status: 'draft', doc_sent_to_client_date: null,
  doc_returned_date: null, doc_return_reminder_days: 14, investor_id: null,
  investor_birth_year: null, investor2_name: null, investor2_pan: null,
  investor2_aadhaar: null, investor2_address: null, investor2_birth_year: null,
  deleted_at: null, created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const FUTURE_PAYOUT: PayoutSchedule = {
  id: 'pay-1', agreement_id: 'agr-1', period_from: '2026-04-01',
  period_to: '2026-06-30', no_of_days: 91,
  due_by: '2026-07-01', // 65 days ahead — both 7-day and day-of generate
  gross_interest: 3000, tds_amount: 300, net_interest: 2700,
  is_principal_repayment: false, status: 'pending',
  paid_date: null, created_at: '2026-01-01T00:00:00.000Z',
}

const NEAR_PAYOUT: PayoutSchedule = {
  ...FUTURE_PAYOUT, id: 'pay-near',
  due_by: '2026-05-01', // 4 days ahead — 7-day reminder would be in the past, only day-of generates
}

const PAST_PAYOUT: PayoutSchedule = {
  ...FUTURE_PAYOUT, id: 'pay-past', due_by: '2026-04-01',
}

describe('generatePayoutReminders', () => {
  beforeEach(() => {
    vi.setSystemTime(new Date('2026-04-27T00:00:00.000Z'))
  })

  it('REMINDER_CONFIG.payout includes both 7-day and day-of lead times', () => {
    expect(REMINDER_CONFIG.payout).toEqual([7, 0])
  })

  it('generates both 7-day and day-of reminders for a far-future payout', () => {
    const reminders = generatePayoutReminders(BASE_AGREEMENT, FUTURE_PAYOUT, 'coord@example.com', null)
    expect(reminders).toHaveLength(2)
    expect(reminders.map(r => r.lead_days).sort()).toEqual([0, 7])
  })

  it('includes salesperson in email_to when provided', () => {
    const reminders = generatePayoutReminders(BASE_AGREEMENT, FUTURE_PAYOUT, 'coord@example.com', 'sales@example.com')
    for (const r of reminders) {
      expect(r.email_to).toContain('coord@example.com')
      expect(r.email_to).toContain('sales@example.com')
    }
  })

  it('skips 7-day reminder when it falls in the past (payout 4 days away)', () => {
    const reminders = generatePayoutReminders(BASE_AGREEMENT, NEAR_PAYOUT, 'coord@example.com', null)
    expect(reminders).toHaveLength(1)
    expect(reminders[0].lead_days).toBe(0)
  })

  it('generates no reminders for a past payout', () => {
    const reminders = generatePayoutReminders(BASE_AGREEMENT, PAST_PAYOUT, 'coord@example.com', null)
    expect(reminders).toHaveLength(0)
  })

  it('returns empty array when emailTo list is empty', () => {
    const reminders = generatePayoutReminders(BASE_AGREEMENT, FUTURE_PAYOUT, '', null)
    expect(reminders).toHaveLength(0)
  })
})
