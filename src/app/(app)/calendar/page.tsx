import { createAdminClient } from '@/lib/supabase/admin'
import CalendarGrid, { CalendarEvent } from '@/components/calendar/CalendarGrid'

export const dynamic = 'force-dynamic'

function formatCurrency(amount: number | null): string {
  if (amount == null) return ''
  return '₹' + Math.round(amount).toLocaleString('en-IN')
}

export default async function CalendarPage() {
  const supabase = createAdminClient()

  // Fetch payout schedule joined with agreements
  const { data: payouts } = await supabase
    .from('payout_schedule')
    .select(
      'id, agreement_id, due_by, gross_interest, tds_amount, net_interest, status, is_principal_repayment, agreement:agreements!inner(id, investor_name, reference_id, is_draft, maturity_date, status, deleted_at)'
    )
    .eq('is_principal_repayment', false)
    .eq('agreement.status', 'active')
    .is('agreement.deleted_at', null)

  // Fetch active agreements for maturity dates
  const { data: agreements } = await supabase
    .from('agreements')
    .select('id, investor_name, reference_id, maturity_date, is_draft, status')
    .eq('status', 'active')
    .is('deleted_at', null)

  // Fetch pending reminders with agreement info
  const { data: reminders } = await supabase
    .from('reminders')
    .select('id, agreement_id, reminder_type, scheduled_at, agreements!inner(investor_name, status, deleted_at)')
    .eq('status', 'pending')
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .gte('scheduled_at', new Date().toISOString())

  const events: CalendarEvent[] = []

  // Process payout events
  for (const payout of payouts ?? []) {
    if (!payout.due_by) continue

    const agreement = Array.isArray(payout.agreement)
      ? payout.agreement[0]
      : payout.agreement

    if (!agreement) continue

    const status = payout.status as string
    let type: CalendarEvent['type']
    if (status === 'overdue') {
      type = 'payout_overdue'
    } else if (status === 'paid') {
      type = 'payout_paid'
    } else {
      // pending, notified, etc.
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
      agreementId: agreement.id,
      isDraft: agreement.is_draft ?? false,
    })
  }

  // Process maturity events
  for (const agreement of agreements ?? []) {
    if (!agreement.maturity_date) continue

    events.push({
      id: `maturity-${agreement.id}`,
      date: agreement.maturity_date,
      label: `Matures: ${agreement.investor_name}`,
      type: 'maturity',
      agreementId: agreement.id,
      isDraft: agreement.is_draft ?? false,
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
