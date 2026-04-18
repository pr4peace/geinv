import { getDashboardKPIs, getQuarterlyForecast, getFrequencyBreakdown } from '@/lib/kpi'
import KPICards from '@/components/dashboard/KPICards'
import ForecastPanel from '@/components/dashboard/ForecastPanel'
import UpcomingPayouts from '@/components/dashboard/UpcomingPayouts'
import FrequencyBreakdownPanel from '@/components/dashboard/FrequencyBreakdown'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [kpis, forecast, frequency] = await Promise.all([
    getDashboardKPIs().catch(() => null),
    getQuarterlyForecast().catch(() => null),
    getFrequencyBreakdown().catch(() => null),
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

      {/* 5b. Quarterly Forecast Panel */}
      {forecast ? (
        <ForecastPanel initialForecast={forecast} />
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-slate-400 text-sm">
          Could not load quarterly forecast.
        </div>
      )}

      {/* 5c. Frequency Breakdown */}
      {frequency ? (
        <FrequencyBreakdownPanel frequency={frequency} />
      ) : null}

      {/* 5d. Upcoming Payouts */}
      {forecast ? (
        <UpcomingPayouts payouts={forecast.payouts} />
      ) : null}
    </div>
  )
}
