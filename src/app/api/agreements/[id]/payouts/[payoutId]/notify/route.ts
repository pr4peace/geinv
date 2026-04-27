import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendAccountsNotification } from '@/lib/email'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; payoutId: string }> }
) {
  try {
    const userRole = request.headers.get('x-user-role')
    if (userRole === 'salesperson') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id, payoutId } = await params
    const supabase = createAdminClient()

    // Fetch the payout row
    const { data: payout, error: payoutError } = await supabase
      .from('payout_schedule')
      .select('*')
      .eq('id', payoutId)
      .eq('agreement_id', id)
      .single()

    if (payoutError || !payout) {
      return NextResponse.json({ error: 'Payout not found' }, { status: 404 })
    }

    // Fetch the agreement
    const { data: agreement, error: agreementError } = await supabase
      .from('agreements')
      .select('*')
      .eq('id', id)
      .single()

    if (agreementError || !agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    // Fetch Valli's email (accountant)
    const { data: accountants, error: accountantError } = await supabase
      .from('team_members')
      .select('email')
      .eq('role', 'accountant')
      .eq('is_active', true)
      .limit(1)

    if (accountantError || !accountants?.length) {
      return NextResponse.json({ error: 'Accountant not found' }, { status: 404 })
    }

    const accountsEmail = accountants[0].email

    const result = await sendAccountsNotification({ agreement, payout, accountsEmail })

    if (!result.success) {
      return NextResponse.json({ error: `Email failed: ${result.error}` }, { status: 500 })
    }

    // Update payout status to 'notified'
    const { error: updateError } = await supabase
      .from('payout_schedule')
      .update({ status: 'notified' })
      .eq('id', payoutId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
