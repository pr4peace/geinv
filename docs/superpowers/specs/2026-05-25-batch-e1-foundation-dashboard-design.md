# Batch E.1 — Design System Foundation + Dashboard

**Date:** 2026-05-25
**Branch:** `feature/batch-e1-foundation`
**Track:** Stable (main)
**Status:** Pending review

---

## Goal

Switch the entire app from dark mode to a Bloomberg/Carta-style light design system and implement a new `/dashboard` route as the app landing page. This is the foundation sub-batch — E.2 and E.3 build on the tokens and shell established here.

**Design source:** `docs/superpowers/specs/design-files/dash-04-queue.jsx` + `tokens.css` from claude.ai/design export.

---

## Design System

### Color tokens — add to `tailwind.config.ts` under `theme.extend.colors`

```ts
colors: {
  paper:    '#FAFAF7',
  canvas:   '#F4F3EE',
  surface:  { DEFAULT: '#FFFFFF', 2: '#F7F6F1', 3: '#EFEDE5' },
  hairline: { DEFAULT: '#E6E3DA', strong: '#D4D0C2' },
  ink:      { 1: '#0E0E0C', 2: '#2A2A26', 3: '#5A5750', 4: '#7A776E', 5: '#A09C8E', 6: '#C7C3B5' },
  forest:   { DEFAULT: '#1F3D2E', 2: '#2E5A44', soft: '#E5EDE6' },
  clay:     { DEFAULT: '#B8741E', soft: '#F8EDD9' },
  rust:     { DEFAULT: '#A4231F', soft: '#F5E1DE' },
  gain:     { DEFAULT: '#1B5E3F', soft: '#DDEAE0' },
  earth:    { green: '#6B7F5F', 'green-mid': '#8A9D7F', brown: '#7D6F5F', ochre: '#C4A574', neutral: '#9B8F7F' },
}
```

### Typography — update `src/app/layout.tsx` Google Fonts import

```
Inter:wght@400;500;600;700
JetBrains Mono:wght@400;500;600   ← numbers everywhere
Source Serif 4:ital,wght@0,400;0,500;0,600  ← page headings
```

Add to `tailwind.config.ts`:
```ts
fontFamily: {
  sans:  ['Inter', 'ui-sans-serif', 'system-ui'],
  mono:  ['JetBrains Mono', 'ui-monospace'],
  serif: ['Source Serif 4', 'Georgia'],
}
```

### Global base styles — `src/app/globals.css`

Replace dark slate body styles with:
```css
body { background-color: #FAFAF7; color: #0E0E0C; }
```

Add utility classes:
```css
.num { font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums; font-feature-settings: 'tnum', 'zero'; }
.lbl { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #7A776E; font-weight: 500; }
.sdot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; vertical-align: middle; margin-right: 6px; }
.sdot-active   { background: #1B5E3F; }
.sdot-pending  { background: #B8741E; }
.sdot-overdue  { background: #A4231F; }
.sdot-paid     { background: #1B5E3F; }
.sdot-notified { background: #1F3D6B; }
.sdot-draft    { background: #B8741E; }
```

---

## Shell — Sidebar + Nav + Topbar

**File:** `src/app/(app)/layout.tsx`

### What changes vs current shell

The current shell has: global search bar, sidebar collapse/expand toggle, WhatsNewModal trigger, SplashScreen, sign-out button. **E.1 intentionally removes global search and sidebar collapse toggle** — the new design uses a fixed 224px sidebar with no collapse. WhatsNewModal, SplashScreen, and sign-out are preserved (restyled in E.3 for WhatsNew/Splash; sign-out stays in the user strip).

### Sidebar
- Background: `bg-surface` (white), right border: `border-r border-hairline`
- Width: 224px fixed, `hidden` on mobile
- Brand block: forest mark (28×28, rounded-sm, `bg-forest text-paper font-serif`), app name in Source Serif 4
- Nav items: 12.5px, `text-ink-2`, hover `bg-surface-2`, active `bg-ink-1 text-paper` (black pill, not indigo)
- Nav sections: `text-ink-5` uppercase labels at 10px
- User strip at bottom: avatar circle `bg-forest-soft text-forest`, sign out link

### Nav items (in order)
```
Dashboard      /dashboard     LayoutDashboard icon
Notifications  /notifications Bell icon
Agreements     /agreements    FileText icon
Settings       /settings      Settings icon
```

### Topbar
- Height: 52px, `bg-surface border-b border-hairline`
- Left: breadcrumbs (page name) in `text-ink-3 text-xs`
- Right: current date + live green dot (`bg-gain rounded-full w-1.5 h-1.5 shadow-[0_0_0_3px_rgba(27,94,63,0.18)]`)

---

## Dashboard Page

**File:** `src/app/(app)/dashboard/page.tsx` (new server component)
**Client component:** `src/components/dashboard/DashboardClient.tsx` (new)

### Data queries (server component, all via `createAdminClient()`)

```ts
const today = format(new Date(), 'yyyy-MM-dd')
const week  = format(addDays(new Date(), 7),  'yyyy-MM-dd')
const month = format(addDays(new Date(), 30), 'yyyy-MM-dd')
const d90   = format(addDays(new Date(), 90), 'yyyy-MM-dd')

// 1. Overdue payouts
payout_schedule where status IN ('pending','notified') AND due_by < today AND is_tds_only=false
join agreements (investor_name, reference_id, id, payout_frequency)

// 2. This-week payouts
payout_schedule where status IN ('pending','notified') AND due_by >= today AND due_by <= week AND is_tds_only=false
join agreements (investor_name, reference_id, id, payout_frequency)

// 3. Later-this-month payouts
payout_schedule where status IN ('pending','notified') AND due_by > week AND due_by <= month AND is_tds_only=false
join agreements (investor_name, reference_id, id, payout_frequency)

// 4. Maturing soon
agreements where status='active' AND maturity_date <= d90 AND deleted_at IS NULL
compute daysLeft = diff(maturity_date, today)

// 5. Docs pending — awaiting client return only
agreements where status='active'
  AND doc_status = 'sent_to_client'   ← client has not yet returned signed doc
  AND deleted_at IS NULL
compute daysSince = diff(today, doc_sent_to_client_date)
Note: doc_status='uploaded' means doc returned and complete — do NOT include.
Note: doc_status='partner_signed' means ready to send to client — show separately if needed but
      do not count as "pending return".

// 6. Today's activity
reminders where sent_at >= today AND status='sent'
order by sent_at DESC, limit 5
Note: reminders table does not have investor_name. Row text uses email_subject directly.
```

### KPI tiles (Row 1)

4-column grid, each tile: `bg-surface border border-hairline p-4 rounded-sm`

| Tile | Value | Sub |
|---|---|---|
| Open actions | count(overdue) + count(thisWeek) | "across queues" |
| Net to disburse | sum(net_interest) of overdue+thisWeek formatted ₹ | "this week" |
| Maturing in 90d | sum(principal_amount) of maturing formatted ₹ | count + " agreements" |
| Docs pending | count(docsPending) where doc_status='sent_to_client' | "awaiting return" |

Value: `font-mono text-2xl font-medium text-ink-1`
Label: `.lbl` class
Sub: `text-xs text-ink-4`

### Kanban lanes (Row 2)

3-column grid. Lane background: `bg-earth-green/8 rounded-sm`.

**Lane header:** title (18px semibold, ink-1) + count (colored) + sub label + sparkline bars (last 8 items by net_interest).

**Payout card:** `bg-white/60 rounded-sm p-3`
- Top row: investor name (13px semibold) + net_interest (13px bold mono, ink-1)
- Second row: reference_id · frequency (11px, ink-4) | TDS amount (10px, earth-ochre)
- 3-step progress pills (3-col grid, 9px uppercase):
  - Reminded: always done (green pill `bg-earth-green/25 text-earth-green`)
  - Notified: done if status = 'notified' or 'paid'
  - Paid: done if status = 'paid'
- Due date line: 10px, clay if overdue else ink-4
- Action buttons (10px, 28px height):
  - If pending: `Notify` (forest-soft bg) + `Mark Paid` (forest bg, white text)
  - If notified: `Re-notify` + `Mark Paid`
  - If paid: "✓ Paid" text only

**Notify action:** `POST /api/agreements/[agreement_id]/payouts/[id]/notify` — optimistic update, sets status → 'notified'
**Paid action:** `POST /api/agreements/[agreement_id]/payouts/[id]/paid` — optimistic update, sets status → 'paid'

Lane tones:
- Overdue: `text-earth-ochre` (#C4A574)
- This week: `text-earth-green-mid` (#8A9D7F)
- Later: `text-earth-green` (#6B7F5F)

### Bottom panels (Row 3)

3-column grid. Each: `bg-surface-3/50 rounded-sm p-4`.

**Maturing soon:**
Rows: investor name (12px semibold) + ref · date (11px ink-4) | principal (13px bold mono, earth-brown) + daysLeft badge (10px clay)

**Docs pending:**
Only shows agreements where `doc_status = 'sent_to_client'`.
Rows: investor name + "sent {doc_sent_to_client_date} · {reference_id}" | daysSince badge — clay if daysSince > doc_return_reminder_days, else earth-green

**Today's activity:**
Rows: colored dot (gain=paid, info=batch_notification/notify, clay=other) + `email_subject` as row text (12px) + time extracted from `sent_at` (10px ink-4).
No investor_name join — email_subject is sufficient and always present.

---

## Routing

- Add `/dashboard` to nav as first item
- **`src/app/page.tsx`**: replace `redirect('/agreements')` with `redirect('/dashboard')` — this is where the `/` redirect actually lives
- `src/middleware.ts`: no change needed for routing; keep focused on auth/RBAC only

---

## Files

| File | Action |
|---|---|
| `tailwind.config.ts` | Add color tokens + font families |
| `src/app/layout.tsx` | Update Google Fonts import |
| `src/app/globals.css` | Replace dark body styles, add utility classes |
| `src/app/page.tsx` | Replace `redirect('/agreements')` with `redirect('/dashboard')` |
| `src/app/(app)/layout.tsx` | Rebuild sidebar + nav + topbar (light); remove search + collapse toggle |
| `src/app/(app)/dashboard/page.tsx` | New server component with 6 queries |
| `src/components/dashboard/DashboardClient.tsx` | New client component — KPI tiles, kanban, panels |

---

## Out of scope

- E.2 (agreements redesign) — separate branch
- E.3 (notifications/settings/login redesign) — separate branch
- Mobile responsive refinements (basic responsiveness only)
- Drag-and-drop between kanban lanes
- Global search (removed; may be re-added in a future batch)
- Sidebar collapse toggle (removed; fixed-width sidebar in new design)
