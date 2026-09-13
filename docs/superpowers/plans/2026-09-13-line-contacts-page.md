# Plan — Manager-only page listing registered LINE contacts

Spec: agreed in conversation 2026-09-13 (confirmed via AskUserQuestion — build it, manager-only visibility).

Branch: `feature/line-contacts-page` off `main`.

## Context

The `line_contacts` table (customer phone ↔ LINE account mapping, from the
`feature/line-auto-link` work) has no UI anywhere — checking who has
registered currently requires a raw SQL query. The team wants a simple
read-only list page, visible to managers only (matching the existing
`คิวเคลม` nav item's role gate).

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest. No DB
  migration, no edge function, no RLS change — `line_contacts` already
  has a `team_read` policy (`is_team_member()`, i.e. any active team
  member can read it at the DB layer) from migration `0016`. **Do not
  change that RLS policy** — this feature is a UI-level visibility
  choice only (manager-only nav item + route gate), the same
  defense-in-depth relationship this codebase already has for `คิวเคลม`
  (claims' own `team_read` policy is also not manager-restricted at the
  DB layer, only the nav/route is).
- New nav item in `src/lib/roles.ts`'s `NAV` array: `{ path:
  '/line-contacts', label: 'ผู้ลงทะเบียน LINE', roles: ['manager'] }` —
  add it, do not reorder or modify any existing entry.
- New read function `listLineContacts()` in a new
  `src/lib/api/lineContacts.ts` file — selects `phone, display_name,
  created_at` from `line_contacts`, ordered `created_at` descending
  (newest registration first). Throw this codebase's established Thai-
  error convention on failure (read any existing file in `src/lib/api/`
  for the exact phrasing style, e.g. `'โหลดรายชื่อผู้ลงทะเบียน LINE
  ไม่สำเร็จ: ' + error.message`).
- New page `src/routes/team/LineContacts.tsx` (+ `.test.tsx`) — read
  `src/routes/team/ClaimsQueue.tsx` in full first for this codebase's
  established list-page conventions (loading/failed/empty states via
  `Spinner`/`alert alert-danger`/`muted`, a `PageHeader`, a search
  `<input>` filtering client-side like `DailyDashboard.tsx`'s "ค้นหาชื่อ
  ลูกค้า / เลขออเดอร์" box). Table columns: เบอร์โทร / ชื่อ LINE / วันที่
  ลงทะเบียน (formatted with this codebase's existing date-time
  formatter — check `src/lib/format.ts` for the right one, e.g.
  `formatDateTimeTH`). Search box filters client-side on phone OR
  display name substring match (case-insensitive), matching
  `DailyDashboard.tsx`'s existing filter pattern.
- Wire the route in `src/App.tsx`: add `<Route path="/line-contacts"
  element={<RequireRole path="/line-contacts"><LineContacts
  /></RequireRole>} />` inside the existing `RequireAuth`/`AppShell`
  route tree (read the file to place it correctly among the other
  authenticated team routes — mirror exactly how `/claims` is already
  wired there, since it has the identical role-gating shape).
- Empty state: "ยังไม่มีลูกค้าลงทะเบียน" (no one has registered yet) —
  matching this codebase's established empty-state phrasing style.
- All existing tests must stay green.

## Task 1 (single batch)

### 1a. `src/lib/api/lineContacts.ts` (+ `.test.ts`)

New `listLineContacts(): Promise<{ phone: string; displayName: string |
null; createdAt: string }[]>` per the Global Constraints. Test: returns
the mapped/flattened rows in the order the query gives them (the DB
`order by created_at desc` is trusted, not re-sorted client-side —
confirm the select call's `.order(...)` args in the test); throws the
Thai error on a query failure.

### 1b. `src/lib/roles.ts`

Add the new NAV entry exactly as specified above.

### 1c. `src/routes/team/LineContacts.tsx` (+ `.test.tsx`)

Per Global Constraints. Tests: renders every contact row (phone,
display name, formatted date); search box filters by phone substring
and by name substring (case-insensitive); empty state shown when there
are zero contacts; failed state shown on a load error with no crash.

### 1d. `src/App.tsx`

Wire the route per Global Constraints.

### 1e. Tests

Full list run at the end: `lineContacts.test.ts`, `LineContacts.test.tsx`,
`roles.test.ts` (if it enumerates NAV entries — check and update if so),
`App.test.tsx` (if it asserts route count/shape — check).

Report: `.superpowers/sdd/2026-09-13-line-contacts-page/task-1-report.md`.
