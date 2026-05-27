import { describe, it, expect, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(() => Promise.resolve(Buffer.from('%PDF-mock'))),
  Document: ({ children }: { children: unknown }) => children,
  Page: ({ children }: { children: unknown }) => children,
  Text: ({ children }: { children: unknown }) => children,
  View: ({ children }: { children: unknown }) => children,
  StyleSheet: { create: (s: unknown) => s },
}))

vi.mock('@/lib/pdf-info-sheet', () => ({
  InfoSheetDocument: () => null,
}))

const createReq = (body: Record<string, unknown>) =>
  new NextRequest('http://localhost:3000/api/agreements/pdf-info-sheet', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

describe('pdf-info-sheet POST', () => {
  it('returns 400 when investor_name is missing', async () => {
    const { POST } = await import('../app/api/agreements/pdf-info-sheet/route')
    const res = await POST(createReq({ principal_amount: '5000000' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeTruthy()
  })

  it('returns 400 when principal_amount is missing', async () => {
    const { POST } = await import('../app/api/agreements/pdf-info-sheet/route')
    const res = await POST(createReq({ investor_name: 'Ramesh Kumar' }))
    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBeTruthy()
  })

  it('returns a PDF buffer with correct headers for valid input', async () => {
    const { POST } = await import('../app/api/agreements/pdf-info-sheet/route')
    const res = await POST(createReq({
      form: {
        investor_name: 'Ramesh Kumar',
        investor_pan: 'ABCDE1234F',
        agreement_type: 'Investment Agreement',
        agreement_date: '2025-01-01',
        principal_amount: '5000000',
        roi_percentage: '12.5',
        payout_frequency: 'quarterly',
        interest_type: 'simple',
        investment_start_date: '2025-01-01',
        maturity_date: '2028-01-01',
        lock_in_years: '3',
      },
      schedule: [
        {
          period_from: '2025-01-01',
          period_to: '2025-03-31',
          due_by: '2025-04-01',
          no_of_days: 90,
          gross_interest: 153424.66,
          tds_amount: 15342.47,
          net_interest: 138082.19,
          is_tds_only: false,
          is_principal_repayment: false,
        },
      ],
    }))
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
    expect(res.headers.get('Content-Disposition')).toContain('Ramesh-Kumar')
  })
})
