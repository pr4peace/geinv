import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    const { data: investor, error } = await supabase
      .from('investors')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !investor) {
      return NextResponse.json({ error: 'Investor not found' }, { status: 404 })
    }

    const { data: agreements } = await supabase
      .from('agreements')
      .select('id, reference_id, agreement_date, investment_start_date, maturity_date, principal_amount, roi_percentage, payout_frequency, interest_type, status, is_draft, deleted_at')
      .eq('investor_id', id)
      .is('deleted_at', null)
      .order('agreement_date', { ascending: false })

    return NextResponse.json({ ...investor, agreements: agreements ?? [] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from('investors')
      .update(body)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createAdminClient()

    // Guard: Check for non-deleted agreements
    const { data: agreements, error: agreementError } = await supabase
      .from('agreements')
      .select('id, reference_id, status')
      .eq('investor_id', id)
      .is('deleted_at', null)

    if (agreementError) {
      return NextResponse.json({ error: agreementError.message }, { status: 500 })
    }

    if (agreements && agreements.length > 0) {
      return NextResponse.json(
        { 
          error: 'Investor has active agreements', 
          agreements 
        }, 
        { status: 409 }
      )
    }

    // No agreements: safe to delete
    const { error: deleteError, count } = await supabase
      .from('investors')
      .delete({ count: 'exact' })
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 400 })
    }

    if (count === 0) {
      return NextResponse.json({ error: 'Investor not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
