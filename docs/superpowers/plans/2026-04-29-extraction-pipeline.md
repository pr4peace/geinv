# Extraction Pipeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a hardened scan/rescan pipeline that catches extraction errors before they reach the database — through prompt hardening, PDF pre-processing, server-side math validation, a gated review UI, and a rescan flow that shows diffs and updates payout schedule rows.

**Architecture:** Validation lives in a pure `extraction-validator.ts` module (testable, no I/O). Pre-processing converts PDF pages to high-contrast B&W images via `pdfjs-dist` + `canvas` + `sharp` before sending to Gemini. The review UI blocks save until all flags are resolved via fix, re-upload, or accept. Rescan uses a new atomic apply route that replaces payout rows.

**Tech Stack:** Next.js 14 App Router · Gemini 2.5 Flash · pdfjs-dist · canvas · sharp · React (client) · Supabase admin client · Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `src/lib/extraction-validator.ts` | Create | ExtractionFlag type + validateExtraction() pure function |
| `src/__tests__/extraction-validator.test.ts` | Create | Unit tests for all flag types |
| `src/lib/claude.ts` | Modify | Hardened prompt + PDF image pre-processing |
| `src/components/agreements/ExtractionReview.tsx` | Modify | FlagsPanel + save gate + re-upload handler |
| `src/app/api/agreements/[id]/rescan/route.ts` | Modify | Return current stored values + run validateExtraction |
| `src/app/api/agreements/[id]/rescan/apply/route.ts` | Create | Atomic: update agreement + replace payout rows |
| `src/components/agreements/RescanModal.tsx` | Modify | Diff view + FlagsPanel + call apply route |

---

## Task 1: ExtractionFlag type + validateExtraction()

**Files:**
- Create: `src/lib/extraction-validator.ts`
- Create: `src/__tests__/extraction-validator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/extraction-validator.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateExtraction } from '../lib/extraction-validator'
import type { ExtractedAgreement } from '../lib/claude'

function makeRow(overrides: Partial<{
  period_from: string
  period_to: string
  due_by: string
  no_of_days: number | null
  gross_interest: number
  tds_amount: number
  net_interest: number
  is_principal_repayment: boolean
}> = {}) {
  return {
    period_from: '2026-04-01',
    period_to: '2027-03-31',
    due_by: '2027-04-07',
    no_of_days: 365,
    gross_interest: 140000,
    tds_amount: 14000,
    net_interest: 126000,
    is_principal_repayment: false,
    ...overrides,
  }
}

function makeAgreement(overrides: Partial<ExtractedAgreement> = {}): ExtractedAgreement {
  return {
    agreement_date: '2026-01-01',
    investment_start_date: '2026-04-01',
    agreement_type: 'FD',
    investor_name: 'Test',
    investor_pan: null,
    investor_aadhaar: null,
    investor_address: null,
    nominees: [],
    tds_filing_name: null,
    principal_amount: 1000000,
    roi_percentage: 14,
    payout_frequency: 'annual',
    interest_type: 'simple',
    lock_in_years: 1,
    maturity_date: '2027-03-31',
    payments: [],
    payout_schedule: [makeRow()],
    confidence_warnings: [],
    ...overrides,
  }
}

describe('validateExtraction', () => {
  it('returns no flags for a valid agreement', () => {
    const flags = validateExtraction(makeAgreement())
    expect(flags).toHaveLength(0)
  })

  it('flags tds_mismatch when TDS is not 10% of gross', () => {
    const flags = validateExtraction(makeAgreement({
      payout_schedule: [makeRow({ gross_interest: 140000, tds_amount: 17380, net_interest: 122620 })],
    }))
    expect(flags.some(f => f.type === 'tds_mismatch')).toBe(true)
    expect(flags.find(f => f.type === 'tds_mismatch')?.rowIndex).toBe(0)
  })

  it('does not flag tds_mismatch within ₹0.50 tolerance', () => {
    const flags = validateExtraction(makeAgreement({
      payout_schedule: [makeRow({ gross_interest: 140000, tds_amount: 14000.49, net_interest: 125999.51 })],
    }))
    expect(flags.some(f => f.type === 'tds_mismatch')).toBe(false)
  })

  it('flags net_mismatch when net ≠ gross - tds', () => {
    const flags = validateExtraction(makeAgreement({
      payout_schedule: [makeRow({ gross_interest: 140000, tds_amount: 14000, net_interest: 130000 })],
    }))
    expect(flags.some(f => f.type === 'net_mismatch')).toBe(true)
  })

  it('flags period_gap when rows are not consecutive', () => {
    const flags = validateExtraction(makeAgreement({
      payout_schedule: [
        makeRow({ period_from: '2026-04-01', period_to: '2027-03-31' }),
        makeRow({ period_from: '2027-04-03', period_to: '2028-03-31' }), // gap: missing 2027-04-02
      ],
    }))
    expect(flags.some(f => f.type === 'period_gap')).toBe(true)
  })

  it('does not flag period_gap for consecutive rows', () => {
    const flags = validateExtraction(makeAgreement({
      maturity_date: '2028-03-31',
      payout_schedule: [
        makeRow({ period_from: '2026-04-01', period_to: '2027-03-31' }),
        makeRow({ period_from: '2027-04-01', period_to: '2028-03-31' }),
      ],
    }))
    expect(flags.some(f => f.type === 'period_gap')).toBe(false)
  })

  it('flags coverage_short when last row does not reach maturity_date', () => {
    const flags = validateExtraction(makeAgreement({
      maturity_date: '2028-03-31',
      payout_schedule: [makeRow({ period_to: '2027-03-31' })],
    }))
    expect(flags.some(f => f.type === 'coverage_short')).toBe(true)
  })

  it('does not flag coverage_short when last row reaches maturity_date', () => {
    const flags = validateExtraction(makeAgreement({
      maturity_date: '2027-03-31',
      payout_schedule: [makeRow({ period_to: '2027-03-31' })],
    }))
    expect(flags.some(f => f.type === 'coverage_short')).toBe(false)
  })

  it('does not flag principal repayment rows for tds_mismatch', () => {
    const flags = validateExtraction(makeAgreement({
      payout_schedule: [
        makeRow(),
        makeRow({ gross_interest: 1000000, tds_amount: 0, net_interest: 1000000, is_principal_repayment: true }),
      ],
    }))
    expect(flags.filter(f => f.type === 'tds_mismatch')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/extraction-validator.test.ts
```

Expected: FAIL — "Cannot find module '../lib/extraction-validator'"

- [ ] **Step 3: Create extraction-validator.ts**

Create `src/lib/extraction-validator.ts`:

```ts
import type { ExtractedAgreement } from './claude'

export type ExtractionFlagType =
  | 'tds_mismatch'
  | 'net_mismatch'
  | 'period_gap'
  | 'coverage_short'
  | 'row_count_warning'

export type ExtractionFlagResolution = 'pending' | 'fixed' | 'accepted'

export interface ExtractionFlag {
  id: string
  type: ExtractionFlagType
  rowIndex: number | null
  message: string
  expected: string
  found: string
  resolution: ExtractionFlagResolution
  acceptanceNote?: string
}

const TOLERANCE = 0.5

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function dayAfter(dateStr: string): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().split('T')[0]
}

export function validateExtraction(extracted: ExtractedAgreement): ExtractionFlag[] {
  const flags: ExtractionFlag[] = []
  let flagIndex = 0

  const rows = extracted.payout_schedule ?? []

  rows.forEach((row, i) => {
    if (row.is_principal_repayment) return

    // tds_mismatch
    const expectedTds = round2(row.gross_interest * 0.1)
    if (Math.abs(row.tds_amount - expectedTds) > TOLERANCE) {
      flags.push({
        id: `flag-${flagIndex++}`,
        type: 'tds_mismatch',
        rowIndex: i,
        message: `Row ${i + 1}: TDS does not equal 10% of gross interest`,
        expected: `₹${expectedTds.toLocaleString('en-IN')}`,
        found: `₹${row.tds_amount.toLocaleString('en-IN')}`,
        resolution: 'pending',
      })
    }

    // net_mismatch
    const expectedNet = round2(row.gross_interest - row.tds_amount)
    if (Math.abs(row.net_interest - expectedNet) > TOLERANCE) {
      flags.push({
        id: `flag-${flagIndex++}`,
        type: 'net_mismatch',
        rowIndex: i,
        message: `Row ${i + 1}: Net interest does not equal gross minus TDS`,
        expected: `₹${expectedNet.toLocaleString('en-IN')}`,
        found: `₹${row.net_interest.toLocaleString('en-IN')}`,
        resolution: 'pending',
      })
    }

    // period_gap — compare with next row
    if (i < rows.length - 1) {
      const nextRow = rows[i + 1]
      const expectedNextFrom = dayAfter(row.period_to)
      if (nextRow.period_from !== expectedNextFrom) {
        flags.push({
          id: `flag-${flagIndex++}`,
          type: 'period_gap',
          rowIndex: i,
          message: `Gap between row ${i + 1} and row ${i + 2}: missing coverage`,
          expected: `Row ${i + 2} period_from = ${expectedNextFrom}`,
          found: `Row ${i + 2} period_from = ${nextRow.period_from}`,
          resolution: 'pending',
        })
      }
    }
  })

  // coverage_short — last row period_to must reach maturity_date
  if (rows.length > 0 && extracted.maturity_date) {
    const lastRow = rows[rows.length - 1]
    if (lastRow.period_to < extracted.maturity_date) {
      flags.push({
        id: `flag-${flagIndex++}`,
        type: 'coverage_short',
        rowIndex: rows.length - 1,
        message: `Payout schedule does not reach maturity date — likely a missing row`,
        expected: `Last row period_to = ${extracted.maturity_date}`,
        found: `Last row period_to = ${lastRow.period_to}`,
        resolution: 'pending',
      })
    }
  }

  return flags
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/extraction-validator.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/extraction-validator.ts src/__tests__/extraction-validator.test.ts
git commit -m "feat: extraction validator — flag TDS, net, gap, coverage issues"
```

---

## Task 2: Harden the Gemini prompt

**Files:**
- Modify: `src/lib/claude.ts` (lines 37–117 — the `EXTRACTION_PROMPT` constant)

- [ ] **Step 1: Add 4 new rules to the end of EXTRACTION_PROMPT**

In `src/lib/claude.ts`, find the line that ends the `EXTRACTION_PROMPT` (just before the closing backtick of the template literal). Add these rules before the final JSON schema block:

```
11. ROW COUNT VERIFICATION: Before returning JSON, count the rows in the payout schedule table in the document. Your payout_schedule array must contain exactly that many entries — not more, not fewer. If your count does not match, re-read the table and correct it.

12. MATH SELF-CHECK: For every payout row (non-principal rows only), verify:
    - tds_amount = round(gross_interest × 0.10, 2)
    - net_interest = round(gross_interest - tds_amount, 2)
    If any row fails either check, correct the values before returning. Do not return rows with mismatched numbers.

13. PERIOD COVERAGE: Your payout rows must cover the complete period from investment_start_date to maturity_date with no gaps. Verify:
    - Does period_from of row 1 equal investment_start_date?
    - Does period_to of the last non-principal row equal maturity_date?
    - Does period_from of each row equal the day after period_to of the previous row?
    If any check fails, re-read the document and add the missing row(s).

14. COMPOUND INTEREST TDS ROWS: For compound interest agreements (interest_type = "compound"), TDS must be filed each Indian financial year (1 April – 31 March). You must extract one TDS row per financial year that overlaps with the investment term, including partial first and last years. These rows have is_tds_only: true. If the document shows annual TDS deduction rows, extract all of them — do not stop at 3 rows if the term spans 4 financial years.
```

- [ ] **Step 2: Add `is_tds_only` to `ExtractedPayoutRow` type and JSON schema**

In `src/lib/claude.ts`, add `is_tds_only` to the `ExtractedPayoutRow` interface:

```ts
export interface ExtractedPayoutRow {
  period_from: string
  period_to: string
  no_of_days: number | null
  due_by: string
  gross_interest: number
  tds_amount: number
  net_interest: number
  is_principal_repayment: boolean
  is_tds_only: boolean   // add this
}
```

In `EXTRACTION_PROMPT`, find the payout_schedule JSON schema example and add `"is_tds_only": false` to it. Also add a prompt rule: "Set `is_tds_only: true` for rows that represent annual TDS filing obligations in compound interest agreements (rows where no cash is paid to investor, only TDS is deducted). Set `is_tds_only: false` for all regular interest payout rows."

- [ ] **Step 3: Verify build passes**

```bash
npm run build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/claude.ts
git commit -m "feat: harden Gemini extraction prompt — row count, math check, coverage, compound TDS, is_tds_only"
```

---

## Task 3: PDF pre-processing — high-contrast images

**Files:**
- Modify: `src/lib/claude.ts`

- [ ] **Step 1: Install dependencies**

```bash
npm install pdfjs-dist canvas sharp
npm install --save-dev @types/canvas
```

Expected: packages added to package.json and package-lock.json.

- [ ] **Step 2: Add pdfToHighContrastImages function**

In `src/lib/claude.ts`, add this function after the imports (before the `EXTRACTION_PROMPT` constant):

```ts
async function pdfToHighContrastImages(buffer: Buffer): Promise<Buffer[]> {
  const sharp = (await import('sharp')).default
  // pdfjs legacy build required for Node.js environments
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js')
  const { createCanvas } = await import('canvas')

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = await loadingTask.promise

  const images: Buffer[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const viewport = page.getViewport({ scale: 2.5 }) // 2.5x for high resolution

    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')

    await page.render({
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise

    const pngBuffer = canvas.toBuffer('image/png')

    // High-contrast B&W: greyscale → normalise → sharpen
    const processed = await sharp(pngBuffer)
      .greyscale()
      .normalise()
      .sharpen({ sigma: 1.5 })
      .png()
      .toBuffer()

    images.push(processed)
  }

  return images
}
```

- [ ] **Step 3: Update extractAgreementData to use image pre-processing for PDFs**

In `src/lib/claude.ts`, find the section in `extractAgreementData` that handles PDF:

```ts
if (mimeType === 'application/pdf') {
  result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: fileBuffer.toString('base64'),
      },
    },
    EXTRACTION_PROMPT,
  ])
}
```

Replace with:

```ts
if (mimeType === 'application/pdf') {
  let parts: Parameters<typeof model.generateContent>[0]

  try {
    // Convert PDF pages to high-contrast B&W images for accurate number reading
    const pageImages = await pdfToHighContrastImages(fileBuffer)
    parts = [
      ...pageImages.map(img => ({
        inlineData: {
          mimeType: 'image/png' as const,
          data: img.toString('base64'),
        },
      })),
      EXTRACTION_PROMPT,
    ]
  } catch {
    // Fall back to raw PDF if image conversion fails (e.g. missing native deps)
    parts = [
      {
        inlineData: {
          mimeType: 'application/pdf' as const,
          data: fileBuffer.toString('base64'),
        },
      },
      EXTRACTION_PROMPT,
    ]
  }

  result = await model.generateContent(parts)
}
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: clean build. If TypeScript errors on canvas types, add `// @ts-expect-error` on the canvasContext line.

- [ ] **Step 5: Commit**

```bash
git add src/lib/claude.ts package.json package-lock.json
git commit -m "feat: PDF pre-processing — high-contrast B&W images before Gemini extraction"
```

---

## Task 4: ExtractionReview — flags panel + save gate

**Files:**
- Modify: `src/components/agreements/ExtractionReview.tsx`

The `ExtractionReview` component receives `extracted: ExtractedAgreement` as a prop. We need to:
1. Run `validateExtraction` on mount and when payout rows change
2. Show a `FlagsPanel` above the form
3. Block the submit button until all flags are resolved

- [ ] **Step 1: Add imports and FlagsPanel component**

At the top of `src/components/agreements/ExtractionReview.tsx`, add to the existing imports:

```ts
import { validateExtraction } from '@/lib/extraction-validator'
import type { ExtractionFlag } from '@/lib/extraction-validator'
```

Add the `FlagsPanel` component just before the `ExtractionReview` default export function:

```tsx
function FlagsPanel({
  flags,
  onFix,
  onAccept,
  onReUpload,
}: {
  flags: ExtractionFlag[]
  onFix: (flagId: string, rowIndex: number) => void
  onAccept: (flagId: string, note: string) => void
  onReUpload: () => void
}) {
  const [acceptNotes, setAcceptNotes] = useState<Record<string, string>>({})
  const [accepting, setAccepting] = useState<string | null>(null)

  const pending = flags.filter(f => f.resolution === 'pending')
  const resolved = flags.filter(f => f.resolution !== 'pending')

  if (flags.length === 0) return null

  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {pending.length} issue{pending.length !== 1 ? 's' : ''} found — resolve all before saving
        </h3>
        <span className="text-xs text-slate-500">{resolved.length} of {flags.length} resolved</span>
      </div>

      {flags.map(flag => (
        <div
          key={flag.id}
          className={`border-l-4 rounded-xl p-4 space-y-3 ${
            flag.resolution === 'pending'
              ? 'border-red-500 bg-red-900/10'
              : flag.resolution === 'accepted'
              ? 'border-amber-500 bg-amber-900/10'
              : 'border-emerald-500 bg-emerald-900/10'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-slate-200">{flag.message}</p>
              <p className="text-xs text-slate-400">
                Expected: <span className="text-emerald-400">{flag.expected}</span>
                {' · '}
                Found: <span className="text-red-400">{flag.found}</span>
              </p>
            </div>
            {flag.resolution !== 'pending' && (
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                flag.resolution === 'accepted' ? 'bg-amber-900/40 text-amber-400' : 'bg-emerald-900/40 text-emerald-400'
              }`}>
                {flag.resolution}
              </span>
            )}
          </div>

          {flag.resolution === 'pending' && (
            <div className="flex flex-wrap gap-2">
              {flag.rowIndex !== null && (
                <button
                  type="button"
                  onClick={() => onFix(flag.id, flag.rowIndex!)}
                  className="px-3 py-1.5 text-xs font-semibold bg-indigo-900/40 text-indigo-400 hover:bg-indigo-800/40 rounded-lg transition-colors"
                >
                  Fix value
                </button>
              )}
              <button
                type="button"
                onClick={onReUpload}
                className="px-3 py-1.5 text-xs font-semibold bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Re-upload document
              </button>
              {accepting === flag.id ? (
                <div className="flex items-center gap-2 w-full">
                  <input
                    type="text"
                    placeholder="Why is this value correct? (required)"
                    value={acceptNotes[flag.id] ?? ''}
                    onChange={e => setAcceptNotes(n => ({ ...n, [flag.id]: e.target.value }))}
                    className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    autoFocus
                  />
                  <button
                    type="button"
                    disabled={(acceptNotes[flag.id] ?? '').trim().length < 5}
                    onClick={() => { onAccept(flag.id, acceptNotes[flag.id]); setAccepting(null) }}
                    className="px-3 py-1.5 text-xs font-semibold bg-amber-700 text-white hover:bg-amber-600 disabled:opacity-40 rounded-lg transition-colors"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccepting(null)}
                    className="px-2 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAccepting(flag.id)}
                  className="px-3 py-1.5 text-xs font-semibold bg-amber-900/30 text-amber-400 hover:bg-amber-900/50 rounded-lg transition-colors"
                >
                  Accept as-is
                </button>
              )}
            </div>
          )}

          {flag.resolution === 'accepted' && flag.acceptanceNote && (
            <p className="text-xs text-amber-400/70 italic">Note: {flag.acceptanceNote}</p>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Add flags state to ExtractionReview**

Inside the `ExtractionReview` function, after the existing `useState` declarations, add:

```ts
const [flags, setFlags] = useState<ExtractionFlag[]>(() => validateExtraction(extracted))

const unresolvedCount = flags.filter(f => f.resolution === 'pending').length

function handleFlagFix(flagId: string, rowIndex: number) {
  // Scroll to the payout row — the row is already editable in the payout schedule table
  const rowEl = document.getElementById(`payout-row-${rowIndex}`)
  rowEl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  rowEl?.classList.add('ring-2', 'ring-red-500')
  setTimeout(() => rowEl?.classList.remove('ring-2', 'ring-red-500'), 3000)
  // Mark as fixed — coordinator will manually edit the row and re-validate
  setFlags(prev => prev.map(f => f.id === flagId ? { ...f, resolution: 'fixed' } : f))
}

function handleFlagAccept(flagId: string, note: string) {
  setFlags(prev => prev.map(f => f.id === flagId ? { ...f, resolution: 'accepted', acceptanceNote: note } : f))
}
```

- [ ] **Step 3: Mount FlagsPanel and gate the submit button**

In the JSX return of `ExtractionReview`, add `FlagsPanel` just before the form fields begin (after the "Review extracted data" heading section):

```tsx
<FlagsPanel
  flags={flags}
  onFix={handleFlagFix}
  onAccept={handleFlagAccept}
  onReUpload={onBack}
/>
```

**Read `src/components/agreements/ExtractionReview.tsx` in full before this step.** Find the submit/save button near the bottom of the JSX — it calls `handleSubmit`. Update it to be disabled when there are unresolved flags:

```tsx
<button
  type="button"
  onClick={handleSubmit}
  disabled={submitting || unresolvedCount > 0}
  title={unresolvedCount > 0 ? `Resolve ${unresolvedCount} flagged issue${unresolvedCount !== 1 ? 's' : ''} to continue` : undefined}
  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
>
  {submitting ? 'Saving…' : unresolvedCount > 0 ? `${unresolvedCount} issue${unresolvedCount !== 1 ? 's' : ''} to resolve` : 'Confirm & Save'}
</button>
```

- [ ] **Step 4: Verify build passes**

```bash
npm run build
```

Expected: clean build. Fix any TypeScript errors on imports.

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all tests pass including extraction-validator tests.

- [ ] **Step 6: Commit**

```bash
git add src/components/agreements/ExtractionReview.tsx
git commit -m "feat: extraction review — flags panel, fix/accept/re-upload, save gate"
```

---

## Task 5: Update rescan route to return current values + flags

**Files:**
- Modify: `src/app/api/agreements/[id]/rescan/route.ts`

- [ ] **Step 1: Update the route to fetch current stored values and run validation**

Replace the full content of `src/app/api/agreements/[id]/rescan/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractAgreementData } from '@/lib/claude'
import { validateExtraction } from '@/lib/extraction-validator'

export const maxDuration = 60

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const userRole = request.headers.get('x-user-role')
    if (userRole !== 'coordinator' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const supabase = createAdminClient()

    // 1. Fetch agreement + current payout rows
    const [{ data: agreement, error: fetchError }, { data: currentRows }] = await Promise.all([
      supabase.from('agreements').select('*').eq('id', id).single(),
      supabase.from('payout_schedule').select('*').eq('agreement_id', id).order('period_from', { ascending: true }),
    ])

    if (fetchError || !agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 })
    }

    // 2. Download stored document
    const { data: fileDataPdf } = await supabase.storage
      .from('agreements')
      .download(`${agreement.reference_id}/original.pdf`)

    let fileData = fileDataPdf
    let mimeType: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' = 'application/pdf'

    if (!fileDataPdf) {
      const { data: fileDataDocx } = await supabase.storage
        .from('agreements')
        .download(`${agreement.reference_id}/original.docx`)
      if (!fileDataDocx) {
        return NextResponse.json({ error: 'Original document not found in storage' }, { status: 404 })
      }
      fileData = fileDataDocx
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    }

    // 3. Extract
    const fileBuffer = Buffer.from(await fileData!.arrayBuffer())
    const extracted = await extractAgreementData(fileBuffer, mimeType)

    // 4. Validate extracted data
    const flags = validateExtraction(extracted)

    // 5. Return extracted + current stored values for diff
    return NextResponse.json({
      extracted,
      flags,
      current: {
        agreement: {
          agreement_date: agreement.agreement_date,
          investment_start_date: agreement.investment_start_date,
          agreement_type: agreement.agreement_type,
          investor_name: agreement.investor_name,
          investor_pan: agreement.investor_pan,
          investor_aadhaar: agreement.investor_aadhaar,
          investor_address: agreement.investor_address,
          tds_filing_name: agreement.tds_filing_name,
          principal_amount: agreement.principal_amount,
          roi_percentage: agreement.roi_percentage,
          payout_frequency: agreement.payout_frequency,
          interest_type: agreement.interest_type,
          lock_in_years: agreement.lock_in_years,
          maturity_date: agreement.maturity_date,
        },
        payoutRows: currentRows ?? [],
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/agreements/\[id\]/rescan/route.ts
git commit -m "feat: rescan route — return current stored values + validation flags"
```

---

## Task 6: New rescan/apply route (atomic update)

**Files:**
- Create: `src/app/api/agreements/[id]/rescan/apply/route.ts`

- [ ] **Step 1: Create the apply route**

Create `src/app/api/agreements/[id]/rescan/apply/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ExtractedAgreement, ExtractedPayoutRow } from '@/lib/claude'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const userRole = request.headers.get('x-user-role')
    if (userRole !== 'coordinator' && userRole !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const body = await request.json() as {
      extracted: ExtractedAgreement
      acceptedFlags?: string[] // flag IDs that were accepted as-is
    }

    const { extracted } = body
    if (!extracted) {
      return NextResponse.json({ error: 'extracted is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    // 1. Update agreement fields
    const { error: updateError } = await supabase
      .from('agreements')
      .update({
        agreement_date: extracted.agreement_date,
        investment_start_date: extracted.investment_start_date,
        agreement_type: extracted.agreement_type,
        investor_name: extracted.investor_name,
        investor_pan: extracted.investor_pan ?? null,
        investor_aadhaar: extracted.investor_aadhaar ?? null,
        investor_address: extracted.investor_address ?? null,
        tds_filing_name: extracted.tds_filing_name ?? null,
        nominees: extracted.nominees ?? [],
        principal_amount: extracted.principal_amount,
        roi_percentage: extracted.roi_percentage,
        payout_frequency: extracted.payout_frequency,
        interest_type: extracted.interest_type,
        lock_in_years: extracted.lock_in_years,
        maturity_date: extracted.maturity_date,
        payments: extracted.payments ?? [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // 2. Delete existing payout rows
    const { error: deleteError } = await supabase
      .from('payout_schedule')
      .delete()
      .eq('agreement_id', id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // 3. Insert new payout rows
    const newRows = (extracted.payout_schedule ?? []).map((row: ExtractedPayoutRow) => ({
      agreement_id: id,
      period_from: row.period_from,
      period_to: row.period_to,
      no_of_days: row.no_of_days ?? null,
      due_by: row.due_by,
      gross_interest: row.gross_interest ?? 0,
      tds_amount: row.tds_amount ?? 0,
      net_interest: row.net_interest ?? 0,
      is_principal_repayment: row.is_principal_repayment ?? false,
      is_tds_only: (row as ExtractedPayoutRow & { is_tds_only?: boolean }).is_tds_only ?? false,
      tds_filed: false,
      status: 'pending',
    }))

    if (newRows.length > 0) {
      const { error: insertError } = await supabase
        .from('payout_schedule')
        .insert(newRows)

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ success: true, rowsInserted: newRows.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500 }
    )
  }
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/agreements/[id]/rescan/apply/route.ts"
git commit -m "feat: rescan/apply route — atomically update agreement + replace payout rows"
```

---

## Task 7: RescanModal — diff view + flags + payout schedule update

**Files:**
- Modify: `src/components/agreements/RescanModal.tsx`

- [ ] **Step 1: Add imports**

At the top of `src/components/agreements/RescanModal.tsx`, update imports to include:

```ts
import { validateExtraction } from '@/lib/extraction-validator'
import type { ExtractionFlag } from '@/lib/extraction-validator'
import type { ExtractedAgreement } from '@/lib/claude'
```

- [ ] **Step 2: Replace the full RescanModal component**

Replace the entire content of `src/components/agreements/RescanModal.tsx` with:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw, X, AlertTriangle, Check } from 'lucide-react'
import type { ExtractedAgreement } from '@/lib/claude'
import { validateExtraction } from '@/lib/extraction-validator'
import type { ExtractionFlag } from '@/lib/extraction-validator'

interface CurrentAgreement {
  agreement_date: string
  investment_start_date: string
  agreement_type: string
  investor_name: string
  investor_pan: string | null
  investor_aadhaar: string | null
  investor_address: string | null
  tds_filing_name: string | null
  principal_amount: number
  roi_percentage: number
  payout_frequency: string
  interest_type: string
  lock_in_years: number
  maturity_date: string
}

interface CurrentPayoutRow {
  period_from: string
  period_to: string
  due_by: string
  gross_interest: number
  tds_amount: number
  net_interest: number
  is_tds_only: boolean
  is_principal_repayment: boolean
  status: string
}

interface RescanResult {
  extracted: ExtractedAgreement
  flags: ExtractionFlag[]
  current: {
    agreement: CurrentAgreement
    payoutRows: CurrentPayoutRow[]
  }
}

const AGREEMENT_DIFF_FIELDS: Array<{ key: keyof CurrentAgreement; label: string }> = [
  { key: 'investor_name', label: 'Investor Name' },
  { key: 'agreement_date', label: 'Agreement Date' },
  { key: 'investment_start_date', label: 'Start Date' },
  { key: 'maturity_date', label: 'Maturity Date' },
  { key: 'principal_amount', label: 'Principal' },
  { key: 'roi_percentage', label: 'ROI %' },
  { key: 'payout_frequency', label: 'Frequency' },
  { key: 'interest_type', label: 'Interest Type' },
  { key: 'investor_pan', label: 'PAN' },
  { key: 'investor_aadhaar', label: 'Aadhaar' },
]

function fmtVal(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return String(v)
}

function DiffRow({ label, current, extracted }: { label: string; current: string; extracted: string }) {
  const changed = current !== extracted
  return (
    <div className={`grid grid-cols-3 gap-2 py-1.5 border-b border-slate-800 text-xs ${changed ? 'bg-amber-900/10' : ''}`}>
      <span className="text-slate-500">{label}</span>
      <span className={changed ? 'text-slate-400 line-through' : 'text-slate-300'}>{current}</span>
      <span className={changed ? 'text-amber-300 font-semibold' : 'text-slate-300'}>{extracted}</span>
    </div>
  )
}

function FlagsPanelInline({
  flags,
  onAccept,
  onRetry,
}: {
  flags: ExtractionFlag[]
  onAccept: (flagId: string, note: string) => void
  onRetry: () => void
}) {
  const [acceptNotes, setAcceptNotes] = useState<Record<string, string>>({})
  const [accepting, setAccepting] = useState<string | null>(null)

  const pending = flags.filter(f => f.resolution === 'pending')
  if (flags.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
        <AlertTriangle className="w-3.5 h-3.5" />
        {pending.length} issue{pending.length !== 1 ? 's' : ''} in extracted data
      </p>
      {flags.map(flag => (
        <div key={flag.id} className={`border-l-4 rounded-lg p-3 space-y-2 ${
          flag.resolution === 'pending' ? 'border-red-500 bg-red-900/10' :
          flag.resolution === 'accepted' ? 'border-amber-500 bg-amber-900/10' :
          'border-emerald-500 bg-emerald-900/10'
        }`}>
          <p className="text-xs text-slate-200">{flag.message}</p>
          <p className="text-[11px] text-slate-400">
            Expected: <span className="text-emerald-400">{flag.expected}</span>
            {' · '}Found: <span className="text-red-400">{flag.found}</span>
          </p>
          {flag.resolution === 'pending' && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onRetry}
                className="px-2.5 py-1 text-[11px] font-semibold bg-slate-700 text-slate-300 hover:bg-slate-600 rounded-lg transition-colors">
                Retry scan
              </button>
              {accepting === flag.id ? (
                <div className="flex items-center gap-2 w-full">
                  <input
                    type="text"
                    placeholder="Why is this correct? (required)"
                    value={acceptNotes[flag.id] ?? ''}
                    onChange={e => setAcceptNotes(n => ({ ...n, [flag.id]: e.target.value }))}
                    className="flex-1 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-[11px] text-slate-100 focus:outline-none"
                    autoFocus
                  />
                  <button type="button"
                    disabled={(acceptNotes[flag.id] ?? '').trim().length < 5}
                    onClick={() => { onAccept(flag.id, acceptNotes[flag.id]); setAccepting(null) }}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-amber-700 text-white hover:bg-amber-600 disabled:opacity-40 rounded-lg">
                    Confirm
                  </button>
                  <button type="button" onClick={() => setAccepting(null)}
                    className="text-[11px] text-slate-400 hover:text-slate-200">Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => setAccepting(flag.id)}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-amber-900/30 text-amber-400 hover:bg-amber-900/50 rounded-lg transition-colors">
                  Accept as-is
                </button>
              )}
            </div>
          )}
          {flag.resolution === 'accepted' && (
            <p className="text-[11px] text-amber-400/70 italic">Accepted: {flag.acceptanceNote}</p>
          )}
        </div>
      ))}
    </div>
  )
}

export default function RescanModal({ agreementId }: { agreementId: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<RescanResult | null>(null)
  const [flags, setFlags] = useState<ExtractionFlag[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const router = useRouter()

  const unresolvedCount = flags.filter(f => f.resolution === 'pending').length

  async function handleRescan() {
    setLoading(true)
    setError(null)
    setResult(null)
    setFlags([])
    setIsOpen(true)

    try {
      const res = await fetch(`/api/agreements/${agreementId}/rescan`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to rescan document')
      }
      const data: RescanResult = await res.json()
      setResult(data)
      setFlags(data.flags.map(f => ({ ...f, resolution: 'pending' as const })))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error during rescan')
    } finally {
      setLoading(false)
    }
  }

  function handleAccept(flagId: string, note: string) {
    setFlags(prev => prev.map(f => f.id === flagId ? { ...f, resolution: 'accepted' as const, acceptanceNote: note } : f))
  }

  async function handleConfirm() {
    if (!result) return
    setSaving(true)
    setError(null)

    try {
      const res = await fetch(`/api/agreements/${agreementId}/rescan/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extracted: result.extracted }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to apply rescan')
      }
      setIsOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error applying rescan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button type="button" onClick={handleRescan}
        className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors flex items-center gap-1.5">
        <RefreshCw className="w-3 h-3" />
        Re-scan Doc
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="p-4 border-b border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
                Re-scan Agreement
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {loading && (
                <div className="py-12 flex flex-col items-center justify-center space-y-4">
                  <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                  <p className="text-slate-400 animate-pulse">Gemini is re-reading the document...</p>
                </div>
              )}

              {error && (
                <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              )}

              {result && !loading && (
                <>
                  <div className="bg-emerald-900/20 border border-emerald-800/50 rounded-xl p-4 flex gap-3">
                    <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-emerald-300">
                      Extraction complete — review changes below.
                      {flags.length === 0
                        ? ' No issues found.'
                        : ` ${flags.length} issue${flags.length !== 1 ? 's' : ''} flagged — resolve before saving.`}
                    </p>
                  </div>

                  {/* Flags */}
                  {flags.length > 0 && (
                    <FlagsPanelInline
                      flags={flags}
                      onAccept={handleAccept}
                      onRetry={() => { setIsOpen(false); setTimeout(handleRescan, 100) }}
                    />
                  )}

                  {/* Agreement field diff */}
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Agreement Fields</p>
                    <div className="grid grid-cols-3 gap-2 pb-1.5 border-b border-slate-700 text-[10px] text-slate-500 uppercase tracking-wider">
                      <span>Field</span><span>Current</span><span>New (amber = changed)</span>
                    </div>
                    {AGREEMENT_DIFF_FIELDS.map(({ key, label }) => (
                      <DiffRow
                        key={key}
                        label={label}
                        current={fmtVal((result.current.agreement as Record<string, unknown>)[key] as string | number | null)}
                        extracted={fmtVal((result.extracted as unknown as Record<string, unknown>)[key] as string | number | null)}
                      />
                    ))}
                  </div>

                  {/* Payout schedule diff */}
                  <div>
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Payout Schedule — {result.current.payoutRows.length} current → {result.extracted.payout_schedule.length} new
                    </p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs text-slate-300">
                        <thead>
                          <tr className="border-b border-slate-700 text-[10px] text-slate-500">
                            <th className="pb-1.5 pr-3 text-left">Status</th>
                            <th className="pb-1.5 pr-3 text-left">Period</th>
                            <th className="pb-1.5 pr-3 text-left">Due</th>
                            <th className="pb-1.5 pr-3 text-right">Gross</th>
                            <th className="pb-1.5 pr-3 text-right">TDS</th>
                            <th className="pb-1.5 text-right">Net</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.extracted.payout_schedule.map((row, i) => {
                            const cur = result.current.payoutRows[i]
                            const isNew = !cur
                            const grossChanged = cur && cur.gross_interest !== row.gross_interest
                            const tdsChanged = cur && cur.tds_amount !== row.tds_amount
                            const netChanged = cur && cur.net_interest !== row.net_interest
                            return (
                              <tr key={i} className={`border-b border-slate-800 ${isNew ? 'bg-emerald-900/15' : ''}`}>
                                <td className="py-1.5 pr-3">
                                  {isNew
                                    ? <span className="text-[10px] font-bold text-emerald-400">NEW</span>
                                    : (grossChanged || tdsChanged || netChanged)
                                    ? <span className="text-[10px] font-bold text-amber-400">CHANGED</span>
                                    : <span className="text-[10px] text-slate-600">same</span>}
                                </td>
                                <td className="py-1.5 pr-3 whitespace-nowrap">{row.period_from} → {row.period_to}</td>
                                <td className="py-1.5 pr-3 whitespace-nowrap">{row.due_by}</td>
                                <td className={`py-1.5 pr-3 text-right ${grossChanged ? 'text-amber-300 font-semibold' : ''}`}>
                                  {row.gross_interest.toLocaleString('en-IN')}
                                </td>
                                <td className={`py-1.5 pr-3 text-right ${tdsChanged ? 'text-amber-300 font-semibold' : ''}`}>
                                  {row.tds_amount.toLocaleString('en-IN')}
                                </td>
                                <td className={`py-1.5 text-right ${netChanged ? 'text-amber-300 font-semibold' : ''}`}>
                                  {row.net_interest.toLocaleString('en-IN')}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-700 flex justify-between items-center bg-slate-800/50 rounded-b-2xl">
              <button onClick={() => setIsOpen(false)}
                className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors">
                Cancel
              </button>
              {result && !loading && (
                <button
                  onClick={handleConfirm}
                  disabled={saving || unresolvedCount > 0}
                  title={unresolvedCount > 0 ? `Resolve ${unresolvedCount} flagged issue${unresolvedCount !== 1 ? 's' : ''} to continue` : undefined}
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  {saving ? 'Applying…' : unresolvedCount > 0 ? `${unresolvedCount} issue${unresolvedCount !== 1 ? 's' : ''} to resolve` : 'Apply & Save'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Verify build passes**

```bash
npm run build
```

Expected: clean build, no TypeScript errors.

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/agreements/RescanModal.tsx
git commit -m "feat: rescan modal — diff view, flags panel, atomic payout schedule update"
```

---

## Task 8: Update SESSION.md and push

- [ ] **Step 1: Update SESSION.md**

Set Phase → `reviewing`, Active Batch → `Extraction Pipeline Redesign`. List all 7 tasks in Work Completed. Next Agent Action → `Codex: review extraction validator logic, rescan apply route atomicity, and RescanModal diff rendering`.

- [ ] **Step 2: Push all commits**

```bash
git push
```
