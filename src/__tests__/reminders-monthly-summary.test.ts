import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from './helpers/supabase-mock'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  sendQuarterlyForecast: vi.fn(),
}))

vi.mock('@/lib/reminders', () => ({
  REMINDER_CONFIG: { doc_return_repeat: 7 },
  buildMonthlyPayoutSummaryEmail: vi.fn().mockReturnValue('<html>summary</html>'),
}))

import { sendEmail } from '@/lib/email'
import { handleMonthlySummary } from '@/lib/reminders-monthly-summary'

const FIRST_OF_MONTH = new Date('2026-05-01T06:00:00.000Z')

const SAMPLE_PAYOUTS = [
  {
    id: 'p1',
    due_by: '2026-05-15',
    gross_interest: 5000,
    tds_amount: 500,
    net_interest: 4500,
    agreement: { investor_name: 'Alice', reference_id: 'REF-001', status: 'active', deleted_at: null },
  },
]

const RECIPIENTS = [{ email: 'coord@example.com' }, { email: 'analyst@example.com' }]

describe('handleMonthlySummary — idempotency and audit trail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips sending if a payout_monthly_summary reminder already exists for this month', async () => {
    const mock = createSupabaseMock({
      reminders: [
        // Check query returns existing row
        [{ id: 'r1', reminder_type: 'payout_monthly_summary' }],
      ],
    })

    const result = await handleMonthlySummary(mock as unknown as Parameters<typeof handleMonthlySummary>[0], FIRST_OF_MONTH)

    expect(result).toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('inserts a reminder row before sending when none exists', async () => {
    const mock = createSupabaseMock({
      reminders: [
        [], // check query: no existing row
        [], // insert row (builder doesn't need real return)
      ],
      payout_schedule: [SAMPLE_PAYOUTS],
      team_members: [RECIPIENTS],
    })

    const result = await handleMonthlySummary(mock as unknown as Parameters<typeof handleMonthlySummary>[0], FIRST_OF_MONTH)

    expect(result).toBe(true)
    expect(sendEmail).toHaveBeenCalledOnce()

    // Insert must have happened on reminders table
    const insertBuilder = mock._allBuilders.find(
      b =>
        b.table === 'reminders' &&
        b.builder._calls.some(c => c.method === 'insert')
    )
    expect(insertBuilder, 'reminders insert not found').toBeDefined()

    // Inserted row must include reminder_type
    const insertCall = insertBuilder!.builder._calls.find(c => c.method === 'insert')
    expect((insertCall!.args[0] as Record<string, unknown>).reminder_type).toBe(
      'payout_monthly_summary'
    )
  })

  it('does not send if there are no payouts this month', async () => {
    const mock = createSupabaseMock({
      reminders: [
        [], // no existing row
      ],
      payout_schedule: [[]], // empty month
      team_members: [RECIPIENTS],
    })

    const result = await handleMonthlySummary(mock as unknown as Parameters<typeof handleMonthlySummary>[0], FIRST_OF_MONTH)

    expect(result).toBe(false)
    expect(sendEmail).not.toHaveBeenCalled()
  })
})
