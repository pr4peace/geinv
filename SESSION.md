# SESSION

## Branch
- main

## Phase
- building

## Active Batch
- Batch C.6 — Data quality + remaining scoping fixes (push directly to main)

---

## Items for Gemini

### Item 1 — Agreement detail page: salesperson should not see other investors' data via direct URL

**Problem:** A salesperson can type `/agreements/[id]` for any agreement ID and see it, even if it's not theirs.

**File:** `src/app/(app)/agreements/[id]/page.tsx`

**Fix:**
1. Read `x-user-role` and `x-user-team-id` from headers
2. After fetching the agreement, if `userRole === 'salesperson'` and `agreement.salesperson_id !== userTeamId`, call `notFound()`

```ts
const headersList = await headers()
const userRole = headersList.get('x-user-role') ?? ''
const userTeamId = headersList.get('x-user-team-id') ?? ''

// After fetching agreement:
if (userRole === 'salesperson' && agreement.salesperson_id !== userTeamId) {
  notFound()
}
```

---

### Item 2 — Investor detail page: salesperson should not see other investors

**File:** `src/app/(app)/investors/[id]/page.tsx`

Same pattern — after fetching investor, check if any of their agreements belong to this salesperson. If none do, call `notFound()`.

```ts
const headersList = await headers()
const userRole = headersList.get('x-user-role') ?? ''
const userTeamId = headersList.get('x-user-team-id') ?? ''

if (userRole === 'salesperson') {
  // fetch agreements for this investor
  const { data: agreements } = await supabase
    .from('agreements')
    .select('id')
    .eq('investor_id', investor.id)
    .eq('salesperson_id', userTeamId)
    .limit(1)
  
  if (!agreements || agreements.length === 0) notFound()
}
```

---

### Item 3 — KPI cards on dashboard: hide financial totals from salesperson

**Problem:** The dashboard may show total portfolio value, total outstanding etc. — a salesperson should only see their own numbers, not the whole portfolio.

**File:** `src/app/(app)/dashboard/page.tsx` and `src/lib/kpi.ts` (if it exists)

**Fix:** Check if `src/lib/kpi.ts` exists and fetches unscoped data. If so, add `salespersonId` param same as dashboard-reminders.ts. The dashboard page already passes `salespersonId` to the three data functions — apply same pattern to any KPI/stats functions.

---

### Item 4 — Show investor name + reference ID on payout schedule rows

**Problem:** On the payout schedule section of the agreement detail page, there is no quick visual indicator of which agreement/investor a payout belongs to (useful when reviewing).

Actually — skip this one, it's on the agreement detail page which already shows the investor. Remove from this batch.

---

### Item 4 — `fmtFrequency` missing in email templates

**File:** `src/lib/reminders.ts` and `src/lib/email.ts`

Check if payout frequency label in reminder emails says "biannual" or "monthly" in raw form. If so, add a label map inline:
```ts
const freqLabel: Record<string, string> = {
  quarterly: 'Quarterly', annual: 'Annual', cumulative: 'Cumulative',
  biannual: 'Biannual (6-monthly)', monthly: 'Monthly'
}
```
Use it wherever `payout_frequency` is shown in email body.

---

### Item 5 — Agreement list page: clicking a row should go to the agreement detail

**Check:** Verify the agreements table rows are clickable links to `/agreements/[id]`. If not, make the investor name or reference ID a clickable link. Check `src/components/dashboard/AgreementsTable.tsx`.

---

## Todos
- [ ] Item 1 — Block salesperson from viewing other agreements by direct URL
- [ ] Item 2 — Block salesperson from viewing other investors by direct URL
- [ ] Item 3 — Scope KPI/stats on dashboard to salesperson
- [ ] Item 4 — fmtFrequency in email templates
- [ ] Item 5 — Verify agreement rows are clickable

---

## Work Completed
- Batch C.5 complete — updated_at fix, inline confirmations, investor API scoping

## Files Changed
- SESSION.md

## Decisions
- Salesperson isolation must be enforced at the page level (notFound) not just navigation — direct URL access must be blocked
- All financial summary numbers must be scoped

## Codex Review Notes
- Pending

## Next Agent Action
- Gemini: read SESSION.md, summarise all items, wait for confirmation, build 1 → 2 → 3 → 4 → 5, push to main after build passes.
