import { headers } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

export type InvestorRow = {
  id: string
  name: string
  pan: string | null
  aadhaar: string | null
  address: string | null
  birth_year: number | null
  payout_bank_name: string | null
  payout_bank_account: string | null
  payout_bank_ifsc: string | null
  created_at: string
  total_agreements: number
  active_agreements: number
  total_principal: number
}

export async function getInvestors(): Promise<InvestorRow[]> {
  const supabase = createAdminClient()
  const headersList = await headers()
  const userRole = headersList.get('x-user-role')
  const userTeamId = headersList.get('x-user-team-id')

  let investorIds: string[] | null = null

  // RBAC: Salesperson can only see investors linked to their agreements
  if (userRole === 'salesperson') {
    const { data: spAgreements } = await supabase
      .from('agreements')
      .select('investor_id')
      .eq('salesperson_id', userTeamId)
      .is('deleted_at', null)
      .not('investor_id', 'is', null)
    
    investorIds = Array.from(new Set((spAgreements ?? []).map(a => a.investor_id as string)))
    if (investorIds.length === 0) return []
  }

  let query = supabase
    .from('investors')
    .select('id, name, pan, aadhaar, address, birth_year, payout_bank_name, payout_bank_account, payout_bank_ifsc, created_at')
    .order('name', { ascending: true })

  if (investorIds) {
    query = query.in('id', investorIds)
  }

  const { data: investors, error } = await query
  if (error || !investors) return []

  // Get agreement stats per investor
  let agreementQuery = supabase
    .from('agreements')
    .select('investor_id, status, principal_amount')
    .is('deleted_at', null)
    .not('investor_id', 'is', null)

  if (userRole === 'salesperson') {
    agreementQuery = agreementQuery.eq('salesperson_id', userTeamId)
  }

  const { data: agreements } = await agreementQuery

  const statsMap = new Map<string, { total: number; active: number; principal: number }>()
  for (const a of agreements ?? []) {
    if (!a.investor_id) continue
    const existing = statsMap.get(a.investor_id) ?? { total: 0, active: 0, principal: 0 }
    existing.total++
    if (a.status === 'active') existing.active++
    existing.principal += a.principal_amount ?? 0
    statsMap.set(a.investor_id, existing)
  }

  return investors.map((inv) => {
    const stats = statsMap.get(inv.id) ?? { total: 0, active: 0, principal: 0 }
    return {
      ...inv,
      total_agreements: stats.total,
      active_agreements: stats.active,
      total_principal: stats.principal,
    }
  })
}
