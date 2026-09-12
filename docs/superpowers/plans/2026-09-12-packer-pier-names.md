# Plan — Record packer name + pier (unloading) name per order

Spec: agreed in conversation 2026-09-12 (grilling session, "ยืนยันตามนี้").
Branch: `feature/packer-pier-names` off `main`.

## Context

The team wants to record, per order, who packed it and who unloaded it at
the pier — for accountability (e.g. tracing a claim back to a person).
There is currently no per-individual login for packers/pier staff (only one
`manager` profile exists in production today), so the name cannot be
derived from the logged-in session — it must be typed in by whoever is
doing the work, on the existing per-order pack/pier screens.

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest. Supabase
  cloud (`kprlqjxwolljkgqyzygf`) — controller applies the migration after
  review. No edge function change (see below — not shown on customer page,
  so `order-view` does not need to return these fields).
- Two free-text fields, **not** a dropdown/roster: `orders.packer_name`,
  `orders.pier_name` — both `text null`, no FK, no new table. Do not build
  a staff-roster management screen; that's explicitly out of scope.
- **Autocomplete, not free-typing-only**: both name inputs get a
  `<datalist>` of previously-used distinct names, so retyping the same
  name each day still only requires 1-2 keystrokes. The two lists are
  **separate** (packer names vs pier names) — a packer's name is a
  distinct role from a pier person's name, do not merge the two lists.
  Source the datalist options with a plain distinct-values query against
  `orders` (`select distinct packer_name ...` / `... pier_name ...`,
  filtered non-null/non-empty) — no caching layer, no new table.
- **Granularity: per order**, not per day/shift. One name per role per
  order, no multi-name support (no "packed by X and Y").
- **Not required** — must not block "บันทึก + แพ็คเสร็จ" or
  "ส่งขึ้นเรือแล้ว". Empty is a valid, common value.
- **Not shown on the customer page** (`/o/<token>`) at all — do not touch
  the `order-view` edge function or `CustomerOrderView.tsx`/`i18n.ts` for
  this feature.
- Trim whitespace on save; store an empty/whitespace-only string as
  `null` (not `''`), consistent with how other optional text fields in
  this codebase are already normalized before writing (check
  `customerPhone`/`paymentMethod` handling in `buildImport.ts` for the
  `|| null` idiom already used elsewhere, and mirror it).
- All existing tests must stay green.

## Task 1 (single batch)

### 1a. Migration `koh-payam-delivery/supabase/migrations/0014_packer_pier_names.sql`

```sql
alter table orders
  add column if not exists packer_name text,
  add column if not exists pier_name text;
```

No RLS change needed — these are plain columns on `orders`, already
covered by the existing `team_read`/`team_insert`/`team_update` policies
(read this session's most recent migration, `0013_manager_delete_orders.sql`,
to confirm the current policy names before writing anything that touches
RLS — but this task does not need to touch RLS at all, this note is only
so the implementer doesn't accidentally assume `team_write` still exists).

Controller applies to cloud (`supabase db push`) after review — no
edge function involved.

### 1b. `koh-payam-delivery/src/lib/api/pack.ts`

- `PackInput` gains `packerName: string` (the raw typed value; trimming/
  null-conversion happens in this function, not the caller).
- `savePack`'s existing single `.update(...)` call (the one that already
  writes `paper_box_count`/`foam_box_count`/`piece_count`) also writes
  `packer_name: input.packerName.trim() || null` in the **same** update
  call — do not add a second round-trip.
- `logAction('pack_saved', ...)` metadata gains `packerName` (pass the
  raw input value, matching how `paperCount`/`foamCount`/`pieceCount` are
  logged as-given, not the normalized value).
- Test (`pack.test.ts`): the existing exact-equality lock on the single
  write payload must be updated to include `packer_name`; add a case
  proving a whitespace-only name is written as `null`.

### 1c. `koh-payam-delivery/src/lib/api/orders.ts`

- New `export async function setOrderPierName(orderId: string, pierName: string): Promise<void>`
  — mirrors this file's existing Thai-error-message convention (read
  `setOrderBoat` just above it for the exact style, including its
  `.select('id')` + zero-rows-denied-by-RLS check pattern — this new
  function should use that same `.select('id')` + zero-rows check, since
  it's the same kind of update-that-might-be-silently-denied). Trims and
  null-converts the same way as 1b. On success, log
  `logAction('pier_name_set', 'order', orderId, { pierName })` (raw
  value, same convention as 1b).
- Test (`orders.test.ts`): happy path (right id + trimmed value written,
  `logAction` called), whitespace-only input writes `null`, RLS-denied
  (zero rows) throws and does not log — mirror the exact test shape
  already used for `deleteOrder`'s zero-rows case in this same file.

### 1d. `koh-payam-delivery/src/routes/team/PackOrder.tsx`

Read the whole current file first (it already has `paper`/`foam`/`piece`
state and inputs in one `flex flex-wrap gap-4` row inside the box-count
card).

- New state `packerName`, seeded from `o.packer_name ?? ''` in the same
  `getOrder(id!).then(...)` block that seeds `paper`/`foam`/`piece`.
- Add a text input labeled "ชื่อคนแพ็ค" in that same card — either in the
  existing `flex flex-wrap gap-4` row alongside the three number inputs,
  or its own row below them (your call on layout, but it must sit inside
  the same box-count card, not a new separate card). Bind it to a
  `<datalist>` populated by a small local fetch of distinct
  `packer_name` values from `orders` (write this as a tiny helper —
  either inline in this file or a small function in `pack.ts`/`orders.ts`,
  your call — the important constraint is it queries `orders`, not a new
  table).
- `save()` passes `packerName` through to `savePack`.
- Do **not** add `packerName`/its input to `packGateBlocked` — that
  condition (`packPhotoCount >= 1 && paper + foam >= 1`) must stay
  exactly as-is (read it again before editing — this is the same
  constraint the piece-count feature carried, and it applies here too).
- Test (`PackOrder.test.tsx` if it exists, else add coverage in whichever
  test file already covers `PackOrder`): typing a packer name and saving
  calls `savePack` with that `packerName`; the pack-gate-blocked/enabled
  logic is unaffected by the packer-name field being empty or filled.

### 1e. `koh-payam-delivery/src/routes/team/PierLoad.tsx`

Read the whole current file first (it already has a two-screen structure:
an order-picker list, then a per-order screen with boat buttons + photo
capture + a "ส่งขึ้นเรือแล้ว" button that calls `ship()`).

- `PierOrder` type gains `packer_name: string | null` and
  `pier_name: string | null`.
- New state `pierName`, reset to `sel.pier_name ?? ''` whenever a new
  order is selected (same place `photoCount`/`photoBusy`/`msg` are reset
  in the picker's `onClick`).
- Add a text input labeled "ชื่อคนลงเรือ" on the per-order screen (after
  the boat-selection section is a reasonable spot, but your call), bound
  to a `<datalist>` of distinct `pier_name` values from `orders` (same
  approach as 1d, separate query/list from the packer one).
- `ship()` must call `setOrderPierName(sel.id, pierName)` **before**
  `updateOrderStatus(sel.id, 'shipped')` — if `setOrderPierName` throws,
  the existing catch block already shows the error via `msg` and does
  not navigate away, so no new error handling is needed beyond the extra
  call.
- On the order-picker list (before an order is selected), add the
  packer's name as a small subtitle/second line on each order's card
  (e.g. under the order-no/customer-name text) so pier staff can see who
  packed each order before picking one — only render it when
  `o.packer_name` is non-empty (omit the line entirely otherwise, don't
  show an empty "คนแพ็ค: —").
- Test (`PierLoad.test.tsx`): typing a pier name and shipping calls
  `setOrderPierName` then `updateOrderStatus('shipped')` in that order;
  the packer-name subtitle renders on the picker list when present and
  is absent when `packer_name` is null.

### 1f. `koh-payam-delivery/src/lib/api/shipDays.ts`

`listOrdersForDay`'s `.select(...)` string gains `packer_name,pier_name`.

### 1g. `koh-payam-delivery/src/routes/team/OrderDetail.tsx`

The existing summary line (`ลังกระดาษ {..} · ลังโฟม {..} · ชิ้น {..} ·
รวม {..}`) gets one more line right after it: `คนแพ็ค: {order.packer_name
|| '—'} · คนลงเรือ: {order.pier_name || '—'}`. `getOrder`'s `select('*')`
already returns these two new columns — no change needed to `getOrder`
itself.

### 1h. `koh-payam-delivery/src/routes/team/LabelSheet.tsx`

Add one line near the top (under the "ออเดอร์ ... · ส่ง ..." line, inside
the `label-sheet card`): `คนแพ็ค: {order.packer_name || '—'}`. Do **not**
add a pier-name line here — the label sheet is printed at pack time,
before the pier stage happens, so `pier_name` is reliably still empty
when this page is used; showing it would just always print "—" and add
noise.

### 1i. `koh-payam-delivery/src/routes/team/DailyDashboard.tsx`

Add two columns to the existing table, after the "เรือ" column: "คนแพ็ค"
and "คนลงเรือ" (`{o.packer_name || '—'}` / `{o.pier_name || '—'}`).
`listOrdersForDay` (1f) already returns these fields on each row.

### 1j. Tests

Full list run at the end: `pack.test.ts`, `orders.test.ts`,
`PackOrder.test.tsx` (or wherever pack-screen coverage lives),
`PierLoad.test.tsx`, plus a quick manual read-through confirming
`OrderDetail.test.tsx`, `LabelSheet.test.tsx`, and any `DailyDashboard`
test file still pass unmodified (they likely don't assert against the
exact column count/summary line text in a way that breaks, but check).
No Deno/edge-function involvement in this task.

Report: `.superpowers/sdd/2026-09-12-packer-pier-names/task-1-report.md`.
