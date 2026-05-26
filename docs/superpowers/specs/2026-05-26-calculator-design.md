# Calculator — Design Spec
**Date:** 2026-05-26  
**Status:** Approved

---

## Overview

Add a calculator-based path for creating new agreements from scratch, alongside the existing PDF upload/scan path. The coordinator fills in all agreement and investor details, the payout schedule generates live, and they can export an optional PDF info sheet or create the agreement directly.

---

## Entry Point

`/agreements/new` shows two equal options side by side:

| Option | Description |
|---|---|
| **Upload Document** | Existing scan flow — unchanged |
| **Enter Details** | New calculator flow |

No default — coordinator picks each time based on whether a signed document exists.

---

## Calculator Form (`/agreements/new/calculator`)

Stacked layout: three compact input sections, then the live payout schedule table below.

### Section 1 — Agreement
| Field | Type | Notes |
|---|---|---|
| Agreement Type | Text | Default: `"Investment Agreement"` |
| Agreement Date | Date | |
| Lock-in (years) | Number | |
| Salesperson | Select | Existing team member dropdown |

### Section 2 — Investor
| Field | Type | Notes |
|---|---|---|
| Investor Name | Text | Required |
| PAN | Text | Optional |
| Aadhaar | Text | Optional |

### Section 3 — Investment
| Field | Type | Notes |
|---|---|---|
| Principal (₹) | Number | Required |
| ROI % | Number | Required |
| Payout Frequency | Select | quarterly / annual / biannual / monthly / cumulative |
| Interest Type | Select | simple / compound |
| Start Date | Date | Required |
| Maturity Date | Date | Required |

### Live Payout Schedule
- Renders below the inputs whenever Principal + ROI + Frequency + Start + Maturity are all filled
- Recomputes instantly on any field change
- Uses the existing `calculatePayoutSchedule()` function — no new calculation logic
- Shows: #, Period, Days, Gross, TDS, Net; footer totals row

### Actions (bottom right)
- **← Back** — returns to `/agreements/new`
- **Export PDF** — generates and downloads an info sheet (see below)
- **Create Agreement →** — posts directly to `POST /api/agreements`, redirects to agreement detail page

---

## PDF Info Sheet

Optional export. A simple printable summary — not a formal contract. Contains:

- Good Earth header
- Investor name, PAN
- Agreement type, date, lock-in
- Principal, ROI, payout frequency, start date, maturity date
- Full payout schedule table (all rows, with totals)
- Generated with `@react-pdf/renderer` (already a planned dep in Batch D)

Coordinator can share this with the client before the formal agreement is signed. No emails, no magic links — just a downloaded PDF.

---

## Create Agreement Flow

When "Create Agreement →" is clicked:

1. Validate all required fields (same rules as existing `/api/agreements`)
2. Compute final payout schedule via `calculatePayoutSchedule()` 
3. `POST /api/agreements` with all fields + payout schedule — same endpoint used by ExtractionReview
4. On success: redirect to `/agreements/[id]`
5. Agreement is created in `pending` status with `doc_status: pending` (no document uploaded yet — coordinator uploads the signed PDF later via the existing "Upload Document" button on the detail page)

No intermediate review step — the coordinator has already reviewed everything in the calculator form.

---

## What Doesn't Change

- Existing upload/scan flow is untouched
- `calculatePayoutSchedule()` is used as-is — no new calculation logic
- `POST /api/agreements` endpoint is used as-is — no new API route needed
- All reminder, TDS, and payout logic continues to work exactly as before

---

## Files Affected

| File | Change |
|---|---|
| `src/app/(app)/agreements/new/page.tsx` | Replace single upload flow with two-option entry screen |
| `src/app/(app)/agreements/new/calculator/page.tsx` | New — calculator form page |
| `src/components/agreements/CalculatorForm.tsx` | New — the form + live schedule component |
| `src/lib/pdf-info-sheet.tsx` | New — `@react-pdf/renderer` info sheet template |
| `src/app/api/agreements/pdf-info-sheet/route.ts` | New — generates and returns PDF as download |

---

## Out of Scope

- ROI suggestion tiers based on principal (BACKLOG future item)
- Fixed payout day (BACKLOG future item)
- Client-facing email / magic link flow (full Batch D — deferred)
- Second investor / nominees fields (can be added after upload via agreement detail page)
