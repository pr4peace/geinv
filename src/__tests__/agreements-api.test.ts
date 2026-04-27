import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '../app/api/agreements/route'
import { createAdminClient } from '@/lib/supabase/admin'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/reference-id', () => ({
  generateReferenceId: vi.fn(() => Promise.resolve('REF-123')),
}))

describe('Agreements API POST validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const createReq = (body: Record<string, unknown>) => {
    return new NextRequest('http://localhost:3000/api/agreements', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: {
        'x-user-role': 'coordinator',
      },
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
    if (res.status !== 201 && res.status !== 400 && res.status !== 409) {
      const errorData = await res.json()
      console.log('API Error:', errorData)
    }
    expect(res.status).toBe(201)
  })

  it('stays as draft if storage move fails', async () => {
    const mockInsert = vi.fn().mockReturnThis()
    const mockSelect = vi.fn().mockReturnThis()
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'a1', reference_id: 'GE-1' }, error: null })
    const mockMove = vi.fn().mockResolvedValue({ error: { message: 'Move failed' } })

    const mockQuery: Record<string, unknown> = {
      insert: mockInsert,
      select: mockSelect,
      single: mockSingle,
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }
    mockInsert.mockReturnValue(mockQuery)
    mockSelect.mockReturnValue(mockQuery)

    const mockFrom = vi.fn().mockReturnValue(mockQuery)

    vi.mocked(createAdminClient).mockReturnValue({
      from: mockFrom,
      storage: {
        from: vi.fn().mockReturnValue({
          move: mockMove,
        }),
      },
    } as unknown as ReturnType<typeof createAdminClient>)

    const req = createReq({
      payout_frequency: 'quarterly',
      is_draft: false,
      investor_name: 'Test',
      temp_path: 'temp/file.pdf',
      principal_amount: 1000,
      roi_percentage: 12,
      lock_in_years: 1,
      agreement_date: '2026-01-01',
      investment_start_date: '2026-01-01',
      maturity_date: '2027-01-01',
      payout_schedule: [{ due_by: '2026-04-01', gross_interest: 100, tds_amount: 10, net_interest: 90 }],
    })

    const res = await POST(req)
    if (res.status !== 201 && res.status !== 400 && res.status !== 409) {
      const errorData = await res.json()
      console.log('API Error:', errorData)
    }
    expect(res.status).toBe(201)
    
    // Initial insert should have doc_status: 'draft'
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      doc_status: 'draft'
    }))
  })

  it('advances to uploaded if storage move and URL success', async () => {
    const mockInsert = vi.fn().mockReturnThis()
    const mockUpdate = vi.fn().mockReturnThis()
    const mockSelect = vi.fn().mockReturnThis()
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'a1', reference_id: 'GE-1' }, error: null })
    const mockMove = vi.fn().mockResolvedValue({ error: null })
    const mockCreateSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'http://signed' }, error: null })

    const mockQuery: Record<string, unknown> = {
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
      single: mockSingle,
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }
    mockInsert.mockReturnValue(mockQuery)
    mockUpdate.mockReturnValue(mockQuery)
    mockSelect.mockReturnValue(mockQuery)

    const mockFrom = vi.fn().mockReturnValue(mockQuery)

    vi.mocked(createAdminClient).mockReturnValue({
      from: mockFrom,
      storage: {
        from: vi.fn().mockReturnValue({
          move: mockMove,
          createSignedUrl: mockCreateSignedUrl,
        }),
      },
    } as unknown as ReturnType<typeof createAdminClient>)

    const req = createReq({
      payout_frequency: 'quarterly',
      is_draft: false,
      investor_name: 'Test',
      temp_path: 'temp/file.pdf',
      principal_amount: 1000,
      roi_percentage: 12,
      lock_in_years: 1,
      agreement_date: '2026-01-01',
      investment_start_date: '2026-01-01',
      maturity_date: '2027-01-01',
      payout_schedule: [{ due_by: '2026-04-01', gross_interest: 100, tds_amount: 10, net_interest: 90 }],
    })

    const res = await POST(req)
    if (res.status !== 201 && res.status !== 400 && res.status !== 409) {
      const errorData = await res.json()
      console.log('API Error:', errorData)
    }
    expect(res.status).toBe(201)
    
    // Should update with doc_status: 'uploaded'
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      doc_status: 'uploaded',
      document_url: 'http://signed'
    }))
  })

  it('handles signed URL failure after successful move', async () => {
    const mockInsert = vi.fn().mockReturnThis()
    const mockUpdate = vi.fn().mockReturnThis()
    const mockSelect = vi.fn().mockReturnThis()
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'a1', reference_id: 'GE-1' }, error: null })
    const mockMove = vi.fn().mockResolvedValue({ error: null })
    const mockCreateSignedUrl = vi.fn().mockResolvedValue({ data: null, error: { message: 'URL failed' } })

    const mockQuery: Record<string, unknown> = {
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
      single: mockSingle,
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }
    mockInsert.mockReturnValue(mockQuery)
    mockUpdate.mockReturnValue(mockQuery)
    mockSelect.mockReturnValue(mockQuery)

    const mockFrom = vi.fn().mockReturnValue(mockQuery)

    vi.mocked(createAdminClient).mockReturnValue({
      from: mockFrom,
      storage: {
        from: vi.fn().mockReturnValue({
          move: mockMove,
          createSignedUrl: mockCreateSignedUrl,
        }),
      },
    } as unknown as ReturnType<typeof createAdminClient>)

    const req = createReq({
      payout_frequency: 'quarterly',
      is_draft: false,
      investor_name: 'Test',
      temp_path: 'temp/file.pdf',
      principal_amount: 1000,
      roi_percentage: 12,
      lock_in_years: 1,
      agreement_date: '2026-01-01',
      investment_start_date: '2026-01-01',
      maturity_date: '2027-01-01',
      payout_schedule: [{ due_by: '2026-04-01', gross_interest: 100, tds_amount: 10, net_interest: 90 }],
    })

    const res = await POST(req)
    expect(res.status).toBe(201)
    
    // Initial insert should have doc_status: 'draft'
    expect(mockInsert).toHaveBeenCalled()
    // Should STILL call update to set doc_status: 'uploaded' even if signed URL failed
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      doc_status: 'uploaded'
    }))
  })

  it('returns 500 if update fails after successful move', async () => {
    const mockInsert = vi.fn().mockReturnThis()
    const mockUpdate = vi.fn().mockReturnThis()
    const mockSelect = vi.fn().mockReturnThis()
    const mockSingle = vi.fn().mockResolvedValueOnce({ data: { id: 'a1', reference_id: 'GE-1' }, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'Update failed' } })
    
    const mockMove = vi.fn().mockResolvedValue({ error: null })
    const mockCreateSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: 'http://signed' }, error: null })

    const mockQuery: Record<string, unknown> = {
      insert: mockInsert,
      update: mockUpdate,
      select: mockSelect,
      single: mockSingle,
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
    }
    mockInsert.mockReturnValue(mockQuery)
    mockUpdate.mockReturnValue(mockQuery)
    mockSelect.mockReturnValue(mockQuery)

    const mockFrom = vi.fn().mockReturnValue(mockQuery)

    vi.mocked(createAdminClient).mockReturnValue({
      from: mockFrom,
      storage: {
        from: vi.fn().mockReturnValue({
          move: mockMove,
          createSignedUrl: mockCreateSignedUrl,
        }),
      },
    } as unknown as ReturnType<typeof createAdminClient>)

    const req = createReq({
      payout_frequency: 'quarterly',
      is_draft: false,
      investor_name: 'Test',
      temp_path: 'temp/file.pdf',
      principal_amount: 1000,
      roi_percentage: 12,
      lock_in_years: 1,
      agreement_date: '2026-01-01',
      investment_start_date: '2026-01-01',
      maturity_date: '2027-01-01',
      payout_schedule: [{ due_by: '2026-04-01', gross_interest: 100, tds_amount: 10, net_interest: 90 }],
    })

    const res = await POST(req)
    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toContain('Document moved but failed to update')
  })
})
