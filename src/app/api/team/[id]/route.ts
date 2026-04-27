import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole !== 'coordinator' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const supabase = createAdminClient()
    const body = await request.json()
    const { id } = params

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const { is_active } = body as { is_active: boolean }

    if (typeof is_active !== 'boolean') {
      return NextResponse.json(
        { error: 'is_active (boolean) is required' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase
      .from('team_members')
      .update({ is_active })
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
