import { getDashboardKPIs, getQuarterlyForecast, getFrequencyBreakdown } from '@/lib/kpi'
import { createAdminClient } from '@/lib/supabase/admin'
import KPICards from '@/components/dashboard/KPICards'
import FrequencyBreakdownPanel from '@/components/dashboard/FrequencyBreakdown'
import ForecastPanel from '@/components/dashboard/ForecastPanel'
import UpcomingPayouts from '@/components/dashboard/UpcomingPayouts'
import AgreementsTable from '@/components/dashboard/AgreementsTable'
import type { Agreement } from '@/types/database'

export const dynamic = 'force-dynamic'

async function getAgreements(): Promise<Agreement[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('agreements')
    .select('*, salesperson:team_members!salesperson_id(*)')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Failed to fetch agreements:', error.message)
    return []
  }
  return (data ?? []) as Agreement[]
}

export default async function DashboardPage() {
  const [kpis, forecast, frequency, agreements] = await Promise.all([
    getDashboardKPIs().catch(() => null),
    getQuarterlyForecast().catch(() => null),
    getFrequencyBreakdown().catch(() => null),
    getAgreements().catch(() => [] as Agreement[]),
  ])

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-950">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">Good Earth Investment Tracker</p>
        </div>
      </div>

      {/* 5a. KPI Cards */}
      {kpis ? (
        <KPICards kpis={kpis} />
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-slate-400 text-sm">
          Could not load KPIs.
        </div>
      )}

      {/* 5c. Frequency Breakdown */}
      {frequency ? (
        <FrequencyBreakdownPanel frequency={frequency} />
      ) : null}

      {/* 5b. Quarterly Forecast Panel */}
      {forecast ? (
        <ForecastPanel initialForecast={forecast} />
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-slate-400 text-sm">
          Could not load quarterly forecast.
        </div>
      )}

      {/* 5d. Upcoming Payouts */}
      {forecast ? (
        <UpcomingPayouts payouts={forecast.payouts} />
      ) : null}

      {/* 5e. Agreements Table */}
      <AgreementsTable agreements={agreements} />
    </div>
  )
}
