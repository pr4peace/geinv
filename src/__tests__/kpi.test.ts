import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupabaseMock } from './helpers/supabase-mock'

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { createAdminClient } from '@/lib/supabase/admin'
import { getDashboardKPIs } from '@/lib/kpi'

const TODAY = new Date('2026-04-18T10:00:00.000Z')

function makeMock() {
  // agreements: one active, one matured
  // payout_schedule 1st call: quarter payouts (empty)
  // payout_schedule 2nd call: overdue payouts
  return createSupabaseMock({
    agreements: [
      [
        { id: 'a1', status: 'active', principal_amount: 100000, maturity_date: '2030-01-01' },
        { id: 'a2', status: 'matured', principal_amount: 50000, maturity_date: '2025-01-01' },
      ],
    ],
    payout_schedule: [
      [], // quarter payouts
      [{ net_interest: 1500 }], // overdue payouts — 1 payout from an active agreement
    ],
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(TODAY)
})

describe('getDashboardKPIs — overdue query', () => {
  it('joins agreements to exclude payouts from deleted/inactive agreements', async () => {
    const mock = makeMock()
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    await getDashboardKPIs()

    // Find the payout_schedule builder that has .eq('status', 'overdue')
    const overdueBuilder = mock._allBuilders.find(
      b =>
        b.table === 'payout_schedule' &&
        b.builder._calls.some(
          c => c.method === 'eq' && c.args[0] === 'status' && c.args[1] === 'overdue'
        )
    )

    expect(overdueBuilder, 'overdue payout_schedule query not found').toBeDefined()

    const calls = overdueBuilder!.builder._calls

    // Must select the agreements join so the DB can filter by them
    const selectCall = calls.find(c => c.method === 'select')
    expect(selectCall?.args[0], 'select must include agreements!inner join').toMatch(
      /agreements!inner/
    )

    // Must filter to active agreements only
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['agreements.status', 'active'] })
    )

    // Must exclude deleted agreements
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'is', args: ['agreements.deleted_at', null] })
    )
  })

  it('includes overdue_amount in returned KPIs', async () => {
    const mock = makeMock()
    vi.mocked(createAdminClient).mockReturnValue(mock as unknown as ReturnType<typeof createAdminClient>)

    const kpis = await getDashboardKPIs()

    expect(kpis.overdue_amount).toBe(1500)
  })
})
