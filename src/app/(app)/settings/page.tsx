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

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-base font-semibold text-slate-100">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
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
    <div className="p-6 space-y-8 min-h-screen bg-slate-950 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-xs text-slate-500 mt-0.5">Manage team members and notification recipients</p>
      </div>

      {/* Team Members */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <SectionHeader
          title="Team Members"
          subtitle="Manage who receives notifications and appears in salesperson dropdowns"
        />

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
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-400 uppercase tracking-wider">Active</th>
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
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-44"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Email</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder="email@example.com"
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-52"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-500">Role</label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value as TeamMemberRole)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={formSubmitting}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {formSubmitting ? 'Adding…' : 'Add Member'}
            </button>
          </form>
          {formError && <p className="mt-2 text-xs text-red-400">{formError}</p>}
        </div>
      </section>

      {/* Notifications Info */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
        <SectionHeader
          title="Notification Summary"
          subtitle="Consolidated monthly emails are sent to coordinators"
        />
        <div className="bg-slate-800/50 border border-slate-800 rounded-lg p-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            On the 1st of every month, a consolidated summary of all <strong>interest payouts</strong>, 
            <strong>maturities</strong>, and <strong>TDS filings</strong> due for that month is sent to all 
            active <strong>Coordinators</strong>.
          </p>
        </div>
      </section>
    </div>
  )
}
