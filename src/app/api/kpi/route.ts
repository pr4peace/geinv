import { NextRequest, NextResponse } from 'next/server'
import { getDashboardKPIs, getQuarterlyForecast, getFrequencyBreakdown } from '@/lib/kpi'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const quarter = searchParams.get('quarter') ?? undefined

    const [kpis, forecast, frequency] = await Promise.all([
      getDashboardKPIs(),
      getQuarterlyForecast(quarter),
      getFrequencyBreakdown(),
    ])

    return NextResponse.json({ kpis, forecast, frequency })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
