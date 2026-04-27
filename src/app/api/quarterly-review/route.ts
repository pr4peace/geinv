import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const allowedRoles = new Set(['coordinator', 'admin', 'financial_analyst', 'accountant'])

export async function GET(request: NextRequest) {
  try {
    const userRole = request.headers.get('x-user-role') ?? ''
    if (!allowedRoles.has(userRole)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('quarterly_reviews')
      .select('*')
      .order('created_at', { ascending: false })

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
    const userRole = request.headers.get('x-user-role') ?? ''
    if (!allowedRoles.has(userRole)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const supabase = createAdminClient()
    const body = await request.json()

    const { quarter, quarter_start, quarter_end } = body as {
      quarter: string
      quarter_start: string
      quarter_end: string
    }

    if (!quarter || !quarter_start || !quarter_end) {
      return NextResponse.json(
        { error: 'quarter, quarter_start, and quarter_end are required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('quarterly_reviews')
      .insert({
        quarter,
        quarter_start,
        quarter_end,
        incoming_funds_status: 'pending',
        tds_status: 'pending',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
