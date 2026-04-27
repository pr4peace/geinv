import { describe, it, expect, vi, beforeEach } from 'vitest'
import { headers } from 'next/headers'
import { getInvestors, checkInvestorAccess } from '@/lib/investors-page'
import { createAdminClient } from '@/lib/supabase/admin'
import { GET as downloadGET } from '@/app/api/investors/download/route'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}))

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
      single: vi.fn().mockReturnThis(),
      then: (onFullfilled: any) => Promise.resolve(onFullfilled(resp)), // eslint-disable-line @typescript-eslint/no-explicit-any
    }
    mockChain[Symbol.toStringTag] = 'Promise'
    return mockChain
  })
  return { from }
}

describe('Investors Page Visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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

describe('Investor Detail Page Scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns false when salesperson tries to access investor outside portfolio', async () => {
    const mockHeaders = new Map([
      ['x-user-role', 'salesperson'],
      ['x-user-team-id', 'sp1'],
    ])
    vi.mocked(headers).mockResolvedValue(mockHeaders as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    const mockSupabase = createSupabaseMock([
      { count: 0, error: null }, // salesperson scoping check
    ])
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    const hasAccess = await checkInvestorAccess('inv_other')
    expect(hasAccess).toBe(false)
  })

  it('returns true for admin role', async () => {
    const mockHeaders = new Map([
      ['x-user-role', 'admin'],
    ])
    vi.mocked(headers).mockResolvedValue(mockHeaders as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    const hasAccess = await checkInvestorAccess('inv_any')
    expect(hasAccess).toBe(true)
  })
})

describe('Investor Download Scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns only salesperson investors in CSV', async () => {
    const request = new Request('http://localhost/api/investors/download', {
      headers: {
        'x-user-role': 'salesperson',
        'x-user-team-id': 'sp1'
      }
    })

    const mockSupabase = createSupabaseMock([
      { data: [{ investor_id: 'inv1' }], error: null }, // agreement filter
      { data: [{ name: 'My Investor', pan: 'ABC', created_at: '2024-01-01' }], error: null }, // actual query
    ])
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    const response = await downloadGET(request)
    const text = await response.text()
    expect(text).toContain('My Investor')
    expect(text.trim().split('\n').length).toBe(2)
  })

  it('returns empty CSV headers if salesperson has no agreements', async () => {
    const request = new Request('http://localhost/api/investors/download', {
      headers: {
        'x-user-role': 'salesperson',
        'x-user-team-id': 'sp1'
      }
    })

    const mockSupabase = createSupabaseMock([
      { data: [], error: null }, // agreement filter - empty
    ])
    vi.mocked(createAdminClient).mockReturnValue(mockSupabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    const response = await downloadGET(request)
    const text = await response.text()
    expect(text).toBe('Name,PAN,Aadhaar,Address\n')
  })
})
