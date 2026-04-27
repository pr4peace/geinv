# SESSION

## Branch
- feature/batch-c-agreement-data

## Phase
- building

## Active Batch
- Batch C — Agreement Data + Quick Polish (`feature/batch-c-agreement-data`)

## Items
- [x] Migrations: `015_multiple_payments.sql` + `016_tds_only_payout.sql`
- [x] Multiple payment entries (`payments jsonb[]`)
- [x] Cumulative TDS-only row (`is_tds_only` + `tds_filed`)
- [x] Splash screen
- [x] Version number in sidebar (`v0.1.0`)
- [x] Grey out Quarterly Review + Reports nav
- [x] Collapsible sidebar (localStorage persistence + tooltips)
- [x] Global search bar (agreements + investors)
- [x] Sortable investors table
- [x] Search sanitisation + AbortController stale-response fix
- [x] mark-tds-filed returns 404 when no row matched
- [x] Investor list scoped for salesperson role
- [ ] **Investor detail page scoped for salesperson** ← FIX THIS
- [ ] **Investor CSV download scoped for salesperson** ← FIX THIS
- [ ] Tests for both ^ above
- [ ] Build + test clean, release to main

## Work Completed
- All Batch C features built and Codex-reviewed.
- Two blocking issues remain (detail page + download scoping). See fixes below.

## Files Changed
- See full list in git diff on `feature/batch-c-agreement-data`

## Codex Review Notes
- **blocking**: `src/app/(app)/investors/[id]/page.tsx` — no salesperson scoping. Salesperson can open any investor URL directly.
- **blocking**: `src/app/api/investors/download/route.ts` — exports full dataset, no role check.
- **minor**: No tests for the two blocking issues above.

## Decisions
- `payments jsonb[]` entries: `{ date, mode, bank, amount }`
- `is_tds_only` rows injected at API level for cumulative agreements
- Client-side sort for investors table (small dataset)
- RBAC via `x-user-role` / `x-user-team-id` headers set by middleware

## Next Agent Action
- Gemini (fresh session): Apply these two exact fixes then release.

### Fix 1 — `src/app/(app)/investors/[id]/page.tsx`
Add after imports, at the top of the page function:
```typescript
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'

const headersList = await headers()
const userRole = headersList.get('x-user-role') ?? ''
const userTeamId = headersList.get('x-user-team-id') ?? ''

if (userRole === 'salesperson' && userTeamId) {
  const supabase = createAdminClient()
  const { count } = await supabase
    .from('agreements')
    .select('id', { count: 'exact', head: true })
    .eq('investor_id', params.id)
    .eq('salesperson_id', userTeamId)
    .is('deleted_at', null)
  if (!count) notFound()
}
```

### Fix 2 — `src/app/api/investors/download/route.ts`
Add at the top of the handler, before the main query:
```typescript
const userRole = request.headers.get('x-user-role') ?? ''
const userTeamId = request.headers.get('x-user-team-id') ?? ''

let investorIdFilter: string[] | null = null

if (userRole === 'salesperson' && userTeamId) {
  const { data: agreements } = await supabase
    .from('agreements')
    .select('investor_id')
    .eq('salesperson_id', userTeamId)
    .is('deleted_at', null)
    .not('investor_id', 'is', null)

  investorIdFilter = [
    ...new Set((agreements ?? []).map(a => a.investor_id).filter(Boolean) as string[])
  ]

  if (investorIdFilter.length === 0) {
    return new Response('Name,PAN,Aadhaar,Address\n', {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="investors.csv"',
      },
    })
  }
}

// Then add to the main query:
// if (investorIdFilter !== null) query = query.in('id', investorIdFilter)
```

### Fix 3 — Tests
Add to `src/__tests__/investors-visibility.test.ts`:
- Salesperson cannot load `investors/[id]` for investor outside their portfolio → `notFound()` called
- Salesperson download returns only their investors
- Salesperson download with no agreements returns empty CSV

### After fixes:
```bash
npm run build && npm test
```
Both must pass. Then release:
```bash
git checkout main && git pull
git merge --no-ff feature/batch-c-agreement-data -m "feat: Batch C — V1 release"
git push origin main
git push origin main:feature/investment-tracker
git branch -d feature/batch-c-agreement-data
git push origin --delete feature/batch-c-agreement-data
git add AGENTS.md SESSION.md BACKLOG.md PROMPTS.md CLAUDE.md
git commit -m "chore: post-release sync — Batch C V1"
git push origin main
git push origin main:feature/investment-tracker
```
