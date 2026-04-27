import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../app/api/agreements/route'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/reference-id', () => ({
  generateReferenceId: vi.fn(() => Promise.resolve('REF-123')),
}))

describe('Agreements API POST validation', () => {
  const createReq = (body: any) => {
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
})
