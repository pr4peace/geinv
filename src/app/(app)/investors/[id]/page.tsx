import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, User } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkInvestorAccess } from '@/lib/investors-page'
import InvestorNotes from '@/components/investors/InvestorNotes'
import MergeInvestorButton from '@/components/investors/MergeInvestorButton'
import DeleteInvestorButton from '@/components/investors/DeleteInvestorButton'
import type { Agreement } from '@/types/database'

type InvestorWithAgreements = {
  id: string
  name: string
  pan: string | null
  aadhaar: string | null
  address: string | null
  birth_year: number | null
  created_at: string
  agreements: Pick<
    Agreement,
    | 'id'
    | 'reference_id'
    | 'agreement_date'
    | 'investment_start_date'
    | 'maturity_date'
    | 'principal_amount'
    | 'roi_percentage'
    | 'payout_frequency'
    | 'interest_type'
    | 'status'
    | 'is_draft'
  >[]
}

function fmtCurrency(value: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const statusStyle: Record<string, string> = {
  active: 'bg-green-900/40 text-green-400',
  matured: 'bg-slate-700 text-slate-300',
  cancelled: 'bg-red-900/40 text-red-400',
  combined: 'bg-purple-900/40 text-purple-400',
}

const freqLabel: Record<string, string> = {
  quarterly: 'Quarterly',
  annual: 'Annual',
  cumulative: 'Cumulative',
  monthly: 'Monthly',
  biannual: 'Bi-Annual',
}

export default async function InvestorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!(await checkInvestorAccess(id))) {
    notFound()
  }

  const supabase = createAdminClient()

  const { data: investor, error } = await supabase
    .from('investors')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !investor) notFound()

  const [{ data: notes }, { data: allInvestors }] = await Promise.all([
    supabase.from('investor_notes').select('*').eq('investor_id', id).order('created_at', { ascending: false }),
    supabase.from('investors').select('id, name').order('name', { ascending: true }),
  ])

  const { data: agreements } = await supabase
    .from('agreements')
    .select(
      'id, reference_id, agreement_date, investment_start_date, maturity_date, principal_amount, roi_percentage, payout_frequency, interest_type, status, is_draft'
    )
    .eq('investor_id', id)
    .is('deleted_at', null)
    .order('agreement_date', { ascending: false })

  const inv = investor as InvestorWithAgreements
  const agrs = (agreements ?? []) as InvestorWithAgreements['agreements']

  const totalPrincipal = agrs.reduce((s, a) => s + (a.principal_amount ?? 0), 0)
  const activeCount = agrs.filter((a) => a.status === 'active').length

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        <div className="flex items-center justify-between">
          <Link
            href="/agreements"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            All Agreements
          </Link>

          <DeleteInvestorButton
            investorId={inv.id}
            investorName={inv.name}
            agreementCount={agrs.length}
          />
        </div>

        {/* Header */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
              <User className="w-6 h-6 text-slate-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-slate-100">{inv.name}</h1>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-400">
                {inv.pan && <span>PAN: <span className="text-slate-200 font-mono">{inv.pan}</span></span>}
                {inv.birth_year && <span>Born: <span className="text-slate-200">{inv.birth_year}</span></span>}
                {inv.aadhaar && <span>Aadhaar: <span className="text-slate-200 font-mono">{inv.aadhaar}</span></span>}
              </div>
              {inv.address && (
                <p className="mt-1 text-sm text-slate-400">{inv.address}</p>
              )}
            </div>
          </div>

          {/* Merge */}
          <div className="mt-4">
            <MergeInvestorButton
              investorId={id}
              investorName={inv.name}
              allInvestors={(allInvestors ?? []) as { id: string; name: string }[]}
            />
          </div>

          {/* Stats */}
          <div className="mt-5 pt-5 border-t border-slate-700 grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Total Agreements</p>
              <p className="text-xl font-semibold text-slate-100 mt-0.5">{agrs.length}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Active</p>
              <p className="text-xl font-semibold text-green-400 mt-0.5">{activeCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide">Total Principal</p>
              <p className="text-xl font-semibold text-slate-100 mt-0.5">{fmtCurrency(totalPrincipal)}</p>
            </div>
          </div>
        </div>

        {/* Agreements list */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide">Agreements</h2>
          </div>

          {agrs.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500 text-center">No agreements found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-xs text-slate-500 uppercase tracking-wide">
                  <th className="text-left px-5 py-3">Reference</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-right px-4 py-3">Principal</th>
                  <th className="text-left px-4 py-3">ROI / Freq</th>
                  <th className="text-left px-4 py-3">Maturity</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {agrs.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-5 py-3">
                      <Link
                        href={`/agreements/${a.id}`}
                        className="font-mono text-xs text-indigo-400 hover:text-indigo-300"
                      >
                        {a.reference_id}
                      </Link>
                      {a.is_draft && (
                        <span className="ml-2 text-xs bg-amber-900/40 text-amber-400 px-1.5 py-0.5 rounded">Draft</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{fmtDate(a.agreement_date)}</td>
                    <td className="px-4 py-3 text-right text-slate-200 font-medium">
                      {fmtCurrency(a.principal_amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-400">
                      {a.roi_percentage}% / {freqLabel[a.payout_frequency] ?? a.payout_frequency}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{fmtDate(a.maturity_date)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${statusStyle[a.status] ?? 'bg-slate-700 text-slate-300'}`}
                      >
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Notes */}
        <InvestorNotes
          investorId={id}
          initialNotes={(notes ?? []) as { id: string; note: string; created_at: string }[]}
        />

      </div>
    </div>
  )
}
