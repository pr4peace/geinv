import { createAdminClient } from '@/lib/supabase/admin'
import { addDays, format, parseISO } from 'date-fns'

export interface QuarterlyForecast {
  quarter: string
  quarterStart: Date
  quarterEnd: Date
  payouts: Array<{
    id: string
    agreement_id: string
    investor_name: string
    reference_id: string
    payout_frequency: string
    due_by: string
    gross_interest: number
    tds_amount: number
    net_interest: number
    is_principal_repayment: boolean
    status: string
    is_draft: boolean
  }>
  maturities: Array<{
    agreement_id: string
    investor_name: string
    reference_id: string
    principal_amount: number
    maturity_date: string
  }>
  totals: {
    gross_interest: number
    tds_amount: number
    net_interest: number
    principal_maturing: number
  }
}

export interface DashboardKPIs {
  active_principal: number
  active_agreements: number
  matured_principal: number
  matured_agreements: number
  quarter_gross_interest: number
  quarter_tds: number
  quarter_net_interest: number
  overdue_count: number
  overdue_amount: number
  maturing_in_90_days: Array<{
    investor_name: string
    principal_amount: number
    maturity_date: string
    reference_id: string
  }>
}

export interface FrequencyBreakdown {
  quarterly: { count: number; principal: number; total_expected_interest: number }
  annual: { count: number; principal: number; total_expected_interest: number }
  cumulative: { count: number; principal: number; total_expected_interest: number }
}

export function getQuarterLabel(date: Date = new Date()): string {
  const month = date.getMonth() // 0-indexed
  // Indian financial year: Apr=Q1, Jul=Q2, Oct=Q3, Jan=Q4
  const year = date.getFullYear()
  if (month >= 3 && month <= 5) return `Q1-${year}-${String(year + 1).slice(2)}`
  if (month >= 6 && month <= 8) return `Q2-${year}-${String(year + 1).slice(2)}`
  if (month >= 9 && month <= 11) return `Q3-${year}-${String(year + 1).slice(2)}`
  // Jan-Mar is Q4 of previous financial year
  return `Q4-${year - 1}-${String(year).slice(2)}`
}

export function getIndianFinancialQuarterBounds(date: Date = new Date()): { start: Date; end: Date } {
  const month = date.getMonth()
  const year = date.getFullYear()

  if (month >= 3 && month <= 5) return { start: new Date(year, 3, 1), end: new Date(year, 5, 30) }
  if (month >= 6 && month <= 8) return { start: new Date(year, 6, 1), end: new Date(year, 8, 30) }
  if (month >= 9 && month <= 11) return { start: new Date(year, 9, 1), end: new Date(year, 11, 31) }
  return { start: new Date(year - 1, 3, 1), end: new Date(year, 2, 31) }
}

export async function getDashboardKPIs(): Promise<DashboardKPIs> {
  const supabase = createAdminClient()
  const now = new Date()
  const { start: qStart, end: qEnd } = getIndianFinancialQuarterBounds(now)
  const in90Days = addDays(now, 90)

  // Active + matured agreements
  const { data: agreements, error: agreementsError } = await supabase
    .from('agreements')
    .select('id, investor_name, principal_amount, maturity_date, reference_id, status')
    .in('status', ['active', 'matured'])
    .is('deleted_at', null)
  if (agreementsError) throw new Error(`Failed to fetch agreements: ${agreementsError.message}`)

  const allAgreements = agreements ?? []
  const activeAgreements = allAgreements.filter(a => a.status === 'active')
  const maturedAgreements = allAgreements.filter(a => a.status === 'matured')
  const activePrincipal = activeAgreements.reduce((s, a) => s + a.principal_amount, 0)
  const maturedPrincipal = maturedAgreements.reduce((s, a) => s + a.principal_amount, 0)

  // Quarter payouts
  const { data: quarterPayouts, error: quarterPayoutsError } = await supabase
    .from('payout_schedule')
    .select('gross_interest, tds_amount, net_interest, status, due_by, agreements!inner(status, deleted_at)')
    .gte('due_by', format(qStart, 'yyyy-MM-dd'))
    .lte('due_by', format(qEnd, 'yyyy-MM-dd'))
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
    .eq('is_principal_repayment', false)
    .eq('is_tds_only', false)
  if (quarterPayoutsError) throw new Error(`Failed to fetch quarter payouts: ${quarterPayoutsError.message}`)

  const qPayouts = quarterPayouts ?? []
  const quarterGross = qPayouts.reduce((s, p) => s + p.gross_interest, 0)
  const quarterTds = qPayouts.reduce((s, p) => s + p.tds_amount, 0)
  const quarterNet = qPayouts.reduce((s, p) => s + p.net_interest, 0)

  // Overdue — join agreements to exclude deleted/inactive ones
  const { data: overduePayouts, error: overduePayoutsError } = await supabase
    .from('payout_schedule')
    .select('net_interest, agreements!inner(status, deleted_at)')
    .eq('status', 'overdue')
    .eq('agreements.status', 'active')
    .is('agreements.deleted_at', null)
  if (overduePayoutsError) throw new Error(`Failed to fetch overdue payouts: ${overduePayoutsError.message}`)

  const overdue = overduePayouts ?? []

  // Maturing in 90 days
  const maturingIn90 = activeAgreements.filter(a => {
    const mat = parseISO(a.maturity_date)
    return mat >= now && mat <= in90Days
  })

  return {
    active_principal: activePrincipal,
    active_agreements: activeAgreements.length,
    matured_principal: maturedPrincipal,
    matured_agreements: maturedAgreements.length,
    quarter_gross_interest: quarterGross,
    quarter_tds: quarterTds,
    quarter_net_interest: quarterNet,
    overdue_count: overdue.length,
    overdue_amount: overdue.reduce((s, p) => s + p.net_interest, 0),
    maturing_in_90_days: maturingIn90.map(a => ({
      investor_name: a.investor_name,
      principal_amount: a.principal_amount,
      maturity_date: a.maturity_date,
      reference_id: a.reference_id,
    })),
  }
}

export function quarterLabelToDate(label: string): Date {
  // Format: Q{1|2|3|4}-{YYYY}-{YY}, e.g. Q4-2025-26, Q1-2026-27
  const match = label.match(/^Q([1-4])-(\d{4})-(\d{2})$/)
  if (!match) return new Date()
  const quarter = parseInt(match[1], 10)
  const firstYear = parseInt(match[2], 10)
  // Q4 spans Jan–Mar of the second year in the label
  if (quarter === 1) return new Date(firstYear, 4, 15)   // May 15
  if (quarter === 2) return new Date(firstYear, 7, 15)   // Aug 15
  if (quarter === 3) return new Date(firstYear, 10, 15)  // Nov 15
  return new Date(firstYear + 1, 1, 15)                  // Feb 15 of second year
}

export async function getQuarterlyForecast(quarterLabel?: string): Promise<QuarterlyForecast> {
  const supabase = createAdminClient()
  const now = new Date()
  const label = quarterLabel ?? getQuarterLabel(now)
  const refDate = quarterLabel ? quarterLabelToDate(quarterLabel) : now
  const { start: qStart, end: qEnd } = getIndianFinancialQuarterBounds(refDate)

  interface PayoutWithAgreement {
    id: string
    agreement_id: string
    due_by: string
    gross_interest: number
    tds_amount: number
    net_interest: number
    is_principal_repayment: boolean
    status: string
    agreements: {
      investor_name: string
      reference_id: string
      payout_frequency: string
      status: string
    }
  }

  const { data: payouts, error: payoutsError } = await supabase
    .from('payout_schedule')
    .select(`
      id, agreement_id, due_by, gross_interest, tds_amount, net_interest,
      is_principal_repayment, status,
      agreements!inner(investor_name, reference_id, payout_frequency, status)
    `)
    .gte('due_by', format(qStart, 'yyyy-MM-dd'))
    .lte('due_by', format(qEnd, 'yyyy-MM-dd'))
    .in('agreements.status', ['active', 'draft'])
    .eq('is_principal_repayment', false)
    .eq('is_tds_only', false)
    .order('due_by')
  if (payoutsError) throw new Error(`Failed to fetch quarterly payouts: ${payoutsError.message}`)

  const { data: maturities, error: maturitiesError } = await supabase
    .from('agreements')
    .select('id, investor_name, reference_id, principal_amount, maturity_date')
    .eq('status', 'active')
    .gte('maturity_date', format(qStart, 'yyyy-MM-dd'))
    .lte('maturity_date', format(qEnd, 'yyyy-MM-dd'))
  if (maturitiesError) throw new Error(`Failed to fetch maturities: ${maturitiesError.message}`)

  const payoutList = (payouts as unknown as PayoutWithAgreement[] ?? []).map((p) => ({
    id: p.id,
    agreement_id: p.agreement_id,
    investor_name: p.agreements.investor_name,
    reference_id: p.agreements.reference_id,
    payout_frequency: p.agreements.payout_frequency,
    due_by: p.due_by,
    gross_interest: p.gross_interest,
    tds_amount: p.tds_amount,
    net_interest: p.net_interest,
    is_principal_repayment: p.is_principal_repayment,
    status: p.status,
    is_draft: p.agreements.status === 'draft',
  }))

  const maturityList = (maturities ?? []).map(a => ({
    agreement_id: a.id,
    investor_name: a.investor_name,
    reference_id: a.reference_id,
    principal_amount: a.principal_amount,
    maturity_date: a.maturity_date,
  }))

  return {
    quarter: label,
    quarterStart: qStart,
    quarterEnd: qEnd,
    payouts: payoutList,
    maturities: maturityList,
    totals: {
      gross_interest: payoutList.reduce((s, p) => s + p.gross_interest, 0),
      tds_amount: payoutList.reduce((s, p) => s + p.tds_amount, 0),
      net_interest: payoutList.reduce((s, p) => s + p.net_interest, 0),
      principal_maturing: maturityList.reduce((s, a) => s + a.principal_amount, 0),
    },
  }
}

export async function getFrequencyBreakdown(): Promise<FrequencyBreakdown> {
  const supabase = createAdminClient()

  const { data: agreements, error: agreementsError } = await supabase
    .from('agreements')
    .select('payout_frequency, principal_amount')
    .eq('status', 'active')
    .is('deleted_at', null)
  if (agreementsError) throw new Error(`Failed to fetch agreements: ${agreementsError.message}`)

  const result: FrequencyBreakdown = {
    quarterly: { count: 0, principal: 0, total_expected_interest: 0 },
    annual: { count: 0, principal: 0, total_expected_interest: 0 },
    cumulative: { count: 0, principal: 0, total_expected_interest: 0 },
  }

  for (const a of agreements ?? []) {
    const freq = a.payout_frequency as keyof FrequencyBreakdown
    if (result[freq]) {
      result[freq].count++
      result[freq].principal += a.principal_amount
    }
  }

  // Get expected interest from payout_schedule for each frequency group
  for (const freq of ['quarterly', 'annual', 'cumulative'] as const) {
    const { data: freqPayouts, error: freqPayoutsError } = await supabase
      .from('payout_schedule')
      .select('net_interest, agreements!inner(payout_frequency, status)')
      .eq('agreements.payout_frequency', freq)
      .eq('agreements.status', 'active')
      .eq('is_principal_repayment', false)
    .eq('is_tds_only', false)
    if (freqPayoutsError) throw new Error(`Failed to fetch ${freq} payouts: ${freqPayoutsError.message}`)

    result[freq].total_expected_interest = (freqPayouts ?? []).reduce(
      (s: number, p: { net_interest: number }) => s + p.net_interest, 0
    )
  }

  return result
}
