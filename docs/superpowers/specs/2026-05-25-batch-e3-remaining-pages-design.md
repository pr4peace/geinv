# Batch E.3 — Remaining Pages Redesign

**Date:** 2026-05-25
**Branch:** `feature/batch-e3-remaining`
**Track:** Stable (main)
**Depends on:** Batch E.1 + E.2 + Batch F all merged to main
**Status:** Pending review

---

## Goal

Apply the E.1 design system to all remaining pages: Notifications, Settings, Batch Rescan, Login, error/404 pages, and modal components (WhatsNewModal, SplashScreen, UndoToast).

---

## Notifications (`/notifications`)

**File:** `src/components/notifications/NotificationsClient.tsx`

Light mode token swap only — no structural changes (rebuilt in Batch F):

| Old (dark) | New (light) |
|---|---|
| `bg-slate-900` | `bg-surface` |
| `border-slate-800` | `border-hairline` |
| `text-slate-100` / `text-slate-200` | `text-ink-1` |
| `text-slate-400` / `text-slate-500` | `text-ink-4` |
| `bg-slate-800/30` | `bg-surface-2` |
| `bg-indigo-600` | `bg-forest` |
| `text-indigo-400` | `text-forest` |
| `bg-emerald-900/20 text-emerald-400` | `bg-gain-soft text-gain` |
| `bg-red-900/20 text-red-400` | `bg-rust-soft text-rust` |
| `bg-slate-700` (tab active) | `bg-ink-1 text-paper` |

Tabs: same structure, black active pill matching sidebar nav style.
Checkboxes: `accent-forest`.
"Notify All" button: `bg-forest text-paper`.
History rows: `border-b border-hairline`.

---

## Settings (`/settings`)

**File:** `src/app/(app)/settings/page.tsx` + any settings components

- Page heading: Source Serif 4, 28px, ruled bottom border
- Team members table: `.dt` style
- Add member form: `.input` style inputs, `bg-forest text-paper` submit
- Role badges: `.sdot` dot + `text-ink-2` (no colored backgrounds)
- Danger zone (delete/deactivate): `text-rust border-rust/40 bg-rust-soft/30` button

---

## Batch Rescan (`/settings/batch-rescan`)

**File:** `src/app/(app)/settings/batch-rescan/page.tsx` + related components

- Agreement selection table: `.dt` style with checkboxes (`accent-forest`)
- Diff cards: `bg-surface border border-hairline rounded-sm` — removed values `text-rust`, added `text-gain`
- Warning banners: `bg-clay-soft border border-clay/20 text-clay`
- Error banners: `bg-rust-soft border border-rust/20 text-rust`
- Progress indicators: `text-forest`
- "Apply All" button: `bg-forest text-paper`

---

## Login Page (`/login`)

**File:** `src/app/login/page.tsx`

- Full page: `bg-canvas min-h-screen flex items-center justify-center`
- Card: `bg-surface border border-hairline rounded-sm p-8 w-full max-w-sm`
- Logo: forest mark (28×28) + "Good Earth" in Source Serif 4
- Sub: `text-ink-4 text-xs uppercase tracking-widest` — "Investment Tracker"
- Google sign-in button: `border border-hairline-strong bg-surface hover:bg-surface-2 text-ink-1 h-9 w-full rounded-sm text-sm font-medium`

---

## Error + Not Found Pages

**Files:** `src/app/(app)/error.tsx`, `src/app/error.tsx`, `src/app/not-found.tsx` — check each for dark slate styling and apply token swap if present.

- Background: `bg-paper`
- Heading: `text-ink-1 font-serif`
- Body text: `text-ink-3`
- Action button: `bg-forest text-paper`

---

## WhatsNewModal

**File:** `src/components/WhatsNewModal.tsx`

- Backdrop: `bg-ink-1/50`
- Modal: `bg-surface border border-hairline rounded-sm max-w-lg w-full`
- Header: `border-b border-hairline px-6 py-4 font-serif text-xl text-ink-1`
- Feature rows: `border-b border-hairline px-6 py-3`
- Importance pills: critical `bg-rust-soft text-rust`, high `bg-clay-soft text-clay`, medium `bg-surface-2 text-ink-3`
- Close button: `bg-forest text-paper`

---

## SplashScreen

**File:** `src/components/SplashScreen.tsx`

- Background: `bg-forest` (full screen)
- Logo mark: white on forest
- Loading text: `text-forest-soft text-sm`

---

## UndoToast

**File:** `src/components/UndoToast.tsx`

- Toast: `bg-ink-1 text-paper border border-ink-2 rounded-sm shadow-lg`
- Undo button: `text-forest-soft hover:text-paper underline text-sm`

---

## Out of scope

- Quarterly review (`/quarterly-review`) and quarterly reports (`/quarterly-reports`) — not reachable from current shell nav; will be addressed when re-added to nav
- Calendar (`/calendar`) — not reachable from current shell nav; same
- API changes
- New features
