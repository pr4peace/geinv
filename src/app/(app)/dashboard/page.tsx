import { format } from 'date-fns'
import {
  getPayoutReminders,
  getMaturingAgreements,
  getDocsPendingReturn,
} from '@/lib/dashboard-reminders'
import PayoutReminders from '@/components/dashboard/PayoutReminders'
import MaturingSection from '@/components/dashboard/MaturingSection'
import DocReturnSection from '@/components/dashboard/DocReturnSection'
import SendReminderSummaryButton from '@/components/dashboard/SendReminderSummaryButton'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [payouts, maturing, docs] = await Promise.all([
    getPayoutReminders().catch(() => ({ overdue: [], thisMonth: [], netTotal: 0 })),
    getMaturingAgreements().catch(() => ({ agreements: [], totalPrincipal: 0 })),
    getDocsPendingReturn().catch(() => []),
  ])

  const monthLabel = format(new Date(), 'MMMM yyyy')

  return (
    <div className="p-4 sm:p-6 space-y-8 min-h-screen bg-slate-950 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-xs text-slate-500 mt-0.5">{monthLabel}</p>
        </div>
        <SendReminderSummaryButton />
      </div>

      {/* Section 1: Interest Payouts */}
      <PayoutReminders
        overdue={payouts.overdue}
        thisMonth={payouts.thisMonth}
        netTotal={payouts.netTotal}
        monthLabel={format(new Date(), 'MMMM')}
      />

      <hr className="border-slate-800" />

      {/* Section 2: Maturing This Month */}
      <MaturingSection
        agreements={maturing.agreements}
        totalPrincipal={maturing.totalPrincipal}
        monthLabel={monthLabel}
      />

      <hr className="border-slate-800" />

      {/* Section 3: Docs Pending Return */}
      <DocReturnSection docs={docs} />
    </div>
  )
}
