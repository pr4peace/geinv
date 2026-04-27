# SESSION

## Branch
- feature/batch-c1-patch

## Phase
- building

## Active Batch
- Batch C.1 — Extraction Fixes + Post-V1 Patch (`feature/batch-c1-patch`)

## Items
- [ ] `src/lib/claude.ts`: add `monthly`/`biannual` to frequency type + prompt rules
- [ ] Fix `investment_start_date` prompt
- [ ] Add `maxOutputTokens: 8192`
- [ ] Better truncation error handling
- [ ] Add frequency validation
- [ ] **Sign out button** in sidebar (`src/app/(app)/layout.tsx`) — call `supabase.auth.signOut()` then redirect to `/login`
- [x] **Sidebar collapse toggle moved to header** — small icon in logo bar, bottom verbose button removed
- [x] **Dashboard layout fix** — removed `max-w-3xl mx-auto` and `min-h-screen`, content now fills full width
- [ ] Build + test clean, release to main

## Work Completed
- Branch created from main (post-V1).

## Files Changed
- TBD

## Codex Review Notes
- TBD

## Decisions
- No migrations, no new features — patch only.

## Next Agent Action
- Gemini: implement all items in `src/lib/claude.ts`, then run `npm run build && npm test`.
