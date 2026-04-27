import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Bell, FileText, User } from 'lucide-react'
import type {
  Agreement,
  PayoutSchedule,
  Reminder,
  TeamMember,
} from '@/types/database'
import DocLifecycleStepper from '@/components/agreements/DocLifecycleStepper'
import UploadSignedButton from '@/components/agreements/UploadSignedButton'
import DeleteAgreementButton from '@/components/agreements/DeleteAgreementButton'
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
  return { quarterly: 'Quarterly', annual: 'Annual', cumulative: 'Cumulative' }[freq] ?? freq
}

function fmtInterestType(t: string): string {
  return { simple: 'Simple', compound: 'Compound' }[t] ?? t
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

function SectionCard({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-4">
        {title}
      </h2>
      {children}
    </div>
  )
}

// ─── Reminder type icon + label ───────────────────────────────────────────────

function reminderTypeLabel(type: string): string {
  const map: Record<string, string> = {
    payout: 'Payout',
    maturity: 'Maturity',
    doc_return: 'Doc Return',
    quarterly_forecast: 'Quarterly Forecast',
  }
  return map[type] ?? type
}

function ReminderStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-900/40 text-amber-400',
    sent: 'bg-green-900/40 text-green-400',
    failed: 'bg-red-900/40 text-red-400',
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-xs font-semibold capitalize ${map[status] ?? 'bg-slate-700 text-slate-300'}`}
    >
      {status}
    </span>
  )
}

// ─── TDS Summary ─────────────────────────────────────────────────────────────

function getIndianFYQuarterLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const month = date.getMonth() // 0-indexed
  const year = date.getFullYear()
  if (month >= 3 && month <= 5) return `Q1 ${year}-${String(year + 1).slice(2)}`
  if (month >= 6 && month <= 8) return `Q2 ${year}-${String(year + 1).slice(2)}`
  if (month >= 9 && month <= 11) return `Q3 ${year}-${String(year + 1).slice(2)}`
  return `Q4 ${year - 1}-${String(year).slice(2)}`
}

function buildTdsSummary(rows: PayoutSchedule[]) {
  const byQuarter: Record<string, { gross: number; tds: number; net: number; sortKey: string }> = {}
  for (const row of rows) {
    if (!row.due_by || row.is_principal_repayment) continue
    const label = getIndianFYQuarterLabel(row.due_by)
    const parts = label.split(' ')
    const qNum = parseInt(parts[0].slice(1), 10)
    const fyYear = parseInt(parts[1].split('-')[0], 10)
    const sortKey = `${fyYear}-${qNum}`
    if (!byQuarter[label]) byQuarter[label] = { gross: 0, tds: 0, net: 0, sortKey }
    byQuarter[label].gross += row.gross_interest
    byQuarter[label].tds += row.tds_amount
    byQuarter[label].net += row.net_interest
  }
  return Object.entries(byQuarter)
    .sort(([, a], [, b]) => a.sortKey.localeCompare(b.sortKey))
    .map(([label, totals]) => [label, totals] as [string, { gross: number; tds: number; net: number; sortKey: string }])
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function AgreementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
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

  const { data: auditEntries } = await supabase
    .from('agreement_audit_log')
    .select('*')
    .eq('agreement_id', id)
    .order('created_at', { ascending: false })

  const agreement = rawAgreement as unknown as AgreementDetail

  const { payout_schedule, reminders, salesperson, investor } = agreement as AgreementDetail & { investor?: { id: string; name: string } }

  const salespersonName =
    salesperson?.name ?? agreement.salesperson_custom ?? '—'

  const tdsSummary = buildTdsSummary(payout_schedule)

  const nominees = Array.isArray(agreement.nominees) ? agreement.nominees : []

  // ─── Status badge ────────────────────────────────────────────────────────
  const statusMap: Record<string, { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'bg-green-900/40 text-green-400' },
    matured: { label: 'Matured', cls: 'bg-slate-700 text-slate-300' },
    cancelled: { label: 'Cancelled', cls: 'bg-red-900/40 text-red-400' },
    combined: { label: 'Combined', cls: 'bg-purple-900/40 text-purple-400' },
  }
  const statusStyle = statusMap[agreement.status] ?? {
    label: agreement.status,
    cls: 'bg-slate-700 text-slate-300',
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">

        {/* Back link */}
        <Link
          href="/agreements"
          className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          All Agreements
        </Link>

        {/* ── Header ── */}
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex flex-wrap items-start gap-4 justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-100">
                  {agreement.investor_name}
                </h1>
                {investor?.id && (
                  <Link
                    href={`/investors/${investor.id}`}
                    className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-800 rounded-full px-2 py-0.5 transition-colors"
                    title="View investor profile"
                  >
                    <User className="w-3 h-3" />
                    Profile
                  </Link>
                )}
              </div>
              <p className="mt-0.5 text-sm text-slate-500 font-mono">
                {agreement.reference_id}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusStyle.cls}`}
              >
                {statusStyle.label}
              </span>
              {agreement.is_draft && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-900/40 text-amber-400">
                  DRAFT
                </span>
              )}
              {(agreement.is_draft || !agreement.document_url) && (
                <UploadSignedButton
                  agreementId={agreement.id}
                  label={agreement.document_url ? 'Replace Document' : 'Upload Document'}
                />
              )}
              <DeleteAgreementButton
                agreementId={agreement.id}
                investorName={agreement.investor_name}
              />
            </div>
          </div>
        </div>

        {/* ── Agreement Fields ── */}
        <SectionCard title="Agreement Details">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <Field label="Agreement Date" value={fmtDate(agreement.agreement_date)} />
            <Field label="Investment Start Date" value={fmtDate(agreement.investment_start_date)} />
            <Field label="Agreement Type" value={fmt(agreement.agreement_type)} />
            <Field label="Principal Amount" value={fmtCurrency(agreement.principal_amount)} />
            <Field label="ROI %" value={agreement.roi_percentage != null ? `${agreement.roi_percentage}%` : '—'} />
            <Field label="Payout Frequency" value={fmtFrequency(agreement.payout_frequency)} />
            <Field label="Interest Type" value={fmtInterestType(agreement.interest_type)} />
            <Field label="Lock-in Years" value={agreement.lock_in_years != null ? `${agreement.lock_in_years} yrs` : '—'} />
            <Field label="Maturity Date" value={fmtDate(agreement.maturity_date)} />
            <Field label="Salesperson" value={salespersonName} />
            <Field label="TDS Filing Name" value={fmt(agreement.tds_filing_name)} />
            
            {/* Payments */}
            {(agreement.payments ?? []).length > 0 ? (
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
            ) : (
              <Field label="Payment" value="—" />
            )}
          </div>
        </SectionCard>

        {/* ── First Applicant ── */}
        <SectionCard title="First Applicant">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
            <Field label="Name" value={fmt(agreement.investor_name)} />
            <Field label="PAN" value={fmt(agreement.investor_pan)} />
            <Field label="Aadhaar" value={fmt(agreement.investor_aadhaar)} />
            <div className="sm:col-span-2">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Address</p>
              <p className="text-sm text-slate-200 whitespace-pre-line">
                {agreement.investor_address ?? '—'}
              </p>
            </div>
          </div>

          {nominees.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Nominees</p>
              <div className="flex flex-wrap gap-2">
                {nominees.map((n, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-700 text-slate-200 text-xs"
                  >
                    <span className="font-medium">{n.name}</span>
                    {n.relationship && <span className="text-slate-400">{n.relationship}</span>}
                    {n.share != null && <span className="text-slate-400">{n.share}%</span>}
                  </span>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* ── Second Applicant (only shown if data exists) ── */}
        {(agreement.investor2_name || agreement.investor2_pan) && (
          <SectionCard title="Second Applicant">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <Field label="Name" value={fmt(agreement.investor2_name)} />
              <Field label="PAN" value={fmt(agreement.investor2_pan)} />
              <Field label="Aadhaar" value={fmt(agreement.investor2_aadhaar)} />
              {agreement.investor2_address && (
                <div className="sm:col-span-2">
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">Address</p>
                  <p className="text-sm text-slate-200 whitespace-pre-line">{agreement.investor2_address}</p>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {/* ── Document Lifecycle ── */}
        <SectionCard title="Document Lifecycle">
          <DocLifecycleStepper
            agreementId={agreement.id}
            docStatus={agreement.doc_status}
            docSentToClientDate={agreement.doc_sent_to_client_date}
            docReturnedDate={agreement.doc_returned_date}
          />
        </SectionCard>

        {/* ── Payout Schedule ── */}
        <SectionCard title="Payout Schedule">
          <PayoutScheduleSection
            agreementId={agreement.id}
            payouts={payout_schedule}
          />
        </SectionCard>

        {/* ── TDS Summary ── */}
        <SectionCard title="TDS Summary by Quarter">
          {tdsSummary.length === 0 ? (
            <p className="text-slate-500 text-sm italic">No payout data for TDS summary.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-xs text-slate-400">
                    <th className="pb-2 text-left pr-6">Quarter</th>
                    <th className="pb-2 text-right pr-6">Gross Interest</th>
                    <th className="pb-2 text-right pr-6">TDS</th>
                    <th className="pb-2 text-right">Net Interest</th>
                  </tr>
                </thead>
                <tbody>
                  {tdsSummary.map(([year, totals]) => (
                    <tr key={year} className="border-b border-slate-700/40">
                      <td className="py-2 pr-6 font-medium text-slate-200">{year}</td>
                      <td className="py-2 pr-6 text-right tabular-nums text-slate-300">{fmtCurrency(totals.gross)}</td>
                      <td className="py-2 pr-6 text-right tabular-nums text-red-400">{fmtCurrency(totals.tds)}</td>
                      <td className="py-2 text-right tabular-nums text-green-400 font-medium">{fmtCurrency(totals.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* ── Reminder History ── */}
        <SectionCard title="Reminder History">
          {reminders.length === 0 ? (
            <p className="text-slate-500 text-sm italic">No reminders for this agreement.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-xs text-slate-400">
                    <th className="pb-2 text-left pr-4 whitespace-nowrap">Type</th>
                    <th className="pb-2 text-left pr-4 whitespace-nowrap">Scheduled At</th>
                    <th className="pb-2 text-center pr-4 whitespace-nowrap">Status</th>
                    <th className="pb-2 text-left pr-4 whitespace-nowrap">Sent At</th>
                    <th className="pb-2 text-left whitespace-nowrap">Subject</th>
                  </tr>
                </thead>
                <tbody>
                  {reminders.map((r) => (
                    <tr key={r.id} className="border-b border-slate-700/40 hover:bg-slate-700/20">
                      <td className="py-2 pr-4">
                        <span className="inline-flex items-center gap-1.5 text-slate-300">
                          <Bell className="w-3 h-3 text-slate-500 flex-shrink-0" />
                          <span className="whitespace-nowrap">{reminderTypeLabel(r.reminder_type)}</span>
                        </span>
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-slate-400">
                        {fmtDate(r.scheduled_at)}
                      </td>
                      <td className="py-2 pr-4 text-center">
                        <ReminderStatusBadge status={r.status} />
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap text-slate-400">
                        {r.sent_at ? fmtDate(r.sent_at) : '—'}
                      </td>
                      <td className="py-2 text-slate-400 max-w-xs truncate">
                        {r.email_subject ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        {/* ── Original Document ── */}
        {!agreement.document_url && (
          <SectionCard title="Document">
            <div className="flex items-center gap-4 py-2">
              <FileText className="w-8 h-8 text-slate-600 flex-shrink-0" />
              <div>
                <p className="text-sm text-slate-400">No document uploaded yet.</p>
                <p className="text-xs text-slate-500 mt-0.5">Use the &ldquo;Upload Document&rdquo; button above to attach the signed agreement.</p>
              </div>
            </div>
          </SectionCard>
        )}
        {agreement.document_url && (
          <SectionCard title="Original Document">
            {agreement.document_url.toLowerCase().includes('.pdf') ||
            agreement.document_url.includes('content-type=application%2Fpdf') ? (
              <div className="rounded-lg overflow-hidden border border-slate-700">
                <iframe
                  src={agreement.document_url}
                  className="w-full"
                  style={{ minHeight: '500px', height: '70vh' }}
                  title="Agreement Document"
                />
              </div>
            ) : (
              <a
                href={agreement.document_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors"
              >
                <FileText className="w-4 h-4" />
                Download Document
              </a>
            )}
          </SectionCard>
        )}

        {/* ── Audit Log ── */}
        <AuditLog entries={(auditEntries ?? []) as Parameters<typeof AuditLog>[0]['entries']} />

      </div>
    </div>
  )
}
