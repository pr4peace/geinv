import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import CalendarGrid, { CalendarEvent } from '@/components/calendar/CalendarGrid'

export const dynamic = 'force-dynamic'

function formatCurrency(amount: number | null): string {
  if (amount == null) return ''
  return '₹' + Math.round(amount).toLocaleString('en-IN')
}

export default async function CalendarPage() {
  const headersList = await headers()
  const userRole = headersList.get('x-user-role') ?? ''
  const userTeamId = headersList.get('x-user-team-id') ?? ''
  const isSalesperson = userRole === 'salesperson'

  const supabase = createAdminClient()

  // 1. Fetch active non-draft agreement IDs
  // This avoids the bug where joined filters are silently ignored
  let agreementsQuery = supabase
    .from('agreements')
    .select('id, investor_name, reference_id, maturity_date, is_draft, status, interest_type')
    .eq('status', 'active')
    .eq('is_draft', false)
    .is('deleted_at', null)

  if (isSalesperson) {
    agreementsQuery = agreementsQuery.eq('salesperson_id', userTeamId)
  }

  const { data: activeAgreements } = await agreementsQuery

  const activeIds = (activeAgreements ?? []).map(a => a.id)

  if (activeIds.length === 0) {
    return (
      <div className="h-full flex flex-col bg-slate-950 text-slate-100">
        <CalendarGrid events={[]} initialYear={new Date().getFullYear()} initialMonth={new Date().getMonth()} />
      </div>
    )
  }

  // 2. Fetch payout schedule for active agreements
  const { data: payouts } = await supabase
    .from('payout_schedule')
    .select(
      'id, agreement_id, due_by, gross_interest, net_interest, status, is_principal_repayment, agreement:agreements(investor_name, payout_frequency, interest_type)'
    )
    .in('agreement_id', activeIds)
    .eq('is_principal_repayment', false)

  // 3. Fetch pending reminders for active agreements
  const { data: reminders } = await supabase
    .from('reminders')
    .select('id, agreement_id, reminder_type, scheduled_at, agreements(investor_name)')
    .in('agreement_id', activeIds)
    .eq('status', 'pending')
    .gte('scheduled_at', new Date().toISOString())

  const events: CalendarEvent[] = []

  // Process payout events
  for (const payout of payouts ?? []) {
    if (!payout.due_by) continue

    const agreement = Array.isArray(payout.agreement)
      ? payout.agreement[0]
      : payout.agreement

    if (!agreement) continue

    // SKIP payout events for cumulative or compound agreements to avoid double-count with maturity event
    // Compound agreements collapse all interest into the maturity payout
    if (agreement.payout_frequency === 'cumulative' || agreement.interest_type === 'compound') continue

    const status = payout.status as string
    let type: CalendarEvent['type']
    if (status === 'overdue') {
      type = 'payout_overdue'
    } else if (status === 'paid') {
      type = 'payout_paid'
    } else {
      type = 'payout_pending'
    }

    const netAmount = payout.net_interest ?? payout.gross_interest
    const amountStr = formatCurrency(netAmount)
    const label = amountStr
      ? `${agreement.investor_name} ${amountStr}`
      : agreement.investor_name

    events.push({
      id: `payout-${payout.id}`,
      date: payout.due_by,
      label,
      type,
      agreementId: payout.agreement_id,
      isDraft: false,
    })
  }

  // Process maturity events
  for (const agreement of activeAgreements ?? []) {
    if (!agreement.maturity_date) continue

    events.push({
      id: `maturity-${agreement.id}`,
      date: agreement.maturity_date,
      label: `Matures: ${agreement.investor_name}`,
      type: 'maturity',
      agreementId: agreement.id,
      isDraft: false,
    })
  }

  // Process reminder events
  for (const reminder of reminders ?? []) {
    if (!reminder.scheduled_at) continue
    const agreement = Array.isArray(reminder.agreements)
      ? reminder.agreements[0]
      : reminder.agreements
    if (!agreement) continue

    const dateStr = reminder.scheduled_at.slice(0, 10)
    const typeLabel = reminder.reminder_type === 'maturity' ? 'Maturity reminder' : 'Payout reminder'
    events.push({
      id: `reminder-${reminder.id}`,
      date: dateStr,
      label: `${typeLabel}: ${agreement.investor_name}`,
      type: 'reminder',
      agreementId: reminder.agreement_id,
      isDraft: false,
    })
  }

  const now = new Date()
  const initialYear = now.getFullYear()
  const initialMonth = now.getMonth() // 0-indexed

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      <CalendarGrid
        events={events}
        initialYear={initialYear}
        initialMonth={initialMonth}
      />
    </div>
  )
}
