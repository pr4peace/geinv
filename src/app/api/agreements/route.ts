import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReferenceId } from '@/lib/reference-id'
import {
  generatePayoutReminders,
  generateMaturityReminders,
  generateDocReturnReminders,
  type ReminderInput,
} from '@/lib/reminders'
import type { ExtractedPayoutRow } from '@/lib/claude'
import { findOrCreateInvestor } from '@/lib/investors'

import { generateTdsOnlyRows } from '@/lib/tds-calculator'

export async function GET(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role')
    const userTeamId = request.headers.get('x-user-team-id')

    const supabase = createAdminClient()
    const { searchParams } = new URL(request.url)

    const status = searchParams.get('status')
    const payoutFrequency = searchParams.get('payout_frequency')
    const isDraft = searchParams.get('is_draft')
    let salespersonId = searchParams.get('salesperson_id')
    
    // RBAC: Salesperson can only see their own agreements
    if (userRole === 'salesperson') {
      salespersonId = userTeamId
    }

    const sortBy = searchParams.get('sort_by') ?? 'created_at'
    const sortOrder = searchParams.get('sort_order') ?? 'desc'

    const allowedSortColumns = ['principal_amount', 'roi_percentage', 'maturity_date', 'investment_start_date', 'created_at']
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at'
    const ascending = sortOrder === 'asc'

    const showDeleted = searchParams.get('deleted') === 'true'

    let query = supabase
      .from('agreements')
      .select('*, salesperson:team_members!salesperson_id(*)')
      .order(safeSortBy, { ascending })

    if (showDeleted) {
      query = query.not('deleted_at', 'is', null)
    } else {
      query = query.is('deleted_at', null)
    }

    if (status) query = query.eq('status', status)
    if (payoutFrequency) query = query.eq('payout_frequency', payoutFrequency)
    if (isDraft !== null) query = query.eq('is_draft', isDraft === 'true')
    if (salespersonId) query = query.eq('salesperson_id', salespersonId)

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole !== 'coordinator' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const supabase = createAdminClient()
    const body = await request.json()

    const { payout_schedule: payoutScheduleRows, force, temp_path, mark_historical_paid, ...agreementFields } = body as {
      payout_schedule: ExtractedPayoutRow[]
      force?: boolean
      temp_path?: string
      mark_historical_paid?: boolean
      [key: string]: unknown
    }

    // Server-side validation
    const isDraft = agreementFields.is_draft === true

    // Business rule: compound interest always means cumulative payout (single maturity payout)
    if (agreementFields.interest_type === 'compound') {
      agreementFields.payout_frequency = 'cumulative'
    }

    const frequency = agreementFields.payout_frequency as string
    const allowedFrequencies = ['monthly', 'quarterly', 'biannual', 'annual', 'cumulative']

    if (!allowedFrequencies.includes(frequency)) {
      return NextResponse.json({ error: `Invalid payout frequency: ${frequency}` }, { status: 400 })
    }

    // Cumulative/compound agreements have no periodic payouts — TDS rows are generated server-side
    const isCumulativeType = frequency === 'cumulative' || agreementFields.interest_type === 'compound'
    if (!isDraft && !isCumulativeType && (!Array.isArray(payoutScheduleRows) || payoutScheduleRows.length === 0)) {
      return NextResponse.json({ error: 'Payout schedule is required for non-draft agreements' }, { status: 400 })
    }

    // Date validation
    const startDateStr = agreementFields.investment_start_date as string
    const maturityDateStr = agreementFields.maturity_date as string
    if (startDateStr && maturityDateStr) {
      const start = new Date(startDateStr)
      const maturity = new Date(maturityDateStr)
      if (maturity <= start) {
        return NextResponse.json({ error: 'Maturity date must be after investment start date' }, { status: 400 })
      }
    }

    // Ensure lock_in_years is integer
    if (agreementFields.lock_in_years !== undefined) {
      const lockInVal = Number(agreementFields.lock_in_years)
      if (!Number.isInteger(lockInVal)) {
        return NextResponse.json({ error: 'Lock-in years must be an integer' }, { status: 400 })
      }
      agreementFields.lock_in_years = lockInVal
    }

    // Duplicate check — skip only if caller explicitly sets force: true
    if (!force) {
      const sanitize = (s: string) => s.replace(/[,()]/g, '')
      const investorName = sanitize((agreementFields.investor_name as string) ?? '')
      const agreementDate = (agreementFields.agreement_date as string) ?? ''
      const investorPan = sanitize((agreementFields.investor_pan as string | null) ?? '') || null

      let orFilter = `and(investor_name.ilike.${investorName},agreement_date.eq.${agreementDate})`
      if (investorPan) {
        orFilter += `,and(investor_pan.eq.${investorPan},agreement_date.eq.${agreementDate})`
      }

      const { data: dups } = await supabase
        .from('agreements')
        .select('id, reference_id, investor_name, agreement_date, principal_amount, status')
        .neq('status', 'cancelled')
        .is('deleted_at', null)
        .or(orFilter)

      if (dups && dups.length > 0) {
        return NextResponse.json({ duplicates: dups }, { status: 409 })
      }
    }

    // Generate reference_id
    const reference_id = await generateReferenceId()

    // Find or create investor profile
    let investor_id: string | null = null
    const investorName = (agreementFields.investor_name as string) ?? ''
    if (investorName) {
      try {
        investor_id = await findOrCreateInvestor(supabase, {
          name: investorName,
          pan: (agreementFields.investor_pan as string | null) ?? null,
          aadhaar: (agreementFields.investor_aadhaar as string | null) ?? null,
          address: (agreementFields.investor_address as string | null) ?? null,
        })
      } catch {
        // Non-fatal — agreement still saves, just without investor link
      }
    }

    // Insert agreement
    const todayStr = new Date().toISOString().split('T')[0]
    const status = (agreementFields.maturity_date as string) < todayStr ? 'matured' : 'active'

    const { data: agreement, error: agreementError } = await supabase
      .from('agreements')
      .insert({ 
        ...agreementFields, 
        reference_id, 
        investor_id,
        status,
        doc_status: 'draft' // Always start as draft, even if upload
      })
      .select()
      .single()

    if (agreementError) {
      return NextResponse.json({ error: agreementError.message }, { status: 400 })
    }

    // Handle document storage move if temp_path provided
    let finalAgreement = agreement
    if (temp_path) {
      try {
        const ext = temp_path.split('.').pop()?.toLowerCase() || 'pdf'
        const permanentPath = `${agreement.reference_id}/original.${ext}`

        const { error: moveError } = await supabase.storage
          .from('agreements')
          .move(temp_path, permanentPath)

        if (moveError) {
          console.error(`CRITICAL: Failed to move document to permanent path for agreement ${agreement.id}. Temp path: ${temp_path}. Error: ${moveError.message}`)
        } else {
          // If move succeeds, doc is now in its permanent path
          const updatePayload: Record<string, unknown> = {}
          if (!agreementFields.is_draft) {
            updatePayload.doc_status = 'uploaded'
          }

          // Try to generate 1-year signed URL
          const { data: signedData, error: signedError } = await supabase.storage
            .from('agreements')
            .createSignedUrl(permanentPath, 60 * 60 * 24 * 365) // 1 year

          if (signedError || !signedData) {
            console.error('Failed to generate 1-year signed URL:', signedError?.message)
            // Even if URL fails, move was successful, so we should still update doc_status if applicable
          } else {
            updatePayload.document_url = signedData.signedUrl
          }

          if (Object.keys(updatePayload).length > 0) {
            const { data: updated, error: updateError } = await supabase
              .from('agreements')
              .update(updatePayload)
              .eq('id', agreement.id)
              .select()
              .single()

            if (updateError) {
              console.error('Failed to update agreement with permanent document details:', updateError.message)
              return NextResponse.json(
                { error: `Document moved but failed to update agreement record: ${updateError.message}` },
                { status: 500 }
              )
            } else if (updated) {
              finalAgreement = updated
            }
          }
        }
      } catch (err) {
        console.error('Unexpected error during document move:', err)
      }
    }

    // Insert payout schedule rows
    const rows: Array<ExtractedPayoutRow & { is_tds_only?: boolean }> = Array.isArray(payoutScheduleRows)
      ? payoutScheduleRows
          .map((row) => ({
            ...row,
            agreement_id: agreement.id,
            period_from: row.period_from ?? row.due_by ?? null,
            period_to: row.period_to ?? row.due_by ?? null,
          }))
          .filter((row) => row.period_from && row.period_to && row.due_by)
      : []

    // Generate TDS-only rows for cumulative/compound — one per 31 March in the term.
    // This runs regardless of whether extracted rows exist (compounded docs often have none).
    const isCumulative = frequency === 'cumulative' || agreementFields.interest_type === 'compound'
    const hasTdsOnly = rows.some(r => r.is_tds_only)

    if (isCumulative && !hasTdsOnly && startDateStr && maturityDateStr) {
      const tdsOnlyRows = generateTdsOnlyRows({
        agreementId: agreement.id,
        startDate: startDateStr,
        maturityDate: maturityDateStr,
        principal: Number(agreementFields.principal_amount) || 0,
        roi: Number(agreementFields.roi_percentage) || 0,
        interestType: (agreementFields.interest_type as 'simple' | 'compound') || 'simple',
      })

      rows.push(...tdsOnlyRows.map(r => ({ ...r, agreement_id: agreement.id })))
    }

    if (rows.length > 0) {
      const { error: payoutError } = await supabase.from('payout_schedule').insert(rows)
      if (payoutError) {
        await supabase.from('agreements').delete().eq('id', agreement.id)
        return NextResponse.json({ error: `Failed to insert payout schedule: ${payoutError.message}` }, { status: 500 })
      }
    }

    // Mark past payouts as paid if requested (for historical agreements)
    if (mark_historical_paid) {
      const todayStr = new Date().toISOString().split('T')[0]
      await supabase
        .from('payout_schedule')
        .update({ status: 'paid', paid_date: todayStr })
        .eq('agreement_id', agreement.id)
        .lt('due_by', todayStr)
        .eq('is_tds_only', false)
    }

    // Fetch the payout_schedule rows with ids for reminder generation
    const { data: payoutRows, error: fetchPayoutError } = await supabase
      .from('payout_schedule')
      .select('*')
      .eq('agreement_id', agreement.id)
      .order('due_by', { ascending: true })

    if (fetchPayoutError) {
      await supabase.from('agreements').delete().eq('id', agreement.id)
      return NextResponse.json({ error: `Failed to fetch payout schedule for reminders: ${fetchPayoutError.message}` }, { status: 500 })
    }

    // Fetch internal email (coordinator) for reminders
    const { data: internalMembers } = await supabase
      .from('team_members')
      .select('email')
      .eq('role', 'coordinator')
      .eq('is_active', true)
      .limit(1)

    const internalEmail = internalMembers?.[0]?.email ?? 'coordinator@goodearth.org.in'

    // Fetch salesperson email if assigned
    let salespersonEmail: string | null = null
    if (finalAgreement.salesperson_id) {
      const { data: sp } = await supabase
        .from('team_members')
        .select('email')
        .eq('id', finalAgreement.salesperson_id)
        .single()
      salespersonEmail = sp?.email ?? null
    }

    // Build reminder list
    const reminderInputs: ReminderInput[] = []

    for (const payoutRow of payoutRows ?? []) {
      const payoutReminders = generatePayoutReminders(
        finalAgreement,
        payoutRow,
        internalEmail,
        salespersonEmail
      )
      reminderInputs.push(...payoutReminders)
    }

    const maturityReminders = generateMaturityReminders(finalAgreement, internalEmail, salespersonEmail)
    reminderInputs.push(...maturityReminders)

    // Doc return reminders if doc_sent_to_client_date is set
    if (finalAgreement.doc_sent_to_client_date) {
      const docReturnReminders = generateDocReturnReminders(finalAgreement, internalEmail, salespersonEmail)
      reminderInputs.push(...docReturnReminders)
    }

    // Insert reminders
    if (reminderInputs.length > 0) {
      const reminderRows = reminderInputs.map((r) => ({
        agreement_id: r.agreement_id,
        payout_schedule_id: r.payout_schedule_id ?? null,
        reminder_type: r.reminder_type,
        lead_days: r.lead_days,
        scheduled_at: r.scheduled_at.toISOString(),
        status: 'pending',
        email_to: r.email_to,
        email_subject: r.email_subject,
        email_body: r.email_body,
      }))

      const { error: reminderError } = await supabase.from('reminders').insert(reminderRows)
      if (reminderError) {
        // Cleanup: Delete agreement and payouts if reminders fail
        await supabase.from('payout_schedule').delete().eq('agreement_id', agreement.id)
        await supabase.from('agreements').delete().eq('id', agreement.id)
        return NextResponse.json({ error: `Failed to insert reminders: ${reminderError.message}` }, { status: 500 })
      }
    }

    return NextResponse.json(finalAgreement, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
