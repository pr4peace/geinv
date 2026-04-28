# SESSION

## Branch
- main

## Phase
- building

## Active Batch
- Batch G — UX polish + data fixes (push directly to main)

---

## Items for Gemini

### Item 1 — TDS amounts showing as zero for cumulative/compound agreements

**Problem:** TDS rows on 31st March are inserted with `gross_interest: 0, tds_amount: 0, net_interest: 0` because at upload time we don't compute the accrued interest.

**Fix:** When generating TDS rows in `src/app/api/agreements/route.ts` (the loop around line 265), calculate the accrued compound interest for each FY period using the agreement's `principal_amount`, `roi_percentage`, and the period dates.

Formula for compound interest accrued from `start` to `march31`:
```
days = (march31 - periodStart) in days
accrued = principal × ((1 + roi/100) ^ (days/365) - 1)
tds = accrued × 0.10
net = accrued - tds
```

Where `periodStart` is `investment_start_date` for the first FY, and `(prev march31 + 1 day)` for subsequent FYs.

Round all amounts to 2 decimal places.

Update the pushed row to use these calculated values instead of zeros.

---

### Item 2 — Inline confirmation for BackfillTdsButton (no Chrome UI)

**File:** `src/components/settings/BackfillTdsButton.tsx`

Currently uses `confirm()` — replace with inline UI exactly like PayoutScheduleSection does.

Add state: `const [confirming, setConfirming] = useState(false)`

Replace the `confirm()` call with:
- Button shows "Backfill TDS Rows" normally
- On click: sets `confirming = true`, shows an inline confirmation:
  ```
  "This will insert missing 31 Mar TDS rows for all cumulative/compound agreements. Continue?"
  [Yes, run backfill] [Cancel]
  ```
- "Yes" runs the backfill, "Cancel" sets `confirming = false`
- Show result inline: "Updated N agreements, skipped M" as a success message in the UI
- Show errors inline as red text
- No `confirm()`, no `alert()` — all inline

---

### Item 3 — Floating undo toast for destructive actions

**Goal:** After any destructive/reversible action (mark paid, bulk mark paid, dismiss notification), show a floating toast bottom-right for 5 seconds with an "Undo" button. If clicked, the action is reversed.

**Files to create:**
- `src/components/UndoToast.tsx` — the toast component

**Files to modify:**
- `src/components/agreements/PayoutScheduleSection.tsx` — use toast for Mark Paid, Bulk Mark Paid
- `src/components/notifications/NotificationsClient.tsx` — use toast for Dismiss

**UndoToast component:**

```tsx
// src/components/UndoToast.tsx
'use client'
import { useEffect, useState } from 'react'

interface UndoToastProps {
  message: string
  onUndo: () => void
  onDismiss: () => void
  durationMs?: number
}

export function UndoToast({ message, onUndo, onDismiss, durationMs = 5000 }: UndoToastProps) {
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const remaining = Math.max(0, 100 - (elapsed / durationMs) * 100)
      setProgress(remaining)
      if (remaining === 0) {
        clearInterval(interval)
        onDismiss()
      }
    }, 50)
    return () => clearInterval(interval)
  }, [durationMs, onDismiss])

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden min-w-72 animate-in slide-in-from-bottom-4 duration-300">
      <div className="px-4 py-3 flex items-center justify-between gap-4">
        <span className="text-sm text-slate-200">{message}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={onUndo}
            className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors whitespace-nowrap"
          >
            Undo
          </button>
          <button onClick={onDismiss} className="text-slate-500 hover:text-slate-300 text-xs">✕</button>
        </div>
      </div>
      {/* Progress bar */}
      <div className="h-0.5 bg-slate-700">
        <div
          className="h-full bg-indigo-500 transition-all duration-75"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}
```

**Usage pattern in PayoutScheduleSection for Mark Paid:**
```tsx
const [undoToast, setUndoToast] = useState<{ message: string; onUndo: () => void } | null>(null)

// After marking a single payout as paid:
setUndoToast({
  message: 'Payout marked as paid',
  onUndo: async () => {
    setUndoToast(null)
    await fetch(`/api/agreements/${agreementId}/payouts/${payoutId}/revert`, { method: 'POST' })
    router.refresh()
  }
})

// Render at bottom of component return:
{undoToast && (
  <UndoToast
    message={undoToast.message}
    onUndo={undoToast.onUndo}
    onDismiss={() => setUndoToast(null)}
  />
)}
```

Apply same pattern for bulk mark paid and for dismiss notification.

---

### Item 4 — Standing rule: no native browser dialogs anywhere

**Search the entire codebase for any remaining `confirm(`, `alert(`, `prompt(` calls:**
```bash
grep -rn "confirm(\|alert(\|prompt(" src/ --include="*.tsx" --include="*.ts"
```

For each one found (excluding test files): replace with inline UI. If it's a simple case, a small inline "Are you sure? [Yes] [Cancel]" state pattern is enough.

---

## Todos
- [ ] Item 1 — Calculate TDS amounts for cumulative/compound rows
- [ ] Item 2 — BackfillTdsButton inline confirmation
- [ ] Item 3 — UndoToast component + wire into PayoutScheduleSection + NotificationsClient
- [ ] Item 4 — Remove all remaining confirm()/alert() calls

---

## Work Completed
- Batch F complete — notification queue, /notifications page, sidebar nav, salesperson gates
- Gemini truncation fix — graceful JSON repair on MAX_TOKENS with user warning

## Files Changed
- SESSION.md

## Decisions
- No native browser dialogs anywhere in the app — standing rule
- TDS amounts must be calculated, not left as zero
- Undo toast is always 5 seconds, bottom-right

## Codex Review Notes
- Pending

## Next Agent Action
- Gemini: read SESSION.md, summarise 4 items, wait for confirmation, build 1 → 2 → 3 → 4, build must pass after each, push to main.
