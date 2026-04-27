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
  - `POST /api/agreements`: restricted to coordinator/admin only.
  - `GET /api/agreements/[id]`: ownership check for salespeople.
  - `PATCH/DELETE /api/agreements/[id]`: blocked for salespeople.
  - `GET/POST /api/team` and `PATCH /api/team/[id]`: restricted to coordinator/admin only.
  - `POST/DELETE /api/agreements/import`: restricted to coordinator/admin only.
  - `POST /api/agreements/[id]/restore`: restricted to coordinator/admin only.
  - `POST /api/agreements/[id]/upload-signed`: restricted to coordinator/admin only.
  - `POST /api/agreements/[id]/payouts/[payoutId]/notify`: blocked for salespeople.
  - `POST /api/agreements/[id]/payouts/[payoutId]/paid`: blocked for salespeople.
  - `POST /api/extract`: restricted to coordinator/admin only.
- Updated unit tests in `src/__tests__/agreements-api.test.ts` to include the `x-user-role` header for authorized requests.

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
- `src/__tests__/agreements-api.test.ts`
- `SESSION.md`


## Codex Review Notes
- **blocking** The route/page gates are now `coordinator/admin` only for `/settings`, `/agreements/new`, and `/agreements/import` in [src/middleware.ts](/Users/prashanthpalanisamy/Developer/geinv/src/middleware.ts:71), but the corresponding APIs generally only block `salesperson`. That leaves `accountant` and `financial_analyst` users able to bypass the UI restriction and still call privileged write endpoints such as [src/app/api/extract/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/extract/route.ts:8), [src/app/api/agreements/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/agreements/route.ts:68), and [src/app/api/agreements/import/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/agreements/import/route.ts:28). That is a real privilege-escalation mismatch between page RBAC and API RBAC.
- **blocking** The same role mismatch exists for team management. Middleware limits `/settings` to `coordinator/admin`, but [src/app/api/team/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/team/route.ts:6) and [src/app/api/team/[id]/route.ts](/Users/prashanthpalanisamy/Developer/geinv/src/app/api/team/[id]/route.ts:9) only reject `salesperson`. An authenticated accountant or financial analyst can still create, list with `all=true`, or deactivate team members directly through the API.
- **minor** There is still no automated coverage for the new RBAC behavior. `npm test` and `npm run build` pass, but the tests do not cover middleware header propagation or assert that non-admin roles are rejected from restricted routes and APIs, so the authorization mismatches above can ship unnoticed.

## Decisions
- Google OAuth only — no email/password
- RBAC via middleware DB query per request — small team, acceptable overhead
- Role + team ID injected as `x-user-role` / `x-user-team-id` request headers
- Unauthorized users: sign out before redirect to prevent redirect loop
- Salespersons: filter agreements list + hide Import/New buttons
- Settings: middleware blocks non-coordinators, no page-level code change needed

## Next Agent Action
- Codex: Review the applied RBAC alignment fixes (tightening API access to coordinator/admin to match middleware route gates) and test updates.
