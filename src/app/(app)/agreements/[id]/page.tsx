import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { ArrowLeft, FileText, User, Shield, Activity, Mail } from 'lucide-react'
import type {
  Agreement,
  PayoutSchedule,
  TeamMember,
} from '@/types/database'
import DocLifecycleStepper from '@/components/agreements/DocLifecycleStepper'
import UploadSignedButton from '@/components/agreements/UploadSignedButton'
import DeleteAgreementButton from '@/components/agreements/DeleteAgreementButton'
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

function Field({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <p className="lbl mb-1">{label}</p>
      <p className="text-sm font-medium text-ink-1">{value}</p>
    </div>
  )
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-4 border-b border-hairline pb-2">
      <div className="text-ink-4">{icon}</div>
      <h2 className="text-[10px] uppercase tracking-widest font-bold text-ink-3">{label}</h2>
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
  const statusMap: Record<string, { label: string; dot: string }> = {
    active: { label: 'Active', dot: 'sdot-active' },
    matured: { label: 'Matured', dot: 'sdot-pending' },
    cancelled: { label: 'Cancelled', dot: 'sdot-overdue' },
    combined: { label: 'Combined', dot: 'sdot-pending' },
  }
  const statusStyle = statusMap[agreement.status] ?? { label: agreement.status, dot: 'sdot-pending' }

  return (
    <div className="min-h-screen bg-canvas text-ink-1 font-sans">
      <div className="max-w-5xl mx-auto px-8 py-8 space-y-10">

        {/* Back link */}
        <div className="flex items-center justify-between">
          <Link href="/agreements" className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-ink-4 hover:text-ink-2 transition-colors">
            <ArrowLeft className="w-3 h-3" />
            Back to List
          </Link>
          {isNew === '1' && (
            <Link href="/agreements/new" className="px-3 py-1 bg-forest text-paper text-[10px] font-bold uppercase rounded-sm hover:bg-forest-2 transition-colors shadow-sm">
              + Add Another Agreement
            </Link>
          )}
        </div>

        {/* Header */}
        <div className="border-b border-ink-1 pb-3 mb-5">
          <div className="flex flex-wrap items-end gap-4 justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-[28px] font-semibold text-ink-1 font-serif tracking-tight leading-tight">{agreement.investor_name}</h1>
                {investor?.id && (
                  <Link href={`/investors/${investor.id}`} className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-forest hover:text-ink-1 border border-hairline-strong rounded-full px-2.5 py-0.5 bg-surface transition-colors" title="View investor profile">
                    <User className="w-2.5 h-2.5" />Profile
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`sdot ${statusStyle.dot}`} />
                <p className="text-xs text-ink-4 uppercase tracking-widest font-medium">
                  {agreement.reference_id} · {statusStyle.label}
                  {agreement.is_draft && <span className="ml-2 text-clay italic">· Draft</span>}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              {(agreement.is_draft || !agreement.document_url) && (
                <UploadSignedButton agreementId={agreement.id} label={agreement.document_url ? 'Replace Document' : 'Upload Document'} />
              )}
              <DeleteAgreementButton agreementId={agreement.id} investorName={agreement.investor_name} />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 1: DATA — What the document says                          */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-6">
          <SectionLabel icon={<Shield className="w-3.5 h-3.5" />} label="Agreement Data" />

          {/* Summary Card */}
          <div className="bg-surface border border-hairline rounded-sm shadow-sm p-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-6">
              <div className="flex flex-col">
                <p className="lbl mb-2">Principal</p>
                <p className="text-xl font-bold num text-ink-1">{fmtCurrency(agreement.principal_amount)}</p>
              </div>
              <div className="flex flex-col md:border-l md:border-hairline md:pl-6">
                <p className="lbl mb-2">Total Interest</p>
                <p className="text-xl font-bold num text-gain">{fmtCurrency(totalInterest)}</p>
              </div>
              <div className="flex flex-col md:border-l md:border-hairline md:pl-6">
                <p className="lbl mb-2">Total TDS</p>
                <p className="text-xl font-bold num text-rust">{fmtCurrency(totalTds)}</p>
              </div>
              <div className="flex flex-col md:border-l md:border-hairline md:pl-6">
                <p className="lbl mb-2">Net Payout</p>
                <p className="text-xl font-bold num text-ink-1">{fmtCurrency(netPayout)}</p>
              </div>
              <div className="flex flex-col md:border-l md:border-hairline md:pl-6">
                <p className="lbl mb-2">ROI · Freq</p>
                <div className="flex flex-col">
                  <span className="text-lg font-bold num text-earth-brown leading-tight">
                    {agreement.roi_percentage != null ? `${agreement.roi_percentage}%` : '—'}
                  </span>
                  <span className="text-[10px] uppercase font-bold text-ink-4 tracking-tight">{fmtFrequency(agreement.payout_frequency)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Details & History */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-surface border border-hairline rounded-sm p-6 space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-6">
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
                <div className="pt-6 border-t border-hairline">
                  <p className="lbl mb-4">Payment History</p>
                  <div className="space-y-2">
                    {(agreement.payments ?? []).map((p, i) => (
                      <div key={i} className="flex items-center gap-4 text-[13px] text-ink-2">
                        <span className="num text-ink-4 w-20">{p.date ? fmtDate(p.date) : '—'}</span>
                        <span className="flex-1 italic">{p.mode || 'Payment'} {p.bank ? `via ${p.bank}` : ''}</span>
                        <span className="num font-bold text-ink-1">{p.amount != null ? fmtCurrency(p.amount) : '—'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Applicant Details */}
            <div className="bg-surface border border-hairline rounded-sm flex flex-col divide-y divide-hairline">
              <div className="p-5">
                <h3 className="lbl mb-4 font-bold text-ink-1">Primary Applicant</h3>
                <div className="space-y-4">
                  <Field label="Name" value={fmt(agreement.investor_name)} />
                  <div className="flex gap-6">
                    <Field label="PAN" value={fmt(agreement.investor_pan)} className="flex-1" />
                    <Field label="Aadhaar" value={fmt(agreement.investor_aadhaar)} className="flex-1" />
                  </div>
                  <Field label="Address" value={agreement.investor_address ?? '—'} />
                  {nominees.length > 0 && (
                    <div className="pt-2">
                      <p className="lbl mb-2">Nominees</p>
                      <div className="flex flex-wrap gap-1.5">
                        {nominees.map((n, i) => (
                          <span key={i} className="px-2 py-0.5 bg-canvas border border-hairline rounded-sm text-[10px] text-ink-2 font-medium">
                            {n.name} {n.pan && <span className="num text-ink-4 ml-1">{n.pan}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {(agreement.investor2_name || agreement.investor2_pan) && (
                <div className="p-5 bg-surface-2/50">
                  <h3 className="lbl mb-4 font-bold text-ink-1">Second Applicant</h3>
                  <div className="space-y-4">
                    <Field label="Name" value={fmt(agreement.investor2_name)} />
                    <div className="flex gap-6">
                      <Field label="PAN" value={fmt(agreement.investor2_pan)} className="flex-1" />
                      <Field label="Aadhaar" value={fmt(agreement.investor2_aadhaar)} className="flex-1" />
                    </div>
                    {agreement.investor2_address && <Field label="Address" value={agreement.investor2_address} />}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 2: ACTIONS — What needs to be done                        */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-6">
          <SectionLabel icon={<Activity className="w-3.5 h-3.5" />} label="Operational Actions" />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
              <div className="bg-surface border border-hairline rounded-sm p-6 shadow-sm">
                <p className="lbl mb-6 font-bold text-ink-1">Document Lifecycle</p>
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
            </div>

            <div className="space-y-6">
              <MaturityPayoutCard
                agreementId={agreement.id}
                payouts={payout_schedule}
                principalAmount={agreement.principal_amount ?? undefined}
                maturityDate={agreement.maturity_date}
                userRole={userRole}
              />
              
              <div className="bg-surface-2 border border-hairline rounded-sm p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                  <Mail className="w-3.5 h-3.5 text-ink-4" />
                  <h3 className="lbl font-bold text-ink-1">Notification History</h3>
                </div>
                <Timeline items={timelineItems} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Original Document ── */}
        {agreement.document_url && (
          <div className="space-y-6">
            <SectionLabel icon={<FileText className="w-3.5 h-3.5" />} label="Original Agreement" />
            <div className="bg-surface border border-hairline rounded-sm overflow-hidden shadow-sm">
              {agreement.document_url.toLowerCase().includes('.pdf') || agreement.document_url.includes('content-type=application%2Fpdf') ? (
                <iframe src={agreement.document_url} className="w-full" style={{ minHeight: '500px', height: '70vh' }} title="Agreement Document" />
              ) : (
                <div className="p-12 text-center bg-canvas/30">
                  <a href={agreement.document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 border border-hairline-strong bg-surface text-ink-1 text-[13px] font-semibold rounded-sm hover:bg-surface-2 shadow-sm transition-colors">
                    <FileText className="w-4 h-4" /> Download Document
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Audit Log ── */}
        <div className="pt-10 border-t border-hairline">
          <AuditLog entries={(auditEntries ?? []) as Parameters<typeof AuditLog>[0]['entries']} />
        </div>

      </div>
    </div>
  )
}
