import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../app/api/payout-schedule/[id]/mark-tds-filed/route'
import { createAdminClient } from '@/lib/supabase/admin'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

describe('Mark TDS Filed API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createReq = (id: string, role = 'coordinator') => {
    return new NextRequest(`http://localhost:3000/api/payout-schedule/${id}/mark-tds-filed`, {
      method: 'POST',
      headers: {
        'x-user-role': role,
      },
    })
  }

  it('rejects non-authorized roles', async () => {
    const req = createReq('p1', 'salesperson')
    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) })
    expect(res.status).toBe(403)
  })

  it('returns 404 if no row was updated', async () => {
    const mockUpdate = vi.fn().mockReturnThis()
    const mockEq = vi.fn().mockReturnThis()
    const mockSelect = vi.fn().mockResolvedValue({ data: [], error: null })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: mockUpdate,
        eq: mockEq,
        select: mockSelect,
      }),
    } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    const req = createReq('p1')
    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) })
    
    expect(res.status).toBe(404)
    const data = await res.json()
    expect(data.error).toBe('TDS payout row not found')
  })

  it('returns 200 on success', async () => {
    const mockSelect = vi.fn().mockResolvedValue({ data: [{ id: 'p1' }], error: null })

    vi.mocked(createAdminClient).mockReturnValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: mockSelect,
      }),
    } as any) // eslint-disable-line @typescript-eslint/no-explicit-any

    const req = createReq('p1')
    const res = await POST(req, { params: Promise.resolve({ id: 'p1' }) })
    
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
  })
})
