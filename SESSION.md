# SESSION

## Branch
- main

## Phase
- building

## Active Batch
- Batch C.3 — Small hotfixes (working directly on main, no branch needed)

---

## Items for Gemini

### Item 1 — Backfill TDS rows for existing cumulative/compound agreements

**Goal:** A one-time repair button in the Settings page for agreements uploaded before the TDS-row fix. Finds all cumulative/compound agreements with no `is_tds_only` rows and inserts missing 31st March TDS rows.

**Files:**
- `src/app/api/admin/backfill-tds-rows/route.ts` — new API route (POST)
- `src/app/(app)/settings/page.tsx` — add "Maintenance" section with button

**API route (`POST /api/admin/backfill-tds-rows`):**
1. Role-gate: coordinator or admin only
2. Fetch all agreements where `payout_frequency = 'cumulative' OR interest_type = 'compound'` and `deleted_at IS NULL`
3. For each, check if any `payout_schedule` rows with `is_tds_only = true` exist
4. If none: generate 31 March rows for each year in `investment_start_date → maturity_date` (same loop logic as `src/app/api/agreements/route.ts` lines ~258–295)
5. Insert the missing rows
6. Return `{ updated: N, skipped: M }`

**Settings page:**
- Add "Maintenance" section at the bottom
- Button: "Backfill TDS Filing Rows" with description
- On click: `confirm()` → POST → show result
- Extract as small `BackfillTdsButton` client component

---

### Item 2 — fmtFrequency missing biannual and monthly

**File:** `src/app/(app)/agreements/[id]/page.tsx` line 55

**Fix:**
```ts
return { quarterly: 'Quarterly', annual: 'Annual', cumulative: 'Cumulative', biannual: 'Biannual', monthly: 'Monthly' }[freq] ?? freq
```

---

### Item 3 — ExtractionReview: auto-set cumulative when interest_type changes to compound

**File:** `src/components/agreements/ExtractionReview.tsx`

Find the `onChange` for the `interest_type` select and change to:
```tsx
onChange={e => {
  const val = e.target.value as InterestType
  update('interest_type', val)
  if (val === 'compound') update('payout_frequency', 'cumulative')
}}
```

---

## Todos
- [x] Item 1 — Backfill TDS rows (Settings button + API)
- [x] Item 2 — fmtFrequency biannual/monthly labels
- [x] Item 3 — ExtractionReview auto-set cumulative on compound select

---

## Work Completed
- Item 1: Created `src/app/api/admin/backfill-tds-rows/route.ts` API and `src/components/settings/BackfillTdsButton.tsx` component. Added Maintenance section to `src/app/(app)/settings/page.tsx`.
- Item 2: Updated `fmtFrequency` in `src/app/(app)/agreements/[id]/page.tsx` to support `biannual` and `monthly`.
- Item 3: Updated `src/components/agreements/ExtractionReview.tsx` to auto-set `payout_frequency` to `cumulative` when `interest_type` is changed to `compound`.

## Files Changed
- `src/app/api/admin/backfill-tds-rows/route.ts`
- `src/components/settings/BackfillTdsButton.tsx`
- `src/app/(app)/settings/page.tsx`
- `src/app/(app)/agreements/[id]/page.tsx`
- `src/components/agreements/ExtractionReview.tsx`
- `SESSION.md`

## Decisions
- Working directly on main for these small safe fixes
- Backfill button coordinator/admin only
- Added `Maintenance` section to Settings for future admin tools

## Codex Review Notes
- Pending

## Next Agent Action
- Codex: review the changes for Batch C.3.

