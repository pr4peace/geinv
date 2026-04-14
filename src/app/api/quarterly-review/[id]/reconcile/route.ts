import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  parseIncomingFundsExcel,
  parseTDSExcel,
  reconcileIncomingFunds,
  reconcileTDS,
} from '@/lib/reconciliation'
import type { ReconciliationResult } from '@/types/database'
import { parseISO } from 'date-fns'

async function downloadFileFromUrl(url: string): Promise<Buffer> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download file from ${url}: ${response.statusText}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    const body = await request.json()
    const { type } = body as { type: 'incoming_funds' | 'tds' | 'both' }

    if (!type || !['incoming_funds', 'tds', 'both'].includes(type)) {
      return NextResponse.json(
        { error: "type must be 'incoming_funds', 'tds', or 'both'" },
        { status: 400 }
      )
    }

    // Fetch the quarterly review record
    const { data: review, error: reviewError } = await supabase
      .from('quarterly_reviews')
      .select('*')
      .eq('id', id)
      .single()

    if (reviewError || !review) {
      return NextResponse.json({ error: 'Quarterly review not found' }, { status: 404 })
    }

    const quarterStart = parseISO(review.quarter_start)
    const quarterEnd = parseISO(review.quarter_end)

    let incomingFundsResult: ReconciliationResult | null = null
    let tdsResult: ReconciliationResult | null = null

    // Incoming funds reconciliation
    if (type === 'incoming_funds' || type === 'both') {
      if (!review.incoming_funds_doc_url) {
        return NextResponse.json(
          { error: 'No incoming funds document uploaded for this review' },
          { status: 400 }
        )
      }

      const fileBuffer = await downloadFileFromUrl(review.incoming_funds_doc_url)
      const payments = parseIncomingFundsExcel(fileBuffer)

      // Fetch all active agreements
      const { data: agreements, error: agreementsError } = await supabase
        .from('agreements')
        .select('*')
        .eq('status', 'active')

      if (agreementsError) {
        return NextResponse.json({ error: agreementsError.message }, { status: 500 })
      }

      incomingFundsResult = reconcileIncomingFunds(
        payments,
        agreements ?? [],
        quarterStart,
        quarterEnd
      )
    }

    // TDS reconciliation
    if (type === 'tds' || type === 'both') {
      if (!review.tds_doc_url) {
        return NextResponse.json(
          { error: 'No TDS document uploaded for this review' },
          { status: 400 }
        )
      }

      const fileBuffer = await downloadFileFromUrl(review.tds_doc_url)
      const tdsEntries = parseTDSExcel(fileBuffer)

      // Fetch paid payouts and their agreements
      const { data: payouts, error: payoutsError } = await supabase
        .from('payout_schedule')
        .select('*, agreement:agreements(*)')
        .eq('status', 'paid')

      if (payoutsError) {
        return NextResponse.json({ error: payoutsError.message }, { status: 500 })
      }

      const { data: agreements, error: agreementsError } = await supabase
        .from('agreements')
        .select('*')

      if (agreementsError) {
        return NextResponse.json({ error: agreementsError.message }, { status: 500 })
      }

      tdsResult = reconcileTDS(
        tdsEntries,
        payouts ?? [],
        agreements ?? [],
        quarterStart,
        quarterEnd
      )
    }

    // Build updates
    const updates: Record<string, unknown> = {}

    if (incomingFundsResult !== null) {
      updates.incoming_funds_result = incomingFundsResult
      updates.incoming_funds_status = 'completed'
    }

    if (tdsResult !== null) {
      updates.tds_result = tdsResult
      updates.tds_status = 'completed'
    }

    // If both are now completed (either this run or previously), mark overall status completed
    const incomingComplete =
      type === 'incoming_funds' || type === 'both'
        ? true
        : review.incoming_funds_status === 'completed'
    const tdsComplete =
      type === 'tds' || type === 'both'
        ? true
        : review.tds_status === 'completed'

    if (incomingComplete && tdsComplete) {
      updates.status = 'completed'
    }

    await supabase.from('quarterly_reviews').update(updates).eq('id', id)

    const result = incomingFundsResult ?? tdsResult
    return NextResponse.json({ result })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
