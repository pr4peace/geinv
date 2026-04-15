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
