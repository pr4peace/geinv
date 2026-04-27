import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { DELETE } from '../app/api/investors/[id]/route'
import { createAdminClient } from '@/lib/supabase/admin'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

describe('Investors API DELETE', () => {
  const createReq = () => {
    return new NextRequest('http://localhost:3000/api/investors/inv-1', {
      method: 'DELETE',
    })
  }

  it('blocks deletion if active agreements exist (409)', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [{ id: 'agr-1', reference_id: 'GE-1', status: 'active' }], error: null }),
    })
    
    vi.mocked(createAdminClient).mockReturnValue({
      from: mockFrom,
    } as unknown as ReturnType<typeof createAdminClient>)

    const res = await DELETE(createReq(), { params: Promise.resolve({ id: 'inv-1' }) })
    expect(res.status).toBe(409)
    const data = await res.json()
    expect(data.error).toContain('linked agreements')
    expect(data.agreements).toHaveLength(1)
  })

  it('deletes investor if no agreements exist (200)', async () => {
    const mockFrom = vi.fn()
    
    // First call: check agreements
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    
    // Second call: delete
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null, count: 1 }),
    })

    vi.mocked(createAdminClient).mockReturnValue({
      from: mockFrom,
    } as unknown as ReturnType<typeof createAdminClient>)

    const res = await DELETE(createReq(), { params: Promise.resolve({ id: 'inv-1' }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })

  it('returns 404 if investor to delete not found', async () => {
    const mockFrom = vi.fn()
    
    // First call: check agreements
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    
    // Second call: delete with count 0
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null, count: 0 }),
    })

    vi.mocked(createAdminClient).mockReturnValue({
      from: mockFrom,
    } as unknown as ReturnType<typeof createAdminClient>)

    const res = await DELETE(createReq(), { params: Promise.resolve({ id: 'inv-1' }) })
    expect(res.status).toBe(404)
  })

  it('only checks for agreements if check_only is true', async () => {
    const mockFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    
    vi.mocked(createAdminClient).mockReturnValue({
      from: mockFrom,
    } as unknown as ReturnType<typeof createAdminClient>)

    const req = new NextRequest('http://localhost:3000/api/investors/inv-1?check_only=true', {
      method: 'DELETE',
    })
    const res = await DELETE(req, { params: Promise.resolve({ id: 'inv-1' }) })
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(mockFrom).not.toHaveBeenCalledWith('investors') // Should not call delete
  })
})
