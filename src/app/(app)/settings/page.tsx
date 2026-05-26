'use client'

import { useState, useEffect, useCallback } from 'react'
import type { TeamMember, TeamMemberRole } from '@/types/database'

const ROLES: { value: TeamMemberRole; label: string }[] = [
  { value: 'coordinator', label: 'Coordinator' },
  { value: 'accountant', label: 'Accountant' },
  { value: 'financial_analyst', label: 'Financial Analyst' },
  { value: 'salesperson', label: 'Salesperson' },
]

function roleLabel(role: TeamMemberRole): string {
  return ROLES.find((r) => r.value === role)?.label ?? role
}

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
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-forest/20 disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? 'bg-forest' : 'bg-hairline-strong'
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

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-base font-bold text-ink-1 uppercase tracking-widest text-[11px]">{title}</h2>
      {subtitle && <p className="text-[11px] text-ink-4 mt-1 font-medium italic">{subtitle}</p>}
    </div>
  )
}

export default function SettingsPage() {
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loadingTeam, setLoadingTeam] = useState(true)
  const [teamError, setTeamError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formRole, setFormRole] = useState<TeamMemberRole>('salesperson')
  const [formError, setFormError] = useState<string | null>(null)
  const [formSubmitting, setFormSubmitting] = useState(false)

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

  async function handleToggleActive(member: TeamMember) {
    const id = member.id
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, is_active: !m.is_active } : m)))
    setTogglingId(id)
    try {
      const res = await fetch(`/api/team/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !member.is_active }),
      })
      if (!res.ok) {
        setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, is_active: !m.is_active } : m)))
        const body = await res.json().catch(() => ({}))
        setTeamError(body.error ?? 'Failed to update member status')
      }
    } catch {
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, is_active: !m.is_active } : m)))
      setTeamError('Network error updating member status')
    } finally {
      setTogglingId(null)
    }
  }

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

  return (
    <div className="p-8 space-y-10 min-h-screen bg-canvas max-w-5xl mx-auto">
      <div className="border-b border-ink-1 pb-3 mb-5">
        <h1 className="text-[28px] font-semibold text-ink-1 font-serif tracking-tight">Settings</h1>
        <p className="text-xs text-ink-4 mt-0.5 font-medium">Manage team members and notification recipients</p>
      </div>

      {/* Team Members */}
      <section className="bg-surface border border-hairline rounded-sm p-8 shadow-sm">
        <SectionHeader
          title="Team Members"
          subtitle="Manage who receives notifications and appears in salesperson dropdowns"
        />

        {loadingTeam ? (
          <div className="py-8 text-center text-ink-5 text-sm italic">Loading team…</div>
        ) : teamError ? (
          <div className="py-4 text-center text-rust text-sm font-bold uppercase">{teamError}</div>
        ) : members.length === 0 ? (
          <div className="py-8 text-center text-ink-5 text-sm italic">No team members found.</div>
        ) : (
          <div className="overflow-x-auto rounded-sm border border-hairline shadow-inner">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline bg-surface-2">
                  <th className="px-4 py-3 text-left lbl">Name</th>
                  <th className="px-4 py-3 text-left lbl">Email</th>
                  <th className="px-4 py-3 text-left lbl">Role</th>
                  <th className="px-4 py-3 text-center lbl">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline bg-surface">
                {members.map((member) => (
                  <tr key={member.id} className={`hover:bg-surface-2 transition-colors${!member.is_active ? ' opacity-50 bg-canvas/50' : ''}`}>
                    <td className="px-4 py-3 text-ink-1 font-semibold">{member.name}</td>
                    <td className="px-4 py-3 text-ink-3 font-medium">{member.email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase bg-surface-2 text-ink-2 border border-hairline-strong">
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

        <div className="mt-10 pt-8 border-t border-hairline">
          <h3 className="lbl text-ink-1 font-bold mb-5 tracking-widest uppercase">Add New Member</h3>
          <form onSubmit={handleAddMember} className="flex flex-wrap gap-4 items-end bg-canvas p-6 rounded-sm border border-hairline shadow-inner">
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase text-ink-4">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Full name"
                className="bg-surface border border-hairline-strong rounded-sm px-3 py-2 text-sm text-ink-1 placeholder-ink-5 focus:border-forest focus:ring-2 focus:ring-forest/10 outline-none w-44 font-medium"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase text-ink-4">Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="email@example.com"
                className="bg-surface border border-hairline-strong rounded-sm px-3 py-2 text-sm text-ink-1 placeholder-ink-5 focus:border-forest focus:ring-2 focus:ring-forest/10 outline-none w-52 font-medium"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-bold uppercase text-ink-4">Role</label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value as TeamMemberRole)}
                className="bg-surface border border-hairline-strong h-[38px] rounded-sm px-3 text-sm text-ink-1 focus:border-forest focus:ring-2 focus:ring-forest/10 outline-none font-bold"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={formSubmitting}
              className="h-[38px] px-6 rounded-sm bg-forest hover:bg-forest-2 text-paper text-[11px] font-bold uppercase tracking-widest transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
            >
              {formSubmitting ? 'Adding…' : 'Add Member'}
            </button>
          </form>
          {formError && <p className="mt-3 text-[10px] font-bold uppercase text-rust px-1">{formError}</p>}
        </div>
      </section>

      {/* Notifications Info */}
      <section className="bg-surface border border-hairline rounded-sm p-8 shadow-sm">
        <SectionHeader
          title="Notification Logic"
          subtitle="How automated and manual notifications are handled"
        />
        <div className="bg-surface-2 border border-hairline rounded-sm p-6">
          <p className="text-xs text-ink-3 font-medium leading-relaxed">
            The system tracks all investment payouts and maturities. 
            Automated red-flag alerts are sent daily for overdue items, while consolidated monthly summaries 
            are dispatched to all active <strong className="text-ink-1">Coordinators</strong> on the 1st of each month.
            Manual batched notifications can be triggered from the <strong className="text-ink-1">Notifications Dashboard</strong>.
          </p>
        </div>
      </section>
    </div>
  )
}
