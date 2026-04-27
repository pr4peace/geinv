import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateReferenceId } from '@/lib/reference-id'
import { findOrCreateInvestor } from '@/lib/investors'
import { calculatePayoutSchedule } from '@/lib/payout-calculator'

export interface ImportRow {
  investor_name: string
  investor_pan: string | null
  investor_aadhaar: string | null
  investor_address: string | null
  investor_birth_year: number | null
  investor2_name: string | null
  investor2_pan: string | null
  investor2_aadhaar: string | null
  investor2_address: string | null
  investor2_birth_year: number | null
  principal_amount: number
  roi_percentage: number
  interest_type: 'simple' | 'compound'
  payout_frequency: 'quarterly' | 'annual' | 'cumulative' | 'monthly' | 'biannual'
  agreement_date: string
  investment_start_date: string
  maturity_date: string
  lock_in_years: number
  status: 'active' | 'matured' | 'cancelled' | 'combined'
  doc_status: 'draft' | 'partner_signed' | 'sent_to_client' | 'returned' | 'uploaded'
}

export async function POST(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole !== 'coordinator' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const supabase = createAdminClient()
    const { rows } = (await request.json()) as { rows: ImportRow[] }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
    }

    // Only matured agreements can be bulk imported
    const blockedRows = rows.filter((r) => r.status !== 'matured')
    if (blockedRows.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot import ${blockedRows.length} non-matured agreement(s). Only Expired/Matured agreements can be bulk imported.`,
          blocked: blockedRows.map((r) => `${r.investor_name} (${r.status})`),
        },
        { status: 422 }
      )
    }

    let imported = 0
    let skipped = 0
    const errors: string[] = []

    for (const row of rows) {
      try {
        // Duplicate check
        let orFilter = `and(investor_name.ilike.${row.investor_name},agreement_date.eq.${row.agreement_date})`
        if (row.investor_pan) {
          orFilter += `,and(investor_pan.eq.${row.investor_pan},agreement_date.eq.${row.agreement_date})`
        }

        const { data: dups } = await supabase
          .from('agreements')
          .select('id')
          .is('deleted_at', null)
          .or(orFilter)

        if (dups && dups.length > 0) {
          skipped++
          continue
        }

        // Find or create investor profile
        let investor_id: string | null = null
        try {
          investor_id = await findOrCreateInvestor(supabase, {
            name: row.investor_name,
            pan: row.investor_pan,
            aadhaar: row.investor_aadhaar,
            address: row.investor_address,
            birth_year: row.investor_birth_year,
          })
        } catch { /* non-fatal */ }

        const reference_id = await generateReferenceId()

        const { data: agreement, error: agreementError } = await supabase
          .from('agreements')
          .insert({
            reference_id,
            investor_id,
            investor_name: row.investor_name,
            investor_pan: row.investor_pan,
            investor_aadhaar: row.investor_aadhaar,
            investor_address: row.investor_address,
            investor_birth_year: row.investor_birth_year,
            investor2_name: row.investor2_name,
            investor2_pan: row.investor2_pan,
            investor2_aadhaar: row.investor2_aadhaar,
            investor2_address: row.investor2_address,
            investor2_birth_year: row.investor2_birth_year,
            principal_amount: row.principal_amount,
            roi_percentage: row.roi_percentage,
            interest_type: row.interest_type,
            payout_frequency: row.payout_frequency,
            agreement_date: row.agreement_date,
            investment_start_date: row.investment_start_date,
            maturity_date: row.maturity_date,
            lock_in_years: row.lock_in_years,
            status: row.status,
            doc_status: row.doc_status,
            is_draft: false,
            nominees: [],
          })
          .select('id')
          .single()

        if (agreementError || !agreement) {
          errors.push(`${row.investor_name}: ${agreementError?.message ?? 'Insert failed'}`)
          continue
        }

        // Payout schedule (all paid)
        const payoutRows = calculatePayoutSchedule({
          principal: row.principal_amount,
          roiPercentage: row.roi_percentage,
          payoutFrequency: row.payout_frequency,
          interestType: row.interest_type,
          startDate: row.investment_start_date,
          maturityDate: row.maturity_date,
        })

        if (payoutRows.length > 0) {
          await supabase.from('payout_schedule').insert(
            payoutRows.map((p) => ({ ...p, agreement_id: agreement.id }))
          )
        }

        // Audit log — tag as csv_import so they can be bulk-undone
        await supabase.from('agreement_audit_log').insert({
          agreement_id: agreement.id,
          change_type: 'created',
          new_values: { source: 'csv_import' },
        })

        imported++
      } catch (err) {
        errors.push(`${row.investor_name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({ imported, skipped, errors })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE — soft-delete all agreements imported via CSV
export async function DELETE(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole !== 'coordinator' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const supabase = createAdminClient()

    // Find all agreements tagged as csv_import in audit log
    const { data: auditRows, error: auditError } = await supabase
      .from('agreement_audit_log')
      .select('agreement_id')
      .eq('change_type', 'created')
      .contains('new_values', { source: 'csv_import' })

    if (auditError) {
      return NextResponse.json({ error: auditError.message }, { status: 500 })
    }

    if (!auditRows || auditRows.length === 0) {
      return NextResponse.json({ deleted: 0 })
    }

    const ids = Array.from(new Set(auditRows.map((r) => r.agreement_id)))
    const deletedAt = new Date().toISOString()

    const { error: deleteError } = await supabase
      .from('agreements')
      .update({ deleted_at: deletedAt })
      .in('id', ids)
      .is('deleted_at', null)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // Audit each deletion
    await supabase.from('agreement_audit_log').insert(
      ids.map((id) => ({
        agreement_id: id,
        change_type: 'deleted',
        new_values: { deleted_at: deletedAt, reason: 'undo_csv_import' },
      }))
    )

    return NextResponse.json({ deleted: ids.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
