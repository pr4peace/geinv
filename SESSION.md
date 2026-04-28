# SESSION

## Branch
- main

## Phase
- building

## Active Batch
- Batch C.5 — UI polish + bug fixes (push directly to main)

---

## Items for Gemini

### Item 1 — Remove `updated_at` from mark-past-paid API (causes DB error)

**File:** `src/app/api/agreements/[id]/mark-past-paid/route.ts`

The `payout_schedule` table has no `updated_at` column. Remove it from the update payload.

Replace:
```ts
.update({ 
  status: 'paid', 
  paid_date: todayStr,
  updated_at: new Date().toISOString()
})
```
With:
```ts
.update({ status: 'paid', paid_date: todayStr })
```

---

### Item 2 — Replace all `confirm()` and `alert()` in PayoutScheduleSection with inline UI

**File:** `src/components/agreements/PayoutScheduleSection.tsx`

Currently uses native browser `confirm()` for bulk mark and revert, and `alert()` for errors. Replace with inline confirmation UI.

**Plan:**
1. Add state: `const [confirmBulk, setConfirmBulk] = useState(false)` and `const [confirmRevert, setConfirmRevert] = useState<string | null>(null)`
2. Remove all `confirm()` and `alert()` calls
3. For the bulk "Mark all past payouts as paid" button: clicking it sets `confirmBulk = true`, which shows an inline confirmation row:
   - Text: "Mark all past payouts as paid? This cannot be undone easily."
   - Two buttons: "Yes, mark paid" (calls `markPastPaid()`) and "Cancel" (sets `confirmBulk = false`)
4. For each "Revert" button on paid rows: clicking sets `confirmRevert = row.id`, which replaces that row's action cell with "Confirm revert?" + "Yes" + "No" buttons inline
5. For errors: set a local `error` state string and show it as a small red text below the relevant section instead of `alert()`

---

### Item 3 — Also remove `confirm()` from revert in PayoutScheduleSection

Already covered in Item 2 above — both bulk and per-row confirmations replaced with inline UI.

---

### Item 4 — `revertPayout` API: check for `updated_at` column too

**File:** `src/app/api/agreements/[id]/payouts/[payoutId]/revert/route.ts`

Check if this route also sets `updated_at`. If so, remove it — same issue as Item 1.

---

### Item 5 — Investors list: salesperson should only see their investors

**File:** `src/app/(app)/investors/page.tsx`

Read `x-user-role` and `x-user-team-id` headers. If salesperson, only show investors linked to agreements where `salesperson_id = userTeamId`.

Query: fetch `agreement_id`s where `salesperson_id = userTeamId`, then filter investors by those `investor_id`s. Or join through agreements.

---

## Todos
- [ ] Item 1 — Remove updated_at from mark-past-paid API
- [ ] Item 2+3 — Replace confirm/alert with inline UI in PayoutScheduleSection
- [ ] Item 4 — Check revert API for same updated_at issue
- [ ] Item 5 — Scope investors list to salesperson

---

## Work Completed
- Splash screen: only shows once per session (sessionStorage guard)
- WhatsNewModal: only shows once per session (sessionStorage guard)
- Dashboard scoped to salesperson's agreements
- Calendar scoped to salesperson's agreements
- quarterly-reports + quarterly-review blocked for salespersons

## Files Changed
- SESSION.md

## Decisions
- No native browser dialogs anywhere — all confirmations inline
- Salesperson data isolation must be complete across all pages

## Codex Review Notes
- Pending

## Next Agent Action
- Gemini: read SESSION.md, summarise 5 items, wait for confirmation, build in order, push to main after build passes.
