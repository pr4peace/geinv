# SESSION

## Branch
- feature/wave-2-remove-e2e

## Current Task
- Release E2E removal to main, then start Batch A (Auth & Access) on `feature/batch-a-auth`.

---

## TASK 0 — Remove E2E tests ✅ Code complete, pending release

### Goal
E2E tests run against live prod, require credentials no agent has, and block every release with noise. Remove entirely. Rely on `npm run build` + `npm test` (Vitest) as the only gate.

### Work done on this branch
- Deleted `e2e/` directory and `playwright.config.ts`
- Removed `test:e2e` script and `@playwright/test` from `package.json`
- Updated `AGENTS.md` and `CLAUDE.md` to remove E2E references
- Build and unit tests verified clean

### Release steps (next action)
```bash
git checkout main && git pull
git merge --no-ff feature/wave-2-remove-e2e -m "chore: remove E2E tests — rely on vitest unit tests only"
git push origin main
git branch -d feature/wave-2-remove-e2e
git push origin --delete feature/wave-2-remove-e2e
git add AGENTS.md SESSION.md BACKLOG.md PROMPTS.md CLAUDE.md
git commit -m "chore: post-wave-2-task-0 session sync"
git push
```

---

## BATCH A — Auth & Access (next, after Task 0 released)

**Branch:**
```bash
git checkout main && git pull
git checkout -b feature/batch-a-auth
```

### Item 1 — Google login
- Replace entire email/password form in `src/app/login/page.tsx` with a single "Sign in with Google" button
- Call `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: \`${window.location.origin}/auth/callback\` } })`
- Keep "Good Earth / Investment Tracker" heading, dark slate background
- **Pre-requisite:** Google OAuth was configured in Supabase on 2026-04-27 — verify the provider is active before building

### Item 2 — Role-based access control
- `src/middleware.ts`: after session check, query `team_members` by email; redirect to `/login?error=access_denied` if not found or `is_active = false`
- `src/app/login/page.tsx`: show "You don't have access." on `?error=access_denied`
- Agreements page: salespersons see only agreements where `salesperson_id` matches their team member ID
- Settings page: visible to coordinators and admins only

### Release after both items pass build + test
```bash
git checkout main && git pull
git merge --no-ff feature/batch-a-auth -m "feat: Google login + RBAC"
git push origin main
git branch -d feature/batch-a-auth
git push origin --delete feature/batch-a-auth
```

---

## BATCH B — Calendar & Reminders (after A)

Branch: `feature/batch-b-calendar` — see BACKLOG.md for full item list.

---

## BATCH C — Agreement Data (after B)

Branch: `feature/batch-c-agreement-data` — see BACKLOG.md for full item list.

---

## BATCH D — Dashboard & UI Polish (after C)

Branch: `feature/batch-d-dashboard` — see BACKLOG.md for full item list.

---

## Todos
- [x] Task 0: delete e2e/ + playwright.config.ts + remove from package.json + update AGENTS.md + CLAUDE.md
- [x] Task 0: build + test verified clean
- [ ] Task 0: release to main + sync session files
- [ ] Task 0: release to main + sync session files
- [ ] Batch A: Google login + RBAC on `feature/batch-a-auth`, release
- [ ] Batch B: Calendar bugs + rebuild + reminders on `feature/batch-b-calendar`, release
- [ ] Batch C: Multiple payments + cumulative TDS on `feature/batch-c-agreement-data`, release
- [ ] Batch D: Dashboard + polish on `feature/batch-d-dashboard`, release

## Work Completed
- **Task 0:** E2E tests removed. Build and unit tests pass.

## Files Changed
- `e2e/` (deleted)
- `playwright.config.ts` (deleted)
- `package.json`
- `AGENTS.md`
- `CLAUDE.md`

## Decisions
- Each Wave 2 task gets its own branch; SESSION.md `## Branch` shows only the active branch at any time
- PROMPTS.md cleanup (removing duplicates, adding pre-work summary) was a separate approved change committed on this branch — not scope creep
- Google OAuth config is environment state, not repo state — Gemini must verify the provider is enabled before building Task G
- E2E removed permanently; `npm run build` + `npm test` is the gate

## Codex Review Notes
- Resolved: `## Branch` now shows only the active branch
- Resolved: Todos updated to accurately reflect Task 0 status (code done, release pending)
- Resolved: Google OAuth marked as environment-dependent, not "done"
- Resolved: BACKLOG.md Byju entry cleaned up

## Next Agent Action
- Gemini: Release Task 0 to main using the steps above, then create `feature/wave-2-calendar` and start Task D.
