import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFrom = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockFrom }),
}))

import {
  getPayoutReminders,
  getMaturingAgreements,
  getDocsPendingReturn,
} from '@/lib/dashboard-reminders'

describe('getPayoutReminders', () => {
  beforeEach(() => { mockFrom.mockReset() })

  it('splits rows into overdue and thisMonth buckets correctly', async () => {
    const today = new Date()
    const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      .toISOString().split('T')[0]

    const rows = [
      { id: '1', period_to: '2026-03-31', status: 'pending', net_interest: 1000, tds_amount: 100, gross_interest: 1100, is_principal_repayment: false, agreement_id: 'a1', agreements: { investor_name: 'Alice', reference_id: 'REF-001', payout_frequency: 'quarterly', id: 'a1' } },
      { id: '2', period_to: lastOfMonth, status: 'pending', net_interest: 2000, tds_amount: 200, gross_interest: 2200, is_principal_repayment: false, agreement_id: 'a2', agreements: { investor_name: 'Bob', reference_id: 'REF-002', payout_frequency: 'annual', id: 'a2' } },
    ]

    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
    }
    mockFrom.mockReturnValue({ ...chain, then: (resolve: (v: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }) })

    const result = await getPayoutReminders()
    expect(result.overdue).toHaveLength(1)
    expect(result.overdue[0].id).toBe('1')
    expect(result.thisMonth).toHaveLength(1)
    expect(result.thisMonth[0].id).toBe('2')
    expect(result.netTotal).toBe(3000)
  })
})

describe('getMaturingAgreements', () => {
  beforeEach(() => { mockFrom.mockReset() })

  it('returns agreements maturing this month', async () => {
    const rows = [
      { id: 'a1', investor_name: 'Alice', reference_id: 'REF-001', principal_amount: 500000, maturity_date: '2026-05-10', interest_type: 'cumulative' },
    ]
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: (v: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }),
    })
    const result = await getMaturingAgreements()
    expect(result.agreements).toHaveLength(1)
    expect(result.totalPrincipal).toBe(500000)
  })
})

describe('getDocsPendingReturn', () => {
  beforeEach(() => { mockFrom.mockReset() })

  it('returns agreements with doc_status sent_to_client and no return date', async () => {
    const rows = [
      { id: 'a1', investor_name: 'Alice', reference_id: 'REF-001', doc_sent_to_client_date: '2026-04-02', doc_return_reminder_days: 30 },
    ]
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: (resolve: (v: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }),
    })
    const result = await getDocsPendingReturn()
    expect(result).toHaveLength(1)
    expect(result[0].reference_id).toBe('REF-001')
  })
})
