# SESSION

## Branch
- main

## Phase
- implementing

## Active Batch
- Quick Send Panel — collapsible preset bulk-send panel on /notifications

---

## Items for Gemini

### Item 1 — Fix notification_queue silent insert failure
In `src/app/api/reminders/process/route.ts`, replace the batch `.insert(allItems)` block with a per-item loop that swallows error code `23505` (unique_violation) so re-runs don't fail silently.

- [ ] Complete

### Item 2 — Add salesperson name to page fetch
In `src/app/(app)/notifications/page.tsx`, update the `fetchItems` Supabase query to join `salesperson:team_members!salesperson_id(name)` through the agreement. Update `EnrichedItem` type accordingly.

- [ ] Complete

### Item 3 — Build QuickSendPanel component
New file `src/components/notifications/QuickSendPanel.tsx`. Collapsible panel with: type dropdown (All / Payouts / Maturity / TDS Filing), timeframe dropdown (7 / 14 / 31 days), Preview button. On preview: checkbox table (investor, ref ID, due date, salesperson). Summary bar: X of Y selected · salesperson breakdown · Send button. Filters pending items client-side. Calls onSend with selected IDs.

- [ ] Complete

### Item 4 — Wire QuickSendPanel into NotificationsClient
In `src/components/notifications/NotificationsClient.tsx`: import QuickSendPanel, update EnrichedItem type to include salesperson name, mount panel above the tab bar (coordinators only), pass pending + handleSend + sending.

- [ ] Complete

---

## Todos
- [ ] Item 1 — Fix cron insert loop
- [ ] Item 2 — Salesperson name in page fetch
- [ ] Item 3 — QuickSendPanel component
- [ ] Item 4 — Wire into NotificationsClient

---

## Work Completed
- Batch F complete — notification queue, /notifications page, sidebar nav, salesperson gates
- Gemini truncation fix — graceful JSON repair on MAX_TOKENS with user warning
- Batch G complete — TDS calculation fixes, inline confirmations, undo toast
- Batch C.2 handed to Gemini (running separately)

## Files to Change
- src/app/api/reminders/process/route.ts (Item 1)
- src/app/(app)/notifications/page.tsx (Item 2)
- src/components/notifications/QuickSendPanel.tsx (Item 3 — new file)
- src/components/notifications/NotificationsClient.tsx (Item 4)

## Decisions
- No native browser dialogs anywhere — standing rule
- QuickSendPanel filters client-side from already-fetched pending items (no new API)
- Summary bar shows count + salesperson name breakdown (no ₹ total — not available in queue row)
- Panel only visible to coordinators (not salespersons)

## Codex Review Notes
- (none yet)

## Next Agent Action
- Gemini: implement all 4 items. Full plan is at docs/superpowers/plans/2026-04-29-quick-send-panel.md — read it before starting. Run `npm run build` and `npm test` after each item. Push when done.
