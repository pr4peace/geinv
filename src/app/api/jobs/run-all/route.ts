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

async function processNotifications() {
  const supabase = createAdminClient()
  const todayStr = format(new Date(), 'yyyy-MM-dd')
  let queueAdded = 0

  const accountsEmails = await getAccountsEmails(supabase)

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

  for (const item of allItems) {
    const { error } = await supabase.from('notification_queue').insert(item)
    if (!error) {
      queueAdded++
    } else if (error.code !== '23505') {
      console.error('notification_queue insert error:', error.message)
    }
  }

  const { data: overdueResult } = await supabase
    .from('payout_schedule')
    .update({ status: 'overdue' })
    .eq('status', 'pending')
    .eq('is_tds_only', false)
    .lt('due_by', todayStr)
    .select('id')

  return { queueAdded, overdueMarked: overdueResult?.length ?? 0 }
}

async function syncMaturedStatus() {
  const supabase = createAdminClient()
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const { data, error } = await supabase
    .from('agreements')
    .select('id, maturity_date, status')
    .eq('status', 'active')
    .lte('maturity_date', todayStr)
    .is('deleted_at', null)

  if (error || !data) return { matured: 0 }

  let matured = 0
  for (const agreement of data) {
    const { error: updateError } = await supabase
      .from('agreements')
      .update({ status: 'matured' })
      .eq('id', agreement.id)
    if (!updateError) matured++
  }

  return { matured }
}

async function backfillTdsRows() {
  const supabase = createAdminClient()

  const { data: agreements, error } = await supabase
    .from('agreements')
    .select('id, investment_start_date, maturity_date, payout_frequency, principal_amount, roi_percentage')
    .is('deleted_at', null)

  if (error || !agreements) return { backfilled: 0 }

  let backfilled = 0
  for (const agreement of agreements) {
    const { data: existingRows } = await supabase
      .from('payout_schedule')
      .select('id')
      .eq('agreement_id', agreement.id)
      .eq('is_tds_only', true)

    if (existingRows && existingRows.length > 0) continue

    // Simple backfill: create one TDS row per FY
    const startYear = new Date(agreement.investment_start_date).getFullYear()
    const endYear = agreement.maturity_date ? new Date(agreement.maturity_date).getFullYear() : startYear + 10

    for (let fy = startYear; fy <= endYear; fy++) {
      const { error: insertError } = await supabase
        .from('payout_schedule')
        .insert({
          agreement_id: agreement.id,
          period_from: `${fy}-04-01`,
          period_to: `${fy + 1}-03-31`,
          due_by: `${fy + 1}-04-30`,
          gross_interest: 0,
          tds_amount: 0,
          net_interest: 0,
          is_tds_only: true,
          tds_filed: false,
        })
      if (!insertError) backfilled++
    }
  }

  return { backfilled }
}

export async function POST(request: NextRequest) {
  const userRole = request.headers.get('x-user-role')
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  const isAuthorized =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    userRole === 'coordinator' ||
    userRole === 'admin'

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  try {
    const [notifications, matured, tds] = await Promise.all([
      processNotifications(),
      syncMaturedStatus(),
      backfillTdsRows(),
    ])

    return NextResponse.json({
      notifications,
      matured,
      tds,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 },
    )
  }
}
