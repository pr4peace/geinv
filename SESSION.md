# SESSION

## Branch
- feature/doc-url-fix  ← start here (add C, then release)
- feature/investor-delete-safety  ← release second

## Current Task
- Wave 1 release: add doc lifecycle auto-advance to `feature/doc-url-fix`, then release both feature branches to `main`.

---

## TASK C — Doc lifecycle auto-advance (branch: feature/doc-url-fix)

### Goal
When Irene uploads a scanned signed PDF and `is_draft = false`, `doc_status` should be set to `'uploaded'` automatically — skipping the 5-stage lifecycle. Drafts and manual entries still start at `'draft'`.

### Change
**File:** `src/app/api/agreements/route.ts`

In the `POST` handler, find the `supabase.from('agreements').insert(...)` call. Add `doc_status` to the insert payload:

```ts
const docStatus = (temp_path && !agreementFields.is_draft) ? 'uploaded' : 'draft'
// add doc_status: docStatus to the insert payload alongside reference_id and investor_id
```

That's the only change. Run `npm run build` and `npm test` to confirm clean, then push.

---

## RELEASE — Wave 1

After Task C is pushed, execute the release:

### Step 1 — Merge feature/doc-url-fix → main
```bash
git checkout main && git pull
git merge --no-ff feature/doc-url-fix -m "feat: permanent doc storage, doc lifecycle auto-advance"
git push origin main
git branch -d feature/doc-url-fix
git push origin --delete feature/doc-url-fix
```

### Step 2 — Merge feature/investor-delete-safety → main
```bash
git pull
git merge --no-ff feature/investor-delete-safety -m "feat: safe investor deletion with agreement guard"
git push origin main
git branch -d feature/investor-delete-safety
git push origin --delete feature/investor-delete-safety
```

### Step 3 — Sync session files
After both merges, commit and push the session files:
```bash
git add AGENTS.md SESSION.md BACKLOG.md PROMPTS.md CLAUDE.md
git commit -m "chore: post-wave-1 release sync"
git push
```

---

## Todos
- [ ] Task C: add `doc_status` auto-advance to `POST /api/agreements` in `feature/doc-url-fix`
- [ ] Task C: `npm run build` + `npm test` + push
- [ ] Release: merge `feature/doc-url-fix` → `main`
- [ ] Release: merge `feature/investor-delete-safety` → `main`
- [ ] Release: sync session files + push `main`

## Work Completed
-

## Files Changed
- `src/app/api/agreements/route.ts` — add doc_status auto-advance

## Decisions
- `temp_path` present + `is_draft = false` = scanned signed doc → `doc_status: 'uploaded'`
- All other cases (manual entry, draft upload) → `doc_status: 'draft'`, full lifecycle applies
- Wave 2 items (multiple payments, RBAC) planned but NOT implemented this session

## Codex Review Notes
-

## Next Agent Action
- Gemini: Checkout `feature/doc-url-fix`, add Task C (one condition in the agreements POST route), verify `npm run build` + `npm test` clean, push. Then execute the Wave 1 release steps above. Update SESSION.md Work Completed after release.
