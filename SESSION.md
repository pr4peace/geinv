# SESSION

## Branch
- main

## Phase
- building

## Active Batch
- Batch C.4 — Salesperson RBAC Fixes (security — push directly to main)

---

## Background

Salesperson role (e.g. George) correctly cannot see agreements/investors pages.
But data leaks via:
- `/calendar` — shows ALL investors' payout events (no salesperson filter)
- `/quarterly-reports` — shows full portfolio aggregate data
- `/quarterly-review` — TDS reconciliation tool, no role gate at all

---

## Items for Gemini

### Item 1 — Block quarterly-reports and quarterly-review from salespersons

**File:** `src/middleware.ts`

**Fix:** Add these two routes to the `restrictedRoutes` array (line ~72):

Current:
```ts
const restrictedRoutes = ['/settings', '/agreements/new', '/agreements/import']
```

Replace with:
```ts
const restrictedRoutes = [
  '/settings',
  '/agreements/new',
  '/agreements/import',
  '/quarterly-reports',
  '/quarterly-review',
]
```

That's it. Middleware already redirects to `/dashboard` for non-coordinators on restricted routes.

---

### Item 2 — Scope calendar to salesperson's agreements only

**File:** `src/app/(app)/calendar/page.tsx`

**Fix:**
1. Import `headers` from `next/headers` at the top
2. Read role and team ID:
```ts
const headersList = await headers()
const userRole = headersList.get('x-user-role') ?? ''
const userTeamId = headersList.get('x-user-team-id') ?? ''
const isSalesperson = userRole === 'salesperson'
```
3. Scope the agreements query — add `.eq('salesperson_id', userTeamId)` if `isSalesperson`:
```ts
let agreementsQuery = supabase
  .from('agreements')
  .select('id, investor_name, reference_id, maturity_date, is_draft, status, interest_type')
  .eq('status', 'active')
  .eq('is_draft', false)
  .is('deleted_at', null)

if (isSalesperson) {
  agreementsQuery = agreementsQuery.eq('salesperson_id', userTeamId)
}

const { data: activeAgreements } = await agreementsQuery
```

The rest of the page (payout schedule fetch by `activeIds`) automatically scopes itself since it uses `.in('agreement_id', activeIds)`.

---

### Item 3 — Cancel button on ExtractionReview save area

**Goal:** Next to the "Save Agreement" button in ExtractionReview, add a "Cancel" button that takes the user back to `/agreements` (the agreements list) entirely — abandoning the upload flow.

**File:** `src/components/agreements/ExtractionReview.tsx`

**Fix:** Find the save button at the bottom of the form (search for "Save Agreement" or the submit button). Add a Cancel button next to it:
```tsx
<a
  href="/agreements"
  className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-500 text-sm transition-colors"
>
  Cancel
</a>
```
Use `<a href>` (not `<Link>`) so it does a full navigation and clears the form state. Place it to the left of the Save button.

---

## Todos
- [ ] Item 1 — Block quarterly-reports + quarterly-review in middleware
- [ ] Item 2 — Scope calendar to salesperson's agreements
- [ ] Item 3 — Cancel button on ExtractionReview save area

---

## Work Completed
- (previous) Batch C.3 complete
- Indian number format fix in extraction prompt (lakh/crore confusion)
- WhatsNewModal moved to dashboard only

## Files Changed
- SESSION.md

## Decisions
- Quarterly reports and review are coordinator/accountant tools — block salesperson entirely
- Calendar stays accessible to salesperson but scoped to their own agreements only

## Codex Review Notes
- Pending

## Next Agent Action
- Gemini: read SESSION.md, confirm the 2 items, wait for approval, then fix. Push to main. Build must pass.
