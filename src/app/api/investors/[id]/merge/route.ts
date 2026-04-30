import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/investors/[id]/merge
// Body: { into: string }  — merge THIS investor INTO the target investor, then delete this one
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { into } = await request.json() as { into: string }

    if (!into || into === id) {
      return NextResponse.json({ error: 'Invalid merge target' }, { status: 400 })
    }

    const supabase = createAdminClient()
    const userRole = request.headers.get('x-user-role') ?? ''
    const userTeamId = request.headers.get('x-user-team-id') ?? ''

    const { error } = await supabase.rpc('merge_investors', {
      p_source_id: id,
      p_target_id: into,
      p_user_role: userRole,
      p_user_team_id: userTeamId || null
    })

    if (error) {
      const status = error.message.includes('Unauthorized') ? 403 : 
                     error.message.includes('not found') ? 404 : 400
      return NextResponse.json({ error: error.message }, { status })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
