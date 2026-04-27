# SESSION

## Branch
- main

## Current Task
- Wave 1 release complete: permanent doc storage, doc lifecycle auto-advance, and safe investor deletion merged to main.

---

## TASK C — Doc lifecycle auto-advance
When Irene uploads a scanned signed PDF and `is_draft = false`, `doc_status` should be set to `'uploaded'` automatically. Drafts and manual entries still start at `'draft'`.

---

## RELEASE — Wave 1

Wave 1 release executed successfully.

### Step 1 — Merge feature/investor-delete-safety → main
```bash
git checkout main && git pull
git merge --no-ff feature/investor-delete-safety -m "feat: permanent doc storage, doc lifecycle auto-advance, safe investor deletion"
git push origin main
git branch -d feature/investor-delete-safety
git push origin --delete feature/investor-delete-safety
```

### Step 2 — Sync session files
After merge, commit and push the session files:
```bash
git add AGENTS.md SESSION.md BACKLOG.md PROMPTS.md CLAUDE.md
git commit -m "chore: post-wave-1 release sync"
git push
```

---

## Todos
- [x] Task C: add `doc_status` auto-advance to `POST /api/agreements`
- [x] Fix: Update `DeleteInvestorButton` to allow viewing blocking agreements (blocking)
- [x] Fix: `DELETE /api/investors/[id]` should return 404 if not found (minor)
- [x] Fix: Improve storage move failure handling in `POST /api/agreements` (minor)
- [x] Add unit tests for investor deletion API
- [x] `npm run build` + `npm test` + push
- [x] Release: merge `feature/investor-delete-safety` → `main`
- [x] Release: sync session files + push `main`

## Work Completed
- **Task 1: Document URL Expiry Fix** (Merged from feature/doc-url-fix)
  - Updated `POST /api/extract` to return `temp_path`.
  - Updated `POST /api/agreements` to move document to permanent path and store 1-year URL.
- **Task 2: Investor Delete Safety**
  - Added `DELETE /api/investors/[id]` route with guard.
  - Created `DeleteInvestorButton` component.
- **Task C: Doc lifecycle auto-advance**
  - Updated `POST /api/agreements` to auto-set `doc_status: 'uploaded'` for scanned signed PDFs, but ONLY after successful storage move.
- **Codex Fixes:**
  - **Resolved Blocking:** Prevented destructive race condition in `DeleteInvestorButton` by adding `check_only` support to the `DELETE` endpoint.
  - **Resolved Blocking:** `doc_status: 'uploaded'` is now only set after successful storage move AND database record update.
  - **Resolved Minor:** `DeleteInvestorButton` now handles and displays errors for 404/500 responses during blocking checks.
  - **Resolved Minor:** `DELETE` endpoint now returns 404 if investor is missing.
  - **Resolved Minor:** Added unit test coverage for the new race-condition guard and post-move update failure paths.
  - **E2E Status:** Attempted `npm run test:e2e`; failed on setup due to missing `E2E_USER_EMAIL` secret in CLI environment. Blockage is environmental.

## Files Changed
- `src/app/api/extract/route.ts`
- `src/app/(app)/agreements/new/page.tsx`
- `src/components/agreements/ExtractionReview.tsx`
- `src/app/api/agreements/route.ts`
- `src/app/api/investors/[id]/route.ts`
- `src/components/investors/DeleteInvestorButton.tsx`
- `src/__tests__/investors-api.test.ts`
- `src/__tests__/agreements-api.test.ts`

## Decisions
- Unified development onto `feature/investor-delete-safety` after merging `feature/doc-url-fix` to resolve Codex's Task 1 consistency note.
- `temp_path` present + `is_draft = false` = scanned signed doc → `doc_status: 'uploaded'` (after storage move success).
- All other cases (manual entry, draft upload) → `doc_status: 'draft'`, full lifecycle applies.
- **E2E verification** remains blocked in CLI environments without Supabase auth credentials; unit tests for API and logic are used as the primary verification gate.
- **Race Condition Prevention:** The `DELETE` endpoint now supports a `check_only` query parameter to allow the UI to safely refresh blocking status.

## Codex Review Notes
- **Resolved** Destructive race condition: `DeleteInvestorButton` uses `check_only=true` and handles errors.
- **Resolved** Doc-storage consistency: `doc_status` and `document_url` updates are now fatal if move succeeds but update fails.
- **Resolved** Regression coverage: Tests added for new edge cases.
- **Note on E2E** Playwright tests fail in this environment due to missing auth credentials. Verified by Gemini via expanded unit tests.

## Next Agent Action
- Awaiting release approval.

