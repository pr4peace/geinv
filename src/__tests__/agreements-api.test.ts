import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../app/api/agreements/route'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/reference-id', () => ({
  generateReferenceId: vi.fn(() => Promise.resolve('REF-123')),
}))

describe('Agreements API POST validation', () => {
  const createReq = (body: Record<string, unknown>) => {
    return new NextRequest('http://localhost:3000/api/agreements', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  }

  it('rejects invalid payout frequency', async () => {
    const req = createReq({
      payout_frequency: 'monthly', // Not allowed in DB constraint yet
      investor_name: 'Test',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Invalid payout frequency')
  })

  it('rejects fractional lock_in_years', async () => {
    const req = createReq({
      payout_frequency: 'quarterly',
      lock_in_years: 1.5,
      investor_name: 'Test',
      is_draft: true,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('must be an integer')
  })

  it('rejects maturity_date <= investment_start_date', async () => {
    const req = createReq({
      payout_frequency: 'quarterly',
      investment_start_date: '2026-01-01',
      maturity_date: '2026-01-01',
      investor_name: 'Test',
      is_draft: true,
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Maturity date must be after')
  })

  it('rejects non-draft agreement without payout schedule', async () => {
    const req = createReq({
      payout_frequency: 'quarterly',
      is_draft: false,
      payout_schedule: [],
      investor_name: 'Test',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toContain('Payout schedule is required')
  })

  it('accepts valid request and proceeds to insert', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const mockInsert = vi.fn().mockReturnThis()
    const mockSelect = vi.fn().mockReturnThis()
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'a1' }, error: null })
    
    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: mockInsert,
        select: mockSelect,
        single: mockSingle,
        neq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      }),
    } as unknown as ReturnType<typeof createAdminClient>)

    const req = createReq({
      payout_frequency: 'quarterly',
      is_draft: true,
      investor_name: 'Valid Investor',
      principal_amount: 1000000,
      roi_percentage: 12,
      lock_in_years: 1,
      agreement_date: '2026-01-01',
      investment_start_date: '2026-01-01',
      maturity_date: '2027-01-01',
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
  })
})
