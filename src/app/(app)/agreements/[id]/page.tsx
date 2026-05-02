import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import Link from 'next/link'
import { ArrowLeft, Bell, FileText, User, AlertTriangle, Shield, Activity, Mail } from 'lucide-react'
import type {
  Agreement,
  PayoutSchedule,
  Reminder,
  TeamMember,
} from '@/types/database'
import DocLifecycleStepper from '@/components/agreements/DocLifecycleStepper'
import UploadSignedButton from '@/components/agreements/UploadSignedButton'
import DeleteAgreementButton from '@/components/agreements/DeleteAgreementButton'
import RescanModal from '@/components/agreements/RescanModal'
import AuditLog from '@/components/agreements/AuditLog'
import PayoutScheduleSection from '@/components/agreements/PayoutScheduleSection'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Types ───────────────────────────────────────────────────────────────────

type AgreementDetail = Agreement & {
  salesperson: TeamMember | null
  payout_schedule: PayoutSchedule[]
  reminders: Reminder[]
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

function reminderTypeLabel(type: string): string {
  const map: Record<string, string> = {
    payout: 'Payout',
    maturity: 'Maturity',
    tds_filing: 'TDS Filing',
    doc_return: 'Doc Return',
    monthly_summary: 'Monthly Summary',
    quarterly_forecast: 'Quarterly Forecast',
    payout_monthly_summary: 'Monthly Summary',
  }
  return map[type] ?? type
}

function NotificationSourceBadge({ source }: { source: string }) {
  if (source === 'reminder') return null
  return (
    <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-indigo-900/40 text-indigo-400 border border-indigo-800/50">
      QUEUE
    </span>
  )
}

function ReminderStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-900/40 text-amber-400',
    sent: 'bg-green-900/40 text-green-400',
    failed: 'bg-red-900/40 text-red-400',
    dismissed: 'bg-slate-700 text-slate-400',
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${map[status] ?? 'bg-slate-700 text-slate-300'}`}
    >
      {status}
    </span>
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
  const { payout_schedule, reminders, salesperson, investor } = agreement as AgreementDetail & { investor?: { id: string; name: string } }
  const salespersonName = salesperson?.name ?? agreement.salesperson_custom ?? '—'
  const nominees = Array.isArray(agreement.nominees) ? agreement.nominees : []

  // ─── Unified notifications (reminders + notification_queue) ───
  type UnifiedNotification = {
    id: string
    type: string
    dueDate: string | null
    scheduledAt: string
    status: string
    sentAt: string | null
    subject: string | null
    source: 'reminder' | 'notification_queue'
  }

  const unifiedNotifications: UnifiedNotification[] = [
    ...reminders.map(r => ({
      id: r.id, type: r.reminder_type, dueDate: null, scheduledAt: r.scheduled_at,
      status: r.status, sentAt: r.sent_at, subject: r.email_subject, source: 'reminder' as const,
    })),
    ...(notificationQueueEntries ?? []).map(n => ({
      id: n.id, type: n.notification_type, dueDate: n.due_date, scheduledAt: n.created_at,
      status: n.status, sentAt: n.sent_at, subject: n.suggested_subject, source: 'notification_queue' as const,
    })),
  ].sort((a, b) => (b.dueDate ?? b.scheduledAt).localeCompare(a.dueDate ?? a.scheduledAt))

  // ─── TDS summary ───
  const tdsByFY: Record<string, { gross: number; tds: number; net: number }> = {}
  for (const row of payout_schedule) {
    if (row.is_principal_repayment) continue
    const fy = getFY(row.due_by ?? row.period_to)
    if (!tdsByFY[fy]) tdsByFY[fy] = { gross: 0, tds: 0, net: 0 }
    tdsByFY[fy].gross += row.gross_interest
    tdsByFY[fy].tds += row.tds_amount
    tdsByFY[fy].net += row.net_interest
  }
  const fyTotals = Object.entries(tdsByFY).sort(([a], [b]) => a.localeCompare(b))

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
          <SectionLabel icon={<Shield className="w-4 h-4 text-slate-400" />} label="Data — Agreement Details" />

          {/* Agreement fields */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <Field label="Agreement Date" value={fmtDate(agreement.agreement_date)} />
              <Field label="Investment Start Date" value={fmtDate(agreement.investment_start_date)} />
              <Field label="Agreement Type" value={fmt(agreement.agreement_type)} />
              <Field label="Principal Amount" value={fmtCurrency(agreement.principal_amount)} />
              <Field label="ROI" value={agreement.roi_percentage != null ? `${agreement.roi_percentage}%` : '—'} />
              <Field label="Payout Frequency" value={fmtFrequency(agreement.payout_frequency)} />
              <Field label="Interest Type" value={fmtInterestType(agreement.interest_type)} />
              <Field label="Lock-in Years" value={agreement.lock_in_years != null ? `${agreement.lock_in_years} yrs` : '—'} />
              <Field label="Maturity Date" value={fmtDate(agreement.maturity_date)} />
              <Field label="Salesperson" value={salespersonName} />
              <Field label="TDS Filing Name" value={fmt(agreement.tds_filing_name)} />
              {(agreement.payments ?? []).length > 0 && (
                <div className="sm:col-span-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Payments</p>
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

          {/* Payout Schedule + TDS Summary */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            <PayoutScheduleSection
              agreementId={agreement.id}
              payouts={payout_schedule}
              userRole={userRole}
            />

            {/* TDS Summary by FY */}
            {fyTotals.length > 0 && (
              <div className="mt-5 pt-5 border-t border-slate-700/50">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">TDS Summary by Financial Year</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-700/50 text-xs text-slate-400">
                        <th className="pb-2 text-left pr-6">Financial Year</th>
                        <th className="pb-2 text-right pr-6">Gross Interest</th>
                        <th className="pb-2 text-right pr-6">TDS</th>
                        <th className="pb-2 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fyTotals.map(([fy, totals]) => (
                        <tr key={fy} className="border-b border-slate-700/30">
                          <td className="py-2 pr-6 font-medium text-slate-200">{fy}</td>
                          <td className="py-2 pr-6 text-right tabular-nums text-slate-300">{fmtCurrency(totals.gross)}</td>
                          <td className="py-2 pr-6 text-right tabular-nums text-red-400">{fmtCurrency(totals.tds)}</td>
                          <td className="py-2 text-right tabular-nums text-emerald-400 font-medium">{fmtCurrency(totals.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Original Document */}
          {agreement.document_url && (
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
          )}
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
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* SECTION 3: NOTIFICATIONS — What's been sent / pending             */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-4">
          <SectionLabel icon={<Mail className="w-4 h-4 text-slate-400" />} label="Notifications & Reminders" />

          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-5">
            {unifiedNotifications.length === 0 ? (
              <p className="text-slate-500 text-sm italic">No notifications or reminders for this agreement.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50 text-xs text-slate-400">
                      <th className="pb-2 text-left pr-4 whitespace-nowrap">Type</th>
                      <th className="pb-2 text-left pr-4 whitespace-nowrap">Due Date</th>
                      <th className="pb-2 text-center pr-4 whitespace-nowrap">Status</th>
                      <th className="pb-2 text-left pr-4 whitespace-nowrap">Sent At</th>
                      <th className="pb-2 text-left whitespace-nowrap">Subject</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unifiedNotifications.map((n) => {
                      const todayStr = new Date().toISOString().split('T')[0]
                      const isOverdue = n.status === 'pending' && n.dueDate && n.dueDate < todayStr
                      return (
                        <tr key={n.id} className={`border-b border-slate-700/30 hover:bg-slate-700/10 ${isOverdue ? 'bg-red-900/5' : ''}`}>
                          <td className="py-2.5 pr-4">
                            <span className={`inline-flex items-center gap-1.5 ${isOverdue ? 'text-red-400 font-semibold' : 'text-slate-300'}`}>
                              <Bell className="w-3 h-3 flex-shrink-0" />
                              <span className="whitespace-nowrap">{reminderTypeLabel(n.type)}</span>
                              <NotificationSourceBadge source={n.source} />
                            </span>
                          </td>
                          <td className="py-2.5 pr-4 whitespace-nowrap">
                            {n.dueDate ? (
                              <span className={isOverdue ? 'text-red-400 font-medium' : 'text-slate-400'}>
                                {fmtDate(n.dueDate)}
                                {isOverdue && <span className="ml-1 text-[10px] font-bold uppercase text-red-400">(overdue)</span>}
                              </span>
                            ) : (
                              <span className="text-slate-400">{fmtDate(n.scheduledAt)}</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-4 text-center"><ReminderStatusBadge status={n.status} /></td>
                          <td className="py-2.5 pr-4 whitespace-nowrap text-slate-400">{n.sentAt ? fmtDate(n.sentAt) : '—'}</td>
                          <td className="py-2.5 text-slate-400 max-w-xs truncate">{n.subject ?? '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Audit Log ── */}
        <AuditLog entries={(auditEntries ?? []) as Parameters<typeof AuditLog>[0]['entries']} />

      </div>
    </div>
  )
}
