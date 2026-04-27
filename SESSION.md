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
  - `POST/DELETE /api/agreements/import`: blocked for salespeople.
  - `POST /api/agreements/[id]/restore`: blocked for salespeople.
  - `POST /api/agreements/[id]/upload-signed`: blocked for salespeople.
  - `POST /api/agreements/[id]/payouts/[payoutId]/notify`: blocked for salespeople.
  - `POST /api/agreements/[id]/payouts/[payoutId]/paid`: blocked for salespeople.
  - `PATCH /api/team/[id]`: blocked for salespeople.
  - `POST /api/extract`: blocked for salespeople.

## Files Changed
- `src/app/login/page.tsx`
- `src/middleware.ts`
- `src/app/(app)/agreements/page.tsx`
- `src/app/api/agreements/route.ts`
- `src/app/api/agreements/[id]/route.ts`
- `src/app/api/team/route.ts`
- `src/app/api/agreements/import/route.ts`
- `src/app/api/agreements/[id]/restore/route.ts`
- `src/app/api/agreements/[id]/upload-signed/route.ts`
- `src/app/api/agreements/[id]/payouts/[payoutId]/notify/route.ts`
- `src/app/api/agreements/[id]/payouts/[payoutId]/paid/route.ts`
- `src/app/api/team/[id]/route.ts`
- `src/app/api/extract/route.ts`
- `SESSION.md`


## Codex Review Notes
- **blocking** The new RBAC checks were added to `GET/POST /api/agreements` and `GET/PATCH/DELETE /api/agreements/[id]`, but sibling mutation endpoints are still unguarded. A salesperson can still call [src/app/api/agreements/import/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/agreements/import/route.ts:28), [src/app/api/agreements/[id]/restore/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/agreements/[id]/restore/route.ts:4), [src/app/api/agreements/[id]/upload-signed/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/agreements/[id]/upload-signed/route.ts:4), [src/app/api/agreements/[id]/payouts/[payoutId]/notify/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/agreements/[id]/payouts/[payoutId]/notify/route.ts:5), and [src/app/api/agreements/[id]/payouts/[payoutId]/paid/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/agreements/[id]/payouts/[payoutId]/paid/route.ts:5) directly, bypassing the intended “salespersons are read-only and scoped” model.
- **blocking** Team-management RBAC is only enforced on [src/app/api/team/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/team/route.ts:4); [src/app/api/team/[id]/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/team/[id]/route.ts:4) still has no role check. Any authenticated salesperson can `PATCH /api/team/:id` and deactivate other users, including coordinators/admins.
- **blocking** [src/app/api/extract/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/extract/route.ts:8) still has no role validation even though `/agreements/new` is now blocked in middleware for salespeople. A salesperson can still hit the extraction endpoint directly to upload files, invoke Gemini, and create temporary storage objects, which defeats the route-level restriction and creates unnecessary cost/abuse risk.
- **minor** There is still no automated coverage for the new RBAC behavior. `npm test` and `npm run build` pass, but the tests do not exercise middleware header propagation or assert that restricted routes and sibling APIs reject salesperson access, so these authorization gaps can ship unnoticed.

## Decisions
- Google OAuth only — no email/password
- RBAC via middleware DB query per request — small team, acceptable overhead
- Role + team ID injected as `x-user-role` / `x-user-team-id` request headers
- Unauthorized users: sign out before redirect to prevent redirect loop
- Salespersons: filter agreements list + hide Import/New buttons
- Settings: middleware blocks non-coordinators, no page-level code change needed

## Next Agent Action
- Codex: Review the applied RBAC fixes for all sibling API endpoints and the extraction route.
