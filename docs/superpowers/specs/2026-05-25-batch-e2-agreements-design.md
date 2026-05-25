# Batch E.2 — Agreements Redesign

**Date:** 2026-05-25
**Branch:** `feature/batch-e2-agreements`
**Track:** Stable (main)
**Depends on:** Batch E.1 merged (design tokens + shell must be in main first)
**Status:** Approved

---

## Goal

Restyle all agreements pages (list, detail, new, import) to match the E.1 design system. No new functionality — layout and visual treatment only.

---

## Agreements List (`/agreements`)

**File:** `src/components/agreements/AgreementsTable.tsx`

- Page background: `bg-paper`
- Page heading: Source Serif 4, 28px, `text-ink-1`, ruled bottom border (`border-b border-ink-1 pb-3 mb-5`)
- "New Agreement" button: `bg-forest text-paper` primary style, 28px height
- Table: `.dt` pattern — `border-collapse`, `w-full`, `text-xs`
  - `thead th`: `text-ink-4 uppercase tracking-widest text-[10px] font-medium bg-surface-2 border-b border-hairline-strong px-3 py-2`
  - `tbody td`: `px-3 py-2 border-b border-hairline text-ink-2`
  - Hover: `hover:bg-surface-2`
- Status column: `.sdot` dot + text
- Amount columns: `font-mono tabular-nums text-ink-1`
- Reference ID: `font-mono text-xs text-ink-3`
- Sort arrows: `text-ink-4`
- Search input: hairline border, forest focus ring, 28px height

---

## Agreement Detail (`/agreements/[id]`)

**Files:** `src/app/(app)/agreements/[id]/page.tsx`, `src/components/agreements/PayoutScheduleTable.tsx`, `src/components/agreements/DocLifecycleStepper.tsx`, `src/components/agreements/PendingPayouts.tsx`, `src/components/agreements/PendingTdsFilings.tsx`, `src/components/agreements/Timeline.tsx`

### Page heading
```
Source Serif 4, 28px, text-ink-1
ruled border-b border-ink-1 pb-3 mb-5
sub: reference_id · investor_name in text-ink-4 text-xs uppercase
```

### Info panels
- Background: `bg-surface border border-hairline rounded-sm`
- Panel head: `border-b border-hairline px-4 py-3 text-[10px] uppercase tracking-widest font-semibold text-ink-1`
- Panel body: `px-4 py-4`
- Label rows: `text-ink-4 text-xs` + value `text-ink-1 text-sm`
- Amount values: `font-mono tabular-nums`

### PayoutScheduleTable
- `.dt.compact` style — 28px rows
- Overdue rows: `bg-rust-soft/40`
- Paid rows: `text-ink-4` (dimmed)
- Notified rows: normal
- TDS-only rows: `bg-clay-soft/30 text-ink-3`
- Net amount column: `font-mono font-semibold text-ink-1`
- Status pills: replace colored badges with `.sdot` dots

### DocLifecycleStepper
- Active step: `text-forest font-semibold`
- Completed step: `text-gain`
- Pending step: `text-ink-4`
- Connector line: `border-hairline`

### PendingPayouts / PendingTdsFilings
- Panel card: `bg-surface border border-hairline rounded-sm`
- Row: `border-b border-hairline px-4 py-3`
- Amount: `font-mono text-ink-1`
- Overdue badge: `bg-rust-soft text-rust text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm`

### RescanModal + QuickActions buttons
- Primary: `bg-forest text-paper`
- Secondary: `border border-hairline-strong text-ink-1 bg-surface hover:bg-surface-2`

---

## New Agreement (`/agreements/new`)

**Files:** `src/components/agreements/UploadStep.tsx`, `src/components/agreements/ManualAgreementForm.tsx`, `src/components/agreements/ExtractionReview.tsx`

### UploadStep
- Upload area: `bg-canvas border-2 border-dashed border-hairline-strong rounded-sm p-12`
- Drag-active state: `border-forest bg-forest-soft`
- Choice cards (Upload vs Manual): `bg-surface border border-hairline rounded-sm p-6 hover:border-forest cursor-pointer`

### ManualAgreementForm + ExtractionReview
- Form inputs: `h-7 border border-hairline-strong bg-surface px-2 text-sm rounded-sm focus:border-forest focus:ring-2 focus:ring-forest/12 outline-none`
- Select: same as input
- Section headers: `text-[10px] uppercase tracking-widest font-semibold text-ink-1 border-b border-hairline pb-2 mb-4`
- Live payout calculator table: `.dt.compact` style
- Submit button: `bg-forest text-paper h-8 px-4 text-sm font-medium rounded-sm`

---

## Import (`/agreements/import`)

**File:** `src/components/agreements/ImportFlow.tsx`

- Same input + button treatment as ManualAgreementForm
- Progress stepper: ink-1 active, ink-4 inactive, gain complete
- Result table: `.dt` style

---

## Files

| File | Action |
|---|---|
| `src/components/agreements/AgreementsTable.tsx` | Restyle table + page heading |
| `src/app/(app)/agreements/[id]/page.tsx` | Restyle page heading + layout |
| `src/components/agreements/PayoutScheduleTable.tsx` | `.dt.compact` style |
| `src/components/agreements/DocLifecycleStepper.tsx` | Light mode colours |
| `src/components/agreements/PendingPayouts.tsx` | Light mode panel style |
| `src/components/agreements/PendingTdsFilings.tsx` | Light mode panel style |
| `src/components/agreements/RescanModal.tsx` | Light mode buttons + modal |
| `src/components/agreements/QuickActions.tsx` | Light mode buttons |
| `src/components/agreements/UploadStep.tsx` | Light upload area |
| `src/components/agreements/ManualAgreementForm.tsx` | Light inputs + form |
| `src/components/agreements/ExtractionReview.tsx` | Light inputs + form |
| `src/components/agreements/ImportFlow.tsx` | Light inputs + stepper |
| `src/components/agreements/Timeline.tsx` | Light mode |

---

## Out of scope

- New form fields or validation changes
- API changes
- E.3 pages
