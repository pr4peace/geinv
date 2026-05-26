import { createAdminClient } from '@/lib/supabase/admin'
import CalculatorForm from '@/components/agreements/CalculatorForm'

interface TeamMember {
  id: string
  name: string
  role: string
  is_active: boolean
}

export default async function CalculatorPage() {
  const supabase = createAdminClient()
  const { data: teamMembers } = await supabase
    .from('team_members')
    .select('id, name, role, is_active')
    .eq('is_active', true)
    .order('name')

  return (
    <div className="p-8 min-h-screen bg-canvas">
      <div className="mb-6 border-b border-ink-1 pb-3">
        <h1 className="text-[28px] font-semibold text-ink-1 font-serif tracking-tight">New Agreement</h1>
        <p className="text-xs text-ink-4 mt-0.5">Enter investment details — payout schedule updates live</p>
      </div>
      <div className="max-w-5xl">
        <CalculatorForm teamMembers={(teamMembers ?? []) as TeamMember[]} />
      </div>
    </div>
  )
}
