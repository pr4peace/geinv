import { NextRequest, NextResponse } from 'next/server'
import { getDashboardKPIs, getQuarterlyForecast, getFrequencyBreakdown } from '@/lib/kpi'

export async function GET(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role') ?? ''
    const userTeamId = request.headers.get('x-user-team-id') ?? ''
    const salespersonId = userRole === 'salesperson' ? userTeamId : undefined

    const { searchParams } = new URL(request.url)
    const quarter = searchParams.get('quarter') ?? undefined

    const [kpis, forecast, frequency] = await Promise.all([
      getDashboardKPIs(salespersonId),
      getQuarterlyForecast(quarter, salespersonId),
      getFrequencyBreakdown(salespersonId),
    ])

    return NextResponse.json({ kpis, forecast, frequency })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
