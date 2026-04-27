import { describe, it, expect, vi, beforeEach } from 'vitest'
import { headers } from 'next/headers'
import { getInvestors } from '@/lib/investors-page'
import { createAdminClient } from '@/lib/supabase/admin'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))

describe('Investors Page Visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createSupabaseMock(responses: any[]) { // eslint-disable-line @typescript-eslint/no-explicit-any
    let callIndex = 0
    const from = vi.fn().mockImplementation(() => {
      const resp = responses[callIndex++]
      const mockChain: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        then: vi.fn().mockImplementation((callback) => {
          return Promise.resolve(callback(resp))
        }),
      }
      // Support await mockChain
      mockChain[Symbol.toStringTag] = 'Promise'
      mockChain.then = (onFullfilled: any) => Promise.resolve(resp).then(onFullfilled) // eslint-disable-line @typescript-eslint/no-explicit-any
      
      return mockChain
    })
    return { from }
  }

  it('scopes investors for salespeople based on their agreements', async () => {
    const mockHeaders = new Map([
      ['x-user-role', 'salesperson'],
      ['x-user-team-id', 'sp1'],
    ])
    vi.mocked(headers).mockResolvedValue(mockHeaders as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    const responses = [
      { data: [{ investor_id: 'inv1' }], error: null }, // spAgreements
      { data: [{ id: 'inv1', name: 'My Investor' }], error: null }, // actual investors
      { data: [{ investor_id: 'inv1', status: 'active', principal_amount: 1000 }], error: null }, // stats
    ]

    const mockSupabase = createSupabaseMock(responses)
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    await getInvestors()

    expect(mockSupabase.from).toHaveBeenCalledWith('agreements')
    expect(mockSupabase.from).toHaveBeenCalledWith('investors')
  })

  it('returns all investors for admin role', async () => {
    const mockHeaders = new Map([
      ['x-user-role', 'admin'],
    ])
    vi.mocked(headers).mockResolvedValue(mockHeaders as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    const responses = [
      { data: [{ id: 'inv1', name: 'Inv 1' }, { id: 'inv2', name: 'Inv 2' }], error: null }, // actual investors
      { data: [], error: null }, // agreement stats
    ]

    const mockSupabase = createSupabaseMock(responses)
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    await getInvestors()

    expect(mockSupabase.from).toHaveBeenCalledWith('investors')
    expect(mockSupabase.from).toHaveBeenCalledWith('agreements')
  })
})
