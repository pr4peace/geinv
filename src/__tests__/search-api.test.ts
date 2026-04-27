import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '../app/api/search/route'
import { createAdminClient } from '@/lib/supabase/admin'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

describe('Search API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createReq = (query: string, role = 'admin', teamId = 't1') => {
    return new NextRequest(`http://localhost:3000/api/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers: {
        'x-user-role': role,
        'x-user-team-id': teamId,
      },
    })
  }

  it('sanitizes reserved PostgREST characters from query', async () => {
    const mockOr = vi.fn().mockReturnThis()
    const mockQuery: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      or: mockOr,
      limit: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      not: vi.fn().mockResolvedValue({ data: [], error: null }),
    }

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(mockQuery),
    } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    const req = createReq('test (query), with symbols')
    await GET(req)

    // The query should be sanitized to "test  query   with symbols" (replacing () and , with space)
    expect(mockOr).toHaveBeenCalledWith(expect.stringContaining('test  query   with symbols'))
  })

  it('scopes searches for salespeople', async () => {
    const mockEq = vi.fn().mockReturnThis()
    const mockIn = vi.fn().mockReturnThis()
    
    const mockQuery: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
      select: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      eq: mockEq,
      not: vi.fn().mockResolvedValue({ data: [{ investor_id: 'inv1' }], error: null }),
      in: mockIn,
    }

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue(mockQuery),
    } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    const req = createReq('test', 'salesperson', 'sp1')
    await GET(req)

    // Agreement search should be filtered by salesperson_id
    expect(mockEq).toHaveBeenCalledWith('salesperson_id', 'sp1')
    // Investor search should be scoped to linked investor IDs
    expect(mockIn).toHaveBeenCalledWith('id', ['inv1'])
  })
})
