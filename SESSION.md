# SESSION

## Branch
- feature/sidebar-collapse

## Current Task
- Add collapse/expand toggle to the sidebar.

## Goal
- A toggle button lets users collapse the sidebar to a narrow icon-only rail (~56px) and expand it back to full width (240px). State persists in localStorage so it survives page navigation. No API changes, no DB changes, no new dependencies.

## Plan

### Step 1 — Add collapsed state
**File:** `src/app/(app)/layout.tsx`
- Add `const [collapsed, setCollapsed] = useState(false)`
- On mount, read from `localStorage.getItem('sidebar-collapsed')` to restore the last state
- On toggle, write back to localStorage

### Step 2 — Animate the sidebar width
- When `collapsed`: sidebar width = `w-14` (56px), otherwise `w-60` (240px)
- Add `transition-all duration-200` for smooth animation

### Step 3 — Hide/show text and logo label
- When collapsed: hide label text ("Good Earth" / "Investments"), nav labels, user name/role, sign out button text, search box
- When collapsed: show only icons — logo icon, nav icons, user avatar icon
- Use `overflow-hidden` + conditional rendering or `opacity-0 w-0` to suppress text

### Step 4 — Add toggle button
- Place a small chevron button at the top-right of the sidebar header
- `ChevronLeft` when expanded (click to collapse), `ChevronRight` when collapsed (click to expand)
- Import `ChevronLeft`, `ChevronRight` from lucide-react

### Step 5 — Tooltip on collapsed nav items
- When collapsed, wrap each `NavLink` in the existing `Tooltip` component (`src/components/ui/Tooltip.tsx`) showing the label on hover

### Step 6 — Verify
- `npm run build` — no errors
- `npm test` — no regressions

## Todos
- [x] Add `collapsed` state with localStorage persistence
- [x] Toggle sidebar width between `w-14` and `w-60` with transition
- [x] Hide text/search/user details when collapsed, show icons only
- [x] Add `ChevronLeft`/`ChevronRight` toggle button in the header
- [x] Wrap collapsed nav items with `Tooltip` for label on hover
- [x] `npm run build` — clean
- [x] `npm test` — no regressions

## Work Completed
- Implemented collapsible sidebar in `src/app/(app)/layout.tsx`.
- Sidebar toggles between 240px (`w-60`) and 56px (`w-14`).
- Collapse state persists in `localStorage` as `sidebar-collapsed`.
- Nav items show icons only and display labels via `Tooltip` when collapsed.
- Global Search, user name/role, sign out text, and footer copyright are hidden in collapsed mode.
- Added a toggle button with `ChevronLeft`/`ChevronRight` icons in the sidebar header.
- Verified build and tests pass.

## Files Changed
- `src/app/(app)/layout.tsx`

## Decisions
- State persisted in localStorage — survives page nav and hard refresh
- Collapsed width: `w-14` (56px) — enough for icons only
- Tooltip component already exists at `src/components/ui/Tooltip.tsx` — reuse it, do not create a new one
- Search box hidden entirely when collapsed (too narrow to be useful)
- Tailwind `transition-all duration-200` is sufficient — no animation library needed

## Codex Review Notes
- No **blocking** issues found in the current diff. The collapse state is client-only, persisted safely in `localStorage`, and the sidebar still preserves navigation and toggle access in both states.
- **Minor:** there is no automated coverage for the new collapse behavior in `src/app/(app)/layout.tsx`. The persisted state restore, toggle interaction, and collapsed tooltip path are currently untested by unit or E2E tests.
- **Minor:** the persisted `localStorage` state is restored in `useEffect`, so users who previously collapsed the sidebar will still get an initial expanded render before it snaps closed after hydration. That is a visible UX flash on reload, not a functional bug.
- **Minor:** collapsed nav items are wrapped in `Tooltip`, whose container is `inline-block`. That reduces the clickable area to the icon-sized content rather than the full rail width, which is acceptable but a small usability regression in the collapsed state.

## Next Agent Action
- Codex: Review the sidebar collapse implementation.
