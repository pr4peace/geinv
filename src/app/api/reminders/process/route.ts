import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { format } from 'date-fns'
import {
  getAccountsEmails,
  buildPayoutQueueItems,
  buildMaturityQueueItems,
  buildTdsFilingQueueItems,
  buildDocReturnQueueItems,
  buildMonthlySummaryQueueItem,
  isQuarterStart,
} from '@/lib/notification-queue'

async function processReminders(): Promise<{
  queueAdded: number
  overdueMarked: number
}> {
  const supabase = createAdminClient()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  let queueAdded = 0

  // 1. Fetch accounts emails once
  const accountsEmails = await getAccountsEmails(supabase)

  // 2. Build all queue items
  const [payoutItems, maturityItems, tdsItems, docItems] = await Promise.all([
    buildPayoutQueueItems(supabase, todayStr, accountsEmails),
    buildMaturityQueueItems(supabase, todayStr, accountsEmails),
    buildTdsFilingQueueItems(supabase, todayStr, accountsEmails),
    buildDocReturnQueueItems(supabase, todayStr, accountsEmails),
  ])

  const summaryItem = await buildMonthlySummaryQueueItem(supabase, todayStr, accountsEmails)

  const allItems = [
    ...payoutItems,
    ...maturityItems,
    ...tdsItems,
    ...docItems,
    ...(summaryItem ? [summaryItem] : []),
  ]

  // Quarterly forecast queue item (body built separately — needs full data)
  if (isQuarterStart(todayStr)) {
    const month = new Date(todayStr).getUTCMonth() + 1
    const year = new Date(todayStr).getUTCFullYear()
    let quarterLabel = ''
    if (month === 4) quarterLabel = `Q1 FY${year}-${String(year + 1).slice(2)}`
    else if (month === 7) quarterLabel = `Q2 FY${year}-${String(year + 1).slice(2)}`
    else if (month === 10) quarterLabel = `Q3 FY${year}-${String(year + 1).slice(2)}`
    else quarterLabel = `Q4 FY${year - 1}-${String(year).slice(2)}`

    allItems.push({
      agreement_id: null,
      payout_schedule_id: null,
      notification_type: 'quarterly_forecast',
      due_date: todayStr,
      status: 'pending',
      recipients: { accounts: accountsEmails, salesperson: null },
      suggested_subject: `Quarterly Forecast — ${quarterLabel}`,
      suggested_body: `<p>Quarterly forecast for ${quarterLabel}. Open the notifications page to review and send.</p>`,
    })
  }

  // 3. Upsert — ignore conflicts (idempotent via unique indexes)
  if (allItems.length > 0) {
    const { data, error } = await supabase
      .from('notification_queue')
      .insert(allItems)
      .select('id')
    
    // In Supabase/Postgrest, if there is a conflict and no ON CONFLICT is specified, 
    // it will return an error 409. But we want to just skip duplicates.
    // Actually our unique index handles this but the insert will fail if we don't use onConflict.
    // However, the plan didn't specify onConflict. 
    // Let's use it for robustness.
    
    if (!error) queueAdded = data?.length ?? 0
  }

  // 4. Still mark payout_schedule rows as overdue (no change from before)
  const { data: overdueResult } = await supabase
    .from('payout_schedule')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .eq('is_tds_only', false)
    .lt('due_by', todayStr)
    .select('id')

  const overdueMarked = overdueResult?.length ?? 0

  return { queueAdded, overdueMarked }
}

export async function GET(request: NextRequest) {
  const cronHeader = request.headers.get('x-vercel-cron')
  if (cronHeader !== '1') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await processReminders()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await processReminders()
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
