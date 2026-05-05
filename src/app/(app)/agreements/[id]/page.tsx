import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { ArrowLeft, FileText, User, AlertTriangle, Shield, Activity, Mail } from 'lucide-react'
import type {
  Agreement,
  PayoutSchedule,
  TeamMember,
} from '@/types/database'
import DocLifecycleStepper from '@/components/agreements/DocLifecycleStepper'
import UploadSignedButton from '@/components/agreements/UploadSignedButton'
import DeleteAgreementButton from '@/components/agreements/DeleteAgreementButton'
import RescanModal from '@/components/agreements/RescanModal'
import AuditLog from '@/components/agreements/AuditLog'
import PendingPayouts from '@/components/agreements/PendingPayouts'
import PendingTdsFilings from '@/components/agreements/PendingTdsFilings'
import MaturityPayoutCard from '@/components/agreements/MaturityPayoutCard'
import Timeline from '@/components/agreements/Timeline'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ───────────────────────────────────────────────────────────────────

type AgreementDetail = Agreement & {
  salesperson: TeamMember | null
  payout_schedule: PayoutSchedule[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(value: string | null | undefined): string {
  return value ?? '—'
}

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function fmtCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}

function fmtFrequency(freq: string): string {
  return { quarterly: 'Quarterly', annual: 'Annual', cumulative: 'Cumulative', biannual: 'Biannual', monthly: 'Monthly' }[freq] ?? freq
}

function fmtInterestType(t: string): string {
  return { simple: 'Simple', compound: 'Compound' }[t] ?? t
}

function getFY(dateStr: string): string {
  const d = new Date(dateStr)
  const m = d.getMonth()
  const y = d.getFullYear()
  if (m >= 3) return `FY ${y}-${String(y + 1).slice(2)}`
  return `FY ${y - 1}-${String(y).slice(2)}`
}

// ─── Sub-components (server) ──────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-slate-200">{value}</p>
    </div>
  )
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="p-1.5 rounded-lg bg-slate-800 border border-slate-700">{icon}</div>
      <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider">{label}</h2>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AgreementDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ new?: string }>
}) {
  const { id } = await params
  const { new: isNew } = await searchParams
  const headersList = await headers()
  const userRole = headersList.get('x-user-role') ?? ''
  const userTeamId = headersList.get('x-user-team-id') ?? ''
  const supabase = createAdminClient()

  const { data: rawAgreement, error } = await supabase
    .from('agreements')
    .select(`
      *,
      salesperson:team_members!salesperson_id(*),
      investor:investors!investor_id(*),
      payout_schedule(*),
      reminders(*)
    `)
    .eq('id', id)
    .single()

  if (error || !rawAgreement) {
    notFound()
  }

  if (userRole === 'salesperson' && rawAgreement.salesperson_id !== userTeamId) {
    notFound()
  }

  const { data: auditEntries } = await supabase
    .from('agreement_audit_log')
    .select('*')
    .eq('agreement_id', id)
    .order('created_at', { ascending: false })

  const { data: notificationQueueEntries } = await supabase
    .from('notification_queue')
    .select('*')
    .eq('agreement_id', id)
    .order('due_date', { ascending: true })

  const agreement = rawAgreement as unknown as AgreementDetail
  const { payout_schedule, salesperson, investor } = agreement as AgreementDetail & { investor?: { id: string; name: string } }
  const salespersonName = salesperson?.name ?? agreement.salesperson_custom ?? '—'
  const nominees = Array.isArray(agreement.nominees) ? agreement.nominees : []

  // ─── Compute totals ───
  const interestRows = payout_schedule.filter(r => !r.is_tds_only)

  let totalInterest = 0
  let totalTds = 0
  for (const row of interestRows) {
    if (row.is_principal_repayment) {
      const interestComponent = (row.gross_interest ?? 0) - (agreement.principal_amount ?? 0)
      totalInterest += Math.max(0, interestComponent)
      totalTds += row.tds_amount ?? 0
    } else {
      totalInterest += row.gross_interest ?? 0
      totalTds += row.tds_amount ?? 0
    }
  }
  const netPayout = totalInterest - totalTds

  // ─── TDS summary by FY ───
  const tdsByFY: Record<string, { gross: number; tds: number; net: number }> = {}
  for (const row of payout_schedule) {
    if (row.is_principal_repayment) continue
    const fy = getFY(row.due_by ?? row.period_to)
    if (!tdsByFY[fy]) tdsByFY[fy] = { gross: 0, tds: 0, net: 0 }
    tdsByFY[fy].gross += row.gross_interest ?? 0
    tdsByFY[fy].tds += row.tds_amount ?? 0
    tdsByFY[fy].net += row.net_interest ?? 0
  }

  // ─── Timeline items (notification_queue only) ───
  type TimelineItem = {
    id: string
    type: string
    dueDate: string | null
    status: string
    sentAt: string | null
    subject: string | null
  }

  const timelineItems: TimelineItem[] = (notificationQueueEntries ?? []).map(n => ({
    id: n.id,
    type: n.notification_type,
    dueDate: n.due_date,
    status: n.status,
    sentAt: n.sent_at,
    subject: n.suggested_subject,
  }))

  // ─── Status ───
  const statusMap: Record<string, { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'bg-green-900/40 text-green-400' },
    matured: { label: 'Matured', cls: 'bg-slate-700 text-slate-300' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-900/40 text-red-400' },
    combined: { label: 'Combined', cls: 'bg-purple-900/40 text-purple-400' },
  }
  const statusStyle = statusMap[agreement.status] ?? { label: agreement.status, cls: 'bg-slate-700 text-slate-300' }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* Back link */}
        <div className="flex items-center justify-between">
          <Link href="/agreements" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            All Agreements
          </Link>
          {isNew === '1' && (
            <Link href="/agreements/new" className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors">
              + Add another agreement
            </Link>
          )}
        </div>

        {/* Header */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-100">{agreement.investor_name}</h1>
                {investor?.id && (
                  <Link href={`/investors/${investor.id}`} className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-800 rounded-full px-2 py-0.5 transition-colors" title="View investor profile">
                    <User className="w-3 h-3" />Profile
                  </Link>
                )}
              </div>
              <p className="mt-0.5 text-sm text-slate-500 font-mono">{agreement.reference_id}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyle.cls}`}>{statusStyle.label}</span>
              {agreement.is_draft && <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-900/40 text-amber-400">DRAFT</span>}
              {agreement.document_url && <RescanModal agreementId={agreement.id} userRole={userRole} />}
              {(agreement.is_draft || !agreement.document_url) && (
                <UploadSignedButton agreementId={agreement.id} label={agreement.document_url ? 'Replace Document' : 'Upload Document'} />
              )}
              <DeleteAgreementButton agreementId={agreement.id} investorName={agreement.investor_name} />
            </div>
          </div>
        </div>

        {/* ── Rescan Banner ── */}
        {agreement.rescan_required && (
          <div className="bg-amber-900/20 border border-amber-700/50 rounded-xl p-4 flex gap-4 items-center">
            <div className="p-2 bg-amber-500/20 rounded-lg"><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-200">Rescan Recommended</h3>
              <p className="text-xs text-amber-400/80 mt-0.5">This agreement was uploaded with an older extraction model. Rescan to ensure accuracy.</p>
            </div>
            <RescanModal agreementId={agreement.id} userRole={userRole} />
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 1: DATA — What the document says                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-6">
          <SectionLabel icon={<Shield className="w-4 h-4 text-slate-400" />} label="Data" />

          {/* Summary Card — cascading numbers */}
          <div className="bg-gradient-to-br from-slate-800 to-slate-800/80 border border-slate-700/50 rounded-xl p-5">
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
              <div className="sm:col-span-1">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Principal</p>
                <p className="text-lg font-bold text-slate-100 text-right">{fmtCurrency(agreement.principal_amount)}</p>
              </div>
              <div className="sm:border-l sm:border-slate-700 sm:pl-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total Interest</p>
                <p className="text-lg font-bold text-emerald-400 text-right">{fmtCurrency(totalInterest)}</p>
              </div>
              <div className="sm:border-l sm:border-slate-700 sm:pl-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Total TDS</p>
                <p className="text-lg font-bold text-red-400 text-right">{fmtCurrency(totalTds)}</p>
              </div>
              <div className="sm:border-l sm:border-slate-700 sm:pl-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">Net Payout</p>
                <p className="text-lg font-bold text-slate-100 text-right">{fmtCurrency(netPayout)}</p>
              </div>
              <div className="sm:border-l sm:border-slate-700 sm:pl-4">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">ROI / Freq</p>
                <p className="text-lg font-bold text-indigo-400 text-right">
                  {agreement.roi_percentage != null ? `${agreement.roi_percentage}%` : '—'}
                </p>
                <p className="text-[10px] text-slate-500 text-right">{fmtFrequency(agreement.payout_frequency)}</p>
              </div>
            </div>
          </div>

          {/* Agreement Details */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <Field label="Agreement Date" value={fmtDate(agreement.agreement_date)} />
              <Field label="Investment Start" value={fmtDate(agreement.investment_start_date)} />
              <Field label="Agreement Type" value={fmt(agreement.agreement_type)} />
              <Field label="Interest Type" value={fmtInterestType(agreement.interest_type)} />
              <Field label="Lock-in" value={agreement.lock_in_years != null ? `${agreement.lock_in_years} yrs` : '—'} />
              <Field label="Maturity Date" value={fmtDate(agreement.maturity_date)} />
              <Field label="Salesperson" value={salespersonName} />
              <Field label="TDS Filing Name" value={fmt(agreement.tds_filing_name)} />
            </div>

            {(agreement.payments ?? []).length > 0 && (
              <div className="mt-4 pt-4 border-t border-slate-700/50">
                <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Payment History</p>
                <div className="space-y-1">
                  {(agreement.payments ?? []).map((p, i) => (
                    <div key={i} className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-200">
                      {p.date && <span>{fmtDate(p.date)}</span>}
                      {p.mode && <span className="text-slate-400">{p.mode}</span>}
                      {p.bank && <span className="text-slate-400">{p.bank}</span>}
                      {p.amount != null && <span className="font-medium">{fmtCurrency(p.amount)}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Applicants */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">First Applicant</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Field label="Name" value={fmt(agreement.investor_name)} />
                <Field label="PAN" value={fmt(agreement.investor_pan)} />
                <Field label="Aadhaar" value={fmt(agreement.investor_aadhaar)} />
                <div className="col-span-2">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Address</p>
                  <p className="text-sm text-slate-200 whitespace-pre-line">{agreement.investor_address ?? '—'}</p>
                </div>
              </div>
              {nominees.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Nominees</p>
                  <div className="flex flex-wrap gap-1.5">
                    {nominees.map((n, i) => (
                      <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-700 text-slate-200 text-xs">
                        <span className="font-medium">{n.name}</span>
                        {n.pan && <span className="text-slate-400 font-mono">{n.pan}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {(agreement.investor2_name || agreement.investor2_pan) && (
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Second Applicant</h3>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="Name" value={fmt(agreement.investor2_name)} />
                  <Field label="PAN" value={fmt(agreement.investor2_pan)} />
                  <Field label="Aadhaar" value={fmt(agreement.investor2_aadhaar)} />
                  {agreement.investor2_address && (
                    <div className="col-span-2">
                      <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Address</p>
                      <p className="text-sm text-slate-200 whitespace-pre-line">{agreement.investor2_address}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 2: ACTIONS — What needs to be done                        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4">
          <SectionLabel icon={<Activity className="w-4 h-4 text-slate-400" />} label="Actions" />

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <DocLifecycleStepper
              agreementId={agreement.id}
              docStatus={agreement.doc_status}
              docSentToClientDate={agreement.doc_sent_to_client_date}
              docReturnedDate={agreement.doc_returned_date}
            />
          </div>

          <PendingPayouts
            agreementId={agreement.id}
            payouts={payout_schedule}
            userRole={userRole}
          />

          <PendingTdsFilings
            payouts={payout_schedule}
            userRole={userRole}
          />

          <MaturityPayoutCard
            agreementId={agreement.id}
            payouts={payout_schedule}
            principalAmount={agreement.principal_amount ?? undefined}
            userRole={userRole}
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 3: TIMELINE — Notifications & Reminders                   */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4">
          <SectionLabel icon={<Mail className="w-4 h-4 text-slate-400" />} label="Timeline" />

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <Timeline items={timelineItems} />
          </div>
        </div>

        {/* ── Original Document ── */}
        {agreement.document_url && (
          <div className="space-y-4">
            <SectionLabel icon={<FileText className="w-4 h-4 text-slate-400" />} label="Document" />
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              {agreement.document_url.toLowerCase().includes('.pdf') || agreement.document_url.includes('content-type=application%2Fpdf') ? (
                <iframe src={agreement.document_url} className="w-full" style={{ minHeight: '500px', height: '70vh' }} title="Agreement Document" />
              ) : (
                <div className="p-5">
                  <a href={agreement.document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors">
                    <FileText className="w-4 h-4" /> Download Document
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Audit Log ── */}
        <AuditLog entries={(auditEntries ?? []) as Parameters<typeof AuditLog>[0]['entries']} />

      </div>
    </div>
  )
}
