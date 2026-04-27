# SESSION

## Branch
- feature/batch-a-auth

## Phase
- reviewing

## Active Batch
- Batch A — Auth & Access (`feature/batch-a-auth`)

## Items
- [x] Item 1: Google-only login page (`src/app/login/page.tsx`)
- [x] Item 2: Middleware RBAC (`src/middleware.ts`)
- [x] Item 3: Agreements salesperson filter (`src/app/(app)/agreements/page.tsx`)
- [x] Build + test clean, release to main

## Work Completed
- Replaced email/password login with a single Google OAuth button.
- Added `<Suspense>` boundary for `useSearchParams` in login page to comply with Next.js 14 standards.
- Implemented RBAC in middleware: checks `team_members` for active status and gates `/settings`, `/agreements/new`, and `/agreements/import`.
- Injected `x-user-role` and `x-user-team-id` headers for downstream data filtering (Fixed: now correctly propagating cookies when headers are set).
- Updated Agreements page to filter by `salesperson_id` and hide administrative buttons for salespersons.
- Fixed: RBAC middleware now fails closed on DB/network errors.
- Fixed: Middleware now preserves auth cookies during redirects and when setting custom request headers, ensuring `signOut` and session refreshes are correctly propagated.
- Added server-side RBAC to API routes:
  - `GET /api/agreements`: forced salesperson scoping.
  - `POST /api/agreements`: blocked for salespeople.
  - `GET /api/agreements/[id]`: ownership check for salespeople.
  - `PATCH/DELETE /api/agreements/[id]`: blocked for salespeople.
  - `GET/POST /api/team`: blocked for salespeople.

## Files Changed
- `src/app/login/page.tsx`
- `src/middleware.ts`
- `src/app/(app)/agreements/page.tsx`
- `src/app/api/agreements/route.ts`
- `src/app/api/agreements/[id]/route.ts`
- `src/app/api/team/route.ts`
- `SESSION.md`


## Codex Review Notes
- **blocking** [src/middleware.ts](/Users/prashanthpalanisamy/Developer/geinv/src/middleware.ts:79) only gates `/settings`. The branch hides `Import historical` and `+ New Agreement` for salespeople in [src/app/(app)/agreements/page.tsx](/Users/prashanthpalanisamy/Developer/geinv/src/app/(app)/agreements/page.tsx:72), but [src/app/(app)/agreements/new/page.tsx](/Users/prashanthpalanisamy/Developer/geinv/src/app/(app)/agreements/new/page.tsx:1) and [src/app/(app)/agreements/import/page.tsx](/Users/prashanthpalanisamy/Developer/geinv/src/app/(app)/agreements/import/page.tsx:1) are still directly reachable by URL. A salesperson can bypass the UI restriction by navigating to those routes directly.
- **blocking** [src/app/api/agreements/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/agreements/route.ts:12) and [src/app/api/team/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/team/route.ts:4) still use the admin Supabase client with no role validation. Any authenticated salesperson can call the agreements APIs directly to list unscoped records or create agreements, and can query the full team roster through `/api/team`, regardless of the page-level restrictions added in this batch.
- **minor** There is still no automated coverage for the new RBAC behavior. `npm test` and `npm run build` pass, but there are no tests proving that salespeople are blocked from restricted routes/APIs or that agreements are consistently scoped server-side, so these authorization gaps can ship unnoticed.

## Decisions
- Google OAuth only — no email/password
- RBAC via middleware DB query per request — small team, acceptable overhead
- Role + team ID injected as `x-user-role` / `x-user-team-id` request headers
- Unauthorized users: sign out before redirect to prevent redirect loop
- Salespersons: filter agreements list + hide Import/New buttons
- Settings: middleware blocks non-coordinators, no page-level code change needed

## Next Agent Action
- Codex: Review the applied fixes for route gating and API-level RBAC enforcement.
