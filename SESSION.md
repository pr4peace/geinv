# SESSION

## Branch
- main

## Phase
- ready for team use

## Active Batch
- Pre-Launch Finalisation — COMPLETE

## Items
- [x] **Final Codex review** — full review of all code on `main`
- [x] **Security fixes** — role gates, salesperson scoping, atomic reminder process
- [x] **Data wipe** — all test data deleted from Supabase
- [x] **Vercel production branch → main** — switched, deploys on every push to main
- [x] **Delete stale remote branches** — `origin/feature/investment-tracker` and sidebar-collapse gone
- [x] **GitHub default branch → main**
- [x] Remove `git push origin main:feature/investment-tracker` from AGENTS.md and PROMPTS.md

## Work Completed
- Full pre-launch checklist complete.
- Vercel now deploys from `main` automatically.
- All test data wiped. Ready for real team use.
- Git hygiene: only `main` and active batch branches going forward.

## Files Changed
- AGENTS.md, PROMPTS.md, SESSION.md, BACKLOG.md

## Codex Review Notes
- All blocking issues resolved.

## Decisions
- Vercel production branch is `main`. No more manual push to `feature/investment-tracker`.
- GitHub default branch is `main`.

## Next Agent Action
- Claude: plan Batch D (Offer Letter Flow) or next task from BACKLOG.md.
