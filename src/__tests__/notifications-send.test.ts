import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase admin client
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

// Mock email lib
vi.mock('@/lib/email', () => ({
  sendBatchNotification: vi.fn().mockResolvedValue({ success: true, id: 'email-1' }),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { sendBatchNotification } from '@/lib/email'

// Helper to build a minimal mock Supabase chain
function buildSupabaseMock(overrides: Record<string, unknown> = {}) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    ...overrides,
  }
  return chain
}

describe('POST /api/notifications/send — route logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('blocks salesperson role', async () => {
    // Import after mocks are set up
    const { POST } = await import('@/app/api/notifications/send/route')
    const req = new Request('http://localhost/api/notifications/send', {
      method: 'POST',
      headers: { 'x-user-role': 'salesperson', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'payouts', ids: ['pay-1'] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('returns 400 for missing ids', async () => {
    const { POST } = await import('@/app/api/notifications/send/route')
    const req = new Request('http://localhost/api/notifications/send', {
      method: 'POST',
      headers: { 'x-user-role': 'coordinator', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'payouts', ids: [] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
  })

  it('returns 200 and calls sendBatchNotification for valid payouts request', async () => {
    const mockPayout = {
      id: 'pay-1', agreement_id: 'agr-1', is_tds_only: false,
      due_by: '2026-06-01', gross_interest: 3000, tds_amount: 300, net_interest: 2700,
      agreement: { investor_name: 'Test Investor', reference_id: 'GE-2026-001' },
    }
    const mockAccountant = { email: 'valli@goodearth.org.in' }
    const mockReminders = { error: null }

    const supabaseMock = {
      from: vi.fn((table: string) => {
        if (table === 'payout_schedule') {
          return { 
            select: vi.fn().mockReturnThis(), 
            in: vi.fn().mockReturnThis(), 
            eq: vi.fn().mockReturnThis(),
            // make it thenable
            then: (resolve: any) => resolve({ data: [mockPayout], error: null })
          }
        }
        if (table === 'team_members') {
          return { 
            select: vi.fn().mockReturnThis(), 
            eq: vi.fn().mockReturnThis(), 
            is: vi.fn().mockReturnThis(), 
            limit: vi.fn().mockResolvedValue({ data: [mockAccountant], error: null }) 
          }
        }
        if (table === 'reminders') {
          return { 
            select: vi.fn().mockReturnThis(), 
            eq: vi.fn().mockReturnThis(), 
            gte: vi.fn().mockReturnThis(), 
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
            insert: vi.fn().mockResolvedValue(mockReminders) 
          }
        }
        return buildSupabaseMock()
      }),
    }
    vi.mocked(createAdminClient).mockReturnValue(supabaseMock as any)

    const { POST } = await import('@/app/api/notifications/send/route')
    const req = new Request('http://localhost/api/notifications/send', {
      method: 'POST',
      headers: { 'x-user-role': 'coordinator', 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'payouts', ids: ['pay-1'] }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    expect(sendBatchNotification).toHaveBeenCalledOnce()
  })
})
