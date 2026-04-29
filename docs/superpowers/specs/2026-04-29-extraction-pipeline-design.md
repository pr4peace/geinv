# Extraction Pipeline Redesign — Design Spec
Date: 2026-04-29

## Overview

A hardened scan and rescan pipeline that catches extraction errors before they reach the database. Every uploaded or rescanned document goes through image pre-processing, an improved Gemini prompt, server-side mathematical validation, and a gated review UI where all flags must be resolved before saving. Rescan additionally shows a full diff of what changed including payout schedule rows.

---

## Section 1 — Extraction (Prompt + Image Pre-processing)

### 1a. Image Pre-processing

**File:** `src/lib/claude.ts`

Before sending to Gemini, convert each PDF page to a high-contrast B&W image:
1. Render PDF pages using `pdfjs-dist` (server-side canvas render via `canvas` npm package)
2. Process each rendered page with `sharp`: greyscale → normalise → sharpen
3. Send processed page images to Gemini alongside or instead of raw PDF bytes

For DOCX files: skip image pre-processing, send raw file as before (DOCX is already structured text).

**Dependencies to add:** `pdfjs-dist`, `sharp`, `canvas`

### 1b. Prompt Hardening

**File:** `src/lib/claude.ts`

Add 4 new rules to the existing Gemini prompt:

**Rule — Row count:** "Before returning JSON, count the rows in the payout schedule table in the document. Your `payout_schedule` array must contain exactly that many entries. If your count differs, re-read the table."

**Rule — Math self-check:** "For every payout row, verify: `tds_amount = round(gross_interest × 0.10, 2)` and `net_interest = round(gross_interest - tds_amount, 2)`. If any row fails, correct the values before returning."

**Rule — Coverage:** "Your payout rows must cover the complete period from `investment_start_date` to `maturity_date` with no gaps. Check: does `period_from` of row 1 equal `investment_start_date`? Does `period_to` of the last row equal or exceed `maturity_date`? Is each row's `period_from` the day after the previous row's `period_to`? If any check fails, re-read and add missing rows."

**Rule — Compound TDS:** "For compound interest agreements, TDS must be filed each Indian financial year (1 April – 31 March). Extract one TDS row per financial year that falls within the investment term, including partial first and last years. Mark these rows `is_tds_only: true`."

---

## Section 2 — Server-side Validation

### ExtractionFlag type

**File:** `src/lib/extraction-validator.ts` (new)

```ts
type ExtractionFlag = {
  id: string                        // unique, stable key for React
  type: 'tds_mismatch' | 'net_mismatch' | 'period_gap' | 'coverage_short' | 'row_count_warning'
  rowIndex: number | null           // which payout row (null for agreement-level flags)
  message: string                   // human-readable description
  expected: string                  // what the system expected
  found: string                     // what was extracted
  resolution: 'pending' | 'fixed' | 'accepted'
  acceptanceNote?: string           // required when resolution = 'accepted'
}
```

### Validation rules

`validateExtraction(extracted: ExtractedAgreement): ExtractionFlag[]`

- **tds_mismatch** — for each non-TDS-only, non-principal row: `Math.abs(row.tds_amount - round(row.gross_interest * 0.10, 2)) > 0.5`
- **net_mismatch** — for each row: `Math.abs(row.net_interest - (row.gross_interest - row.tds_amount)) > 0.5`
- **period_gap** — for consecutive rows: `period_from of row[i+1] ≠ day after period_to of row[i]`
- **coverage_short** — last row's `period_to < maturity_date`
- **row_count_warning** — extracted row count vs expected count based on `payout_frequency` and term length (warn only if diff > 1)

Tolerance of ₹0.50 on math checks to allow for rounding differences.

---

## Section 3 — Review Screen (Gating)

### ExtractionReview changes

**File:** `src/components/agreements/ExtractionReview.tsx`

If `flags.length > 0`, render a **Flags panel** above the existing form:

- Header: `⚠ N issues found — resolve all before saving` with a progress counter `X of N resolved`
- One card per flag, red left border
- Each card shows: flag message, expected value, found value
- Three resolution buttons per card:

  **Fix** — opens inline edit on the flagged payout row. When coordinator edits the value and clicks "Apply fix", re-runs validation on that row only. If it passes, flag moves to `resolved`.

  **Re-upload** — clears extracted state, shows file picker again. Full re-extraction on new file. Returns to review screen with fresh flags.

  **Accept as-is** — shows a one-line text input: "Why is this correct?" Required, min 5 chars. On confirm, flag moves to `accepted` with note stored in `confidence_warnings`.

**Save button** is disabled (`opacity-40`, `cursor-not-allowed`) until all flags are `fixed` or `accepted`. Tooltip on hover: "Resolve all flagged issues to continue."

---

## Section 4 — Rescan (Diff + Full Update)

### Rescan route changes

**File:** `src/app/api/agreements/[id]/rescan/route.ts`

After extraction, also fetch and return current stored agreement fields + payout rows:

```ts
// Response shape
{
  extracted: ExtractedAgreement,
  current: {
    agreement: { ...stored fields },
    payoutRows: PayoutSchedule[]
  },
  flags: ExtractionFlag[]
}
```

### RescanModal changes

**File:** `src/components/notifications/RescanModal.tsx`

**Diff view** — compare `extracted` vs `current`:
- Agreement fields: show changed fields in amber, unchanged in grey
- Payout rows: new rows in green, removed rows in red with strikethrough, changed rows in amber, unchanged in grey

**Flag panel** — same as ExtractionReview (fix / re-upload / accept). Save blocked until all resolved.

**On confirm** — calls new `POST /api/agreements/[id]/rescan/apply` instead of PATCH.

### New apply route

**File:** `src/app/api/agreements/[id]/rescan/apply/route.ts`

Atomic transaction:
1. PATCH agreement fields (all extracted fields)
2. DELETE existing `payout_schedule` rows for agreement
3. INSERT new payout rows from `extracted.payout_schedule`
4. Return updated agreement

---

## Section 5 — File Map

| File | Action |
|---|---|
| `src/lib/claude.ts` | Add image pre-processing + 4 prompt rules |
| `src/lib/extraction-validator.ts` | New — ExtractionFlag type + validateExtraction() |
| `src/components/agreements/ExtractionReview.tsx` | Flags panel, per-flag resolution, save gate |
| `src/components/agreements/RescanModal.tsx` | Diff view, flags panel, payout schedule update |
| `src/app/api/agreements/[id]/rescan/route.ts` | Return current stored values + flags |
| `src/app/api/agreements/[id]/rescan/apply/route.ts` | New — atomic apply route |

---

## Out of Scope
- Persisting flags to DB (flags are ephemeral, per-session only)
- Flag history / audit log
- Automatic correction without coordinator review
- DOCX image pre-processing (DOCX is already structured, skip)
