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
- **minor** No new blocking issues found in the current diff. Residual risk: RBAC coverage is still thin. `npm test` passes, but the tests do not exercise middleware header propagation or assert that non-admin roles are rejected across the restricted route/API matrix (`/settings`, `/agreements/new`, `/agreements/import`, `/api/extract`, `/api/team*`, agreement mutation endpoints), so a future regression in access control could ship unnoticed.

## Decisions
- Google OAuth only — no email/password
- RBAC via middleware DB query per request — small team, acceptable overhead
- Role + team ID injected as `x-user-role` / `x-user-team-id` request headers
- Unauthorized users: sign out before redirect to prevent redirect loop
- Salespersons: filter agreements list + hide Import/New buttons
- Settings: middleware blocks non-coordinators, no page-level code change needed

## Next Agent Action
- Codex: Review the applied RBAC alignment fixes (tightening API access to coordinator/admin to match middleware route gates) and test updates.
