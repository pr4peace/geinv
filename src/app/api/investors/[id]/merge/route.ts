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

    // Verify both investors exist
    const [{ data: source }, { data: target }] = await Promise.all([
      supabase.from('investors').select('id, name').eq('id', id).single(),
      supabase.from('investors').select('id, name').eq('id', into).single(),
    ])

    if (!source || !target) {
      return NextResponse.json({ error: 'Investor not found' }, { status: 404 })
    }

    // Re-point all agreements from source → target
    const { error: updateError } = await supabase
      .from('agreements')
      .update({ investor_id: into })
      .eq('investor_id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Re-point all notes from source → target
    await supabase
      .from('investor_notes')
      .update({ investor_id: into })
      .eq('investor_id', id)

    // Delete the source investor (now orphaned)
    const { error: deleteError } = await supabase
      .from('investors')
      .delete()
      .eq('id', id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, merged_into: target.name })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
