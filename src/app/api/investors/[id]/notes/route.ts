import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const userRole = request.headers.get('x-user-role') ?? ''
  const userTeamId = request.headers.get('x-user-team-id') ?? ''

  if (userRole === 'salesperson') {
    const { count } = await supabase
      .from('agreements')
      .select('id', { count: 'exact', head: true })
      .eq('investor_id', id)
      .eq('salesperson_id', userTeamId)
      .is('deleted_at', null)

    if ((count ?? 0) === 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
  }

  const { data, error } = await supabase
    .from('investor_notes')
    .select('*')
    .eq('investor_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createAdminClient()

  const userRole = request.headers.get('x-user-role') ?? ''
  const userTeamId = request.headers.get('x-user-team-id') ?? ''

  if (userRole === 'salesperson') {
    const { count } = await supabase
      .from('agreements')
      .select('id', { count: 'exact', head: true })
      .eq('investor_id', id)
      .eq('salesperson_id', userTeamId)
      .is('deleted_at', null)

    if ((count ?? 0) === 0) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }
  }

  const { note } = await request.json()

  if (!note?.trim()) {
    return NextResponse.json({ error: 'Note cannot be empty' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('investor_notes')
    .insert({ investor_id: id, note: note.trim() })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json(data, { status: 201 })
}
