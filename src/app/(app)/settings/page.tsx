'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TeamMember, TeamMemberRole } from '@/types/database'
import BackfillTdsButton from '@/components/settings/BackfillTdsButton'
import SyncMaturedButton from '@/components/settings/SyncMaturedButton'

const ROLES: { value: TeamMemberRole; label: string }[] = [
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'financial_analyst', label: 'Financial Analyst' },
  { value: 'salesperson', label: 'Salesperson' },
]

function roleLabel(role: TeamMemberRole): string {
  return ROLES.find((r) => r.value === role)?.label ?? role
}

// ─── Toggle Switch ──────────────────────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-emerald-600' : 'bg-slate-600'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ─── Section Header ─────────────────────────────────────────────────────────
function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-slate-100">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function SettingsPage() {
  // ── Team state ──────────────────────────────────────────────────────────
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ── Add member form ──────────────────────────────────────────────────────
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState<TeamMemberRole>('salesperson')
  const [formError, setFormError] = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

  // ── Fetch team ───────────────────────────────────────────────────────────
  const fetchTeam = useCallback(async () => {
    setLoadingTeam(true)
    setTeamError(null)
    try {
      const res = await fetch('/api/team?all=true')
      if (!res.ok) throw new Error(`Failed to fetch team: ${res.statusText}`)
      const data: TeamMember[] = await res.json()
      setMembers(data)
    } catch (err) {
      setTeamError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoadingTeam(false)
    }
  }, [])

  useEffect(() => {
    fetchTeam()
  }, [fetchTeam])

  // ── Toggle active ────────────────────────────────────────────────────────
  async function handleToggleActive(member: TeamMember) {
    const id = member.id
    // Optimistic update
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, is_active: !m.is_active } : m)))
    setTogglingId(id)
    try {
      const res = await fetch(`/api/team/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !member.is_active }),
      })
      if (!res.ok) {
        // Revert
        setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, is_active: !m.is_active } : m)))
        const body = await res.json().catch(() => ({}))
        setTeamError(body.error ?? 'Failed to update member status')
      }
    } catch {
      // Revert
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, is_active: !m.is_active } : m)))
      setTeamError('Network error updating member status')
    } finally {
      setTogglingId(null)
    }
  }

  // ── Add member ───────────────────────────────────────────────────────────
  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    if (!formName.trim() || !formEmail.trim()) {
      setFormError('Name and email are required.')
      return
    }
    setFormSubmitting(true)
    try {
      const res = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), email: formEmail.trim(), role: formRole }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to add member')
      }
      setFormName('')
      setFormEmail('')
      setFormRole('salesperson')
      await fetchTeam()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to add member')
    } finally {
      setFormSubmitting(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-8 min-h-screen bg-slate-950">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">Manage team, reminders, and email configuration</p>
      </div>

      {/* ─── Section 1: Team Members ─────────────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <SectionHeader
          title="Team Members"
          subtitle="Manage who receives notifications and appears in salesperson dropdowns"
        />

        {/* Table */}
        {loadingTeam ? (
          <div className="py-8 text-center text-slate-500 text-sm">Loading team…</div>
        ) : teamError ? (
          <div className="py-4 text-center text-red-400 text-sm">{teamError}</div>
        ) : members.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-sm">No team members found.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Active
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {members.map((member) => (
                  <tr key={member.id} className={`hover:bg-slate-800/30 transition-colors${!member.is_active ? ' opacity-50' : ''}`}>
                    <td className="px-4 py-3 text-slate-100 font-medium">{member.name}</td>
                    <td className="px-4 py-3 text-slate-400">{member.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                        {roleLabel(member.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center">
                        <Toggle
                          checked={member.is_active}
                          onChange={() => handleToggleActive(member)}
                          disabled={togglingId === member.id}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add Member Form */}
        <div className="mt-6 pt-5 border-t border-slate-800">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Add Member</h3>
          <form onSubmit={handleAddMember} className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Full name"
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 w-44"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="email@example.com"
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 w-52"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Role</label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value as TeamMemberRole)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={formSubmitting}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {formSubmitting ? 'Adding…' : 'Add Member'}
            </button>
          </form>
          {formError && (
            <p className="mt-2 text-xs text-red-400">{formError}</p>
          )}
        </div>
      </section>

      {/* ─── Section 2: Reminder Configuration ──────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <SectionHeader
          title="Reminder Configuration"
          subtitle="Default lead days for automated reminders (configured in code)"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Payout reminders */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-sm font-medium text-slate-100">Payout Reminders</span>
            </div>
            <p className="text-xs text-slate-500 mb-2">Sent before the payout due date</p>
            <div className="flex gap-2 flex-wrap">
              {[14, 7].map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/40 text-amber-300 border border-amber-800/50"
                >
                  {d} days
                </span>
              ))}
            </div>
          </div>

          {/* Maturity reminders */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-sm font-medium text-slate-100">Maturity Reminders</span>
            </div>
            <p className="text-xs text-slate-500 mb-2">Sent before the agreement matures</p>
            <div className="flex gap-2 flex-wrap">
              {[90, 30, 14, 7].map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-900/40 text-emerald-300 border border-emerald-800/50"
                >
                  {d} days
                </span>
              ))}
            </div>
          </div>

          {/* Document return reminders */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-sky-400" />
              <span className="text-sm font-medium text-slate-100">Document Return</span>
            </div>
            <p className="text-xs text-slate-500 mb-2">
              First reminder 14 days after sending; then every 7 days (up to 5 reminders)
            </p>
            <div className="flex gap-2 flex-wrap">
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-900/40 text-sky-300 border border-sky-800/50">
                First: +14 days
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-900/40 text-sky-300 border border-sky-800/50">
                Then: every 7 days
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-400 border border-slate-600">
                Max 5
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Section 3: Email Preview ────────────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <SectionHeader
          title="Email Types"
          subtitle="Overview of automated emails sent by the system"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Payout Reminder */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-slate-100">Payout Reminder</span>
              <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/40 text-amber-300 border border-amber-800/50">
                Automated
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Sent to <span className="text-slate-300">Irene</span> and the assigned salesperson
              14 and 7 days before a payout is due.
            </p>
          </div>

          {/* Accounts Notification */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-slate-100">Accounts Notification</span>
              <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-900/40 text-indigo-300 border border-indigo-800/50">
                Manual trigger
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Sent to <span className="text-slate-300">Valli</span> when Irene clicks &ldquo;Notify
              Accounts&rdquo; on a payout row to authorise payment.
            </p>
          </div>

          {/* Quarterly Forecast */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-slate-100">Quarterly Forecast</span>
              <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-900/40 text-indigo-300 border border-indigo-800/50">
                Manual trigger
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Sent to <span className="text-slate-300">Valli &amp; Liya</span> via the &ldquo;Send
              to Accounts&rdquo; button on the dashboard with the quarterly payout forecast.
            </p>
          </div>

          {/* Document Return Reminder */}
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-sm font-medium text-slate-100">Document Return Reminder</span>
              <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-900/40 text-amber-300 border border-amber-800/50">
                Automated
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Sent to <span className="text-slate-300">Irene</span> and the assigned salesperson
              when a signed agreement has not been returned — starting 14 days after sending,
              then every 7 days (up to 5 reminders).
            </p>
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-600">
          Email preview and template editing is a Phase 2 feature.
        </p>
      </section>

      {/* ─── Section 4: Maintenance ──────────────────────────────────────── */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <SectionHeader
          title="Maintenance"
          subtitle="One-time repair tools and administrative tasks"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex flex-col h-full justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-100">Sync Matured Status</p>
                <p className="text-xs text-slate-400 mt-1">
                  Finds active agreements with past maturity dates and updates them to &apos;Matured&apos; status.
                </p>
              </div>
              <SyncMaturedButton />
            </div>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex flex-col h-full justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-slate-100">Backfill TDS Filing Rows</p>
                <p className="text-xs text-slate-400 mt-1">
                  Generates missing 31st March TDS rows for cumulative/compound agreements.
                </p>
              </div>
              <BackfillTdsButton />
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
