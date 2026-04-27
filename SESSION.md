# SESSION

## Branch
- feature/doc-url-fix  ← start here
- feature/investor-delete-safety  ← do second, after #1 is pushed

## Current Task
- Two sequential fixes for Gemini. Do them in order — finish and push #1 before switching to #2.

---

## TASK 1 — Document URL expiry (branch: feature/doc-url-fix)

### Goal
Uploaded PDFs are saved with a 24-hour signed URL as `document_url`. After 24 hours every document link breaks. Fix: pass the storage `temp_path` back from the extract route, then on agreement save move the file to a permanent path and store a 1-year signed URL instead.

### Plan

**Step 1 — `src/app/api/extract/route.ts`**
- Add `temp_path` to the JSON response alongside `file_url`
- Response becomes: `{ extracted, file_url, temp_path }`
- No other changes — `file_url` (24-hour URL) stays for in-browser preview only

**Step 2 — `src/app/(app)/agreements/new/page.tsx`**
- Extend `ExtractResult` interface: add `temp_path: string`
- Pass `tempPath={extractResult.temp_path}` to `ExtractionReview`

**Step 3 — `src/components/agreements/ExtractionReview.tsx`**
- Add `tempPath: string` to props interface
- In the save body, replace `document_url: fileUrl` with `temp_path: tempPath` (remove `document_url` from the client — the server will set it after moving the file)

**Step 4 — `src/app/api/agreements/route.ts`**
- Receive `temp_path` from the request body
- After inserting the agreement, if `temp_path` is present:
  - Derive extension from the filename in `temp_path`
  - Permanent path: `${reference_id}/original.${ext}`
  - Move: `supabase.storage.from('agreements').move(temp_path, permanentPath)`
  - Generate 1-year signed URL: `createSignedUrl(permanentPath, 60 * 60 * 24 * 365)`
  - Update the agreement: `supabase.from('agreements').update({ document_url: permanentUrl }).eq('id', agreement.id)`
  - If move fails: log the error but do not fail the request — agreement data is more important than the file move

**Step 5 — Verify**
- `npm run build` — clean
- `npm test` — no regressions
- Push: `git add -A && git commit -m "fix: move uploaded docs to permanent path with 1-year URL" && git push -u origin feature/doc-url-fix`

---

## TASK 2 — Investor delete safety (branch: feature/investor-delete-safety)

After Task 1 is pushed, switch branches:
```bash
git checkout feature/investor-delete-safety
git pull
```

### Goal
No DELETE endpoint exists for investors. Add one that blocks if the investor still has non-deleted agreements, and add a delete button to the investor detail page.

### Plan

**Step 1 — `src/app/api/investors/[id]/route.ts`**
- Add `export async function DELETE`
- Query `agreements` where `investor_id = id` AND `deleted_at IS NULL`
- If any found: return 409 `{ error: 'Investor has active agreements', agreements: [{ id, reference_id, status }] }`
- If none: `supabase.from('investors').delete().eq('id', id)`
- Return 200 `{ success: true }`

**Step 2 — `src/components/investors/DeleteInvestorButton.tsx`** (new file)
- `'use client'` component
- Props: `investorId: string`, `investorName: string`, `agreementCount: number`
- If `agreementCount > 0`: disabled button, tooltip "Cannot delete — investor has linked agreements"
- If `agreementCount === 0`:
  - "Delete investor" button (red/destructive style)
  - On click: show inline confirm "Permanently delete {name}? This cannot be undone."
  - On confirm: `DELETE /api/investors/{id}`
  - On success: `router.push('/investors')`
  - On 409: show the blocking agreement list (server check takes precedence)
  - On error: show red message

**Step 3 — `src/app/(app)/investors/[id]/page.tsx`**
- Import `DeleteInvestorButton`
- Pass `investorId={investor.id}`, `investorName={investor.name}`, `agreementCount={agreements?.length ?? 0}`
- Place in the page header next to the back link

**Step 4 — Verify**
- `npm run build` — clean
- `npm test` — no regressions
- Push: `git add -A && git commit -m "feat: add safe investor deletion with agreement guard" && git push`

---

## Todos
- [ ] Task 1: return `temp_path` from extract route
- [ ] Task 1: pass `temp_path` through `new/page.tsx` → `ExtractionReview`
- [ ] Task 1: move file + generate 1-year URL in `POST /api/agreements`
- [ ] Task 1: `npm run build` + `npm test` + push
- [ ] Task 2: `DELETE /api/investors/[id]` with agreement guard
- [ ] Task 2: `DeleteInvestorButton.tsx` with confirm dialog
- [ ] Task 2: Add button to investor detail page
- [ ] Task 2: `npm run build` + `npm test` + push

## Work Completed
-

## Files Changed
-

## Decisions
- `file_url` (24-hour URL) stays for in-browser preview — only `document_url` stored in DB changes
- File move failure is non-fatal — agreement data must not be rolled back over a storage failure
- Investor hard-delete (not soft) — no audit trail requirement; agreements carry the financial history
- Block on ANY non-deleted agreement (active, matured, cancelled) — not just active ones

## Codex Review Notes
-

## Next Agent Action
- Gemini: Do Task 1 on `feature/doc-url-fix` first. Push when done. Then switch to `feature/investor-delete-safety` and do Task 2. Push when done. Update this SESSION.md Work Completed after both.
