# Plan — Manager-only order delete, with type-to-confirm + DB-level lock

Spec: agreed in conversation 2026-09-12 (grilling session, "ยืนยันตามนี้").
Branch: `feature/delete-order` off `main` (@ 08c672e).

## Context

There is currently no way to remove a wrongly-imported/cancelled/test order
from the app itself — the only path is a controller-run SQL statement. The
user wants a self-service delete, scoped tightly: one order at a time, from
OrderDetail, manager role only, with a type-the-order-number confirmation
step, and — the part that matters most — enforced at the RLS layer too, not
just a hidden/shown button, since today `team_write` on `orders` is `for all`
gated only by `is_team_member()`: any active team member (packer/pier too)
can already call `.delete()` on `orders` directly via the API.

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest. Supabase cloud
  (`kprlqjxwolljkgqyzygf`) — controller applies the migration after review;
  no edge function involved (delete happens client-side via the Supabase JS
  client against RLS-protected tables, same pattern as every other write in
  this app).
- **The RLS change is the crux of this task — read it twice before writing
  it.** `orders`' current `team_write` policy (`supabase/migrations/0007_hardening.sql`)
  is `for all to authenticated using (is_team_member()) with check (is_team_member())`.
  A single Postgres policy's `FOR` clause takes exactly one of
  `ALL | SELECT | INSERT | UPDATE | DELETE` — it cannot restrict DELETE
  differently from INSERT/UPDATE within one `for all` policy. Replace it with
  **three** policies: `for insert` and `for update` (both still gated by
  `is_team_member()`, unchanged behavior) and a new `for delete` gated by a
  new `is_manager()` function. Do not touch any other table's policies —
  `order_items`/`boxes`/`evidence_photos`/`claims`/`backorders` keep their
  existing `is_team_member()`-gated `for all` policies untouched; a manager
  already satisfies `is_team_member()` too, so the existing `ON DELETE
  CASCADE` foreign keys from those tables to `orders` will still fire
  correctly for a manager's delete — no other table's RLS needs to change.
- `is_manager()`: a new `security definer` SQL function, structurally
  identical to the existing `is_team_member()` in the same migrations file
  (`supabase/migrations/0007_hardening.sql`) — read that function's exact
  definition and mirror its style (same `stable`, same `security definer`,
  same `profiles` join shape), just with `role = 'manager'` added to the
  `where` clause alongside `is_active`.
- UI gating (defense in depth, not the primary control): the delete button
  only renders when the logged-in user's `profile.role === 'manager'` (from
  `useAuth()`) — same pattern the app already uses to gate the claims-queue
  nav item, just applied to a button instead of a whole route.
- Confirmation UX: a small inline panel/section (not a browser `confirm()`
  dialog) where the manager must type the order's own `makro_order_no`
  character-for-character into a text field before the actual delete button
  becomes enabled. No password re-entry, no 2FA re-challenge — this typed
  match is the confirmation step, full stop.
- If `order.status === 'shipped'`, the confirmation panel shows a visibly
  stronger warning (distinct copy, not just the same text) — the customer
  may already have seen the link and/or filed a claim.
- After a successful delete: write one audit-log entry (`logAction`) with a
  snapshot of the order's identifying fields in `meta` (the row itself will
  be gone, so this is the only record afterward), then navigate back to `/`
  (งานวันนี้).
- All existing tests must stay green.

## Task 1 (single batch)

### 1a. Migration `koh-payam-delivery/supabase/migrations/0013_manager_delete_orders.sql`

Read `supabase/migrations/0007_hardening.sql` in full first — copy
`is_team_member()`'s exact structure for `is_manager()`, and replace
`orders`' `team_write` policy with the three-policy split described in
Global Constraints. Exact SQL (adapt only if the file you read shows a
different real structure than assumed here — trust the file over this
sketch, but the *shape* of the change is: add one function, drop one
policy, add three):

```sql
create or replace function public.is_manager() returns boolean
language sql security definer stable as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager' and is_active
  )
$$;

drop policy if exists team_write on public.orders;

create policy team_insert on public.orders
  for insert to authenticated with check (public.is_team_member());

create policy team_update on public.orders
  for update to authenticated using (public.is_team_member())
  with check (public.is_team_member());

create policy manager_delete on public.orders
  for delete to authenticated using (public.is_manager());
```

Controller applies to cloud (`supabase db push`) after the task review, and
verifies with a live check: a non-manager profile's delete attempt is
rejected by RLS (0 rows affected / permission error), a manager's succeeds.

### 1b. `koh-payam-delivery/src/lib/api/orders.ts`

- New `export async function deleteOrder(orderId: string): Promise<void>` —
  `await supabase.from('orders').delete().eq('id', orderId)`; throw a Thai
  error on failure (`ลบออเดอร์ไม่สำเร็จ: ...`, matching this file's existing
  error-message style — read a few existing functions in this file for the
  exact phrasing convention before writing the new one). On success, call
  `logAction('order_deleted', 'order', orderId, { makroOrderNo, customerNameEn,
  status, shipDate })` — the caller (OrderDetail) must pass these 4 fields
  in since after the delete there is nothing left in the DB to look them up
  from; import `logAction` from `./audit` the same way this file already
  imports it for `commitImport`.
- Test (`orders.test.ts`, same mock-supabase pattern already in this file):
  a happy path asserts the delete call targets the right `id` and that
  `logAction` was called with the 4-field snapshot; a failure path asserts
  the Thai error message and that `logAction` is NOT called when the delete
  itself fails.

### 1c. `koh-payam-delivery/src/routes/team/OrderDetail.tsx`

Read the whole current file before editing — it already has `busy`/`msg`
state, a `useAuth`-free design (it doesn't currently need the profile), and
several `card`-styled sections.

- Import `useAuth` from `../../lib/auth` and `deleteOrder` from
  `../../lib/api/orders`; import `useNavigate` from `react-router-dom`
  (check whether it's already imported — if `Link`/`useParams` are already
  imported from `react-router-dom` in one line, add `useNavigate` to that
  same import).
- New local state: a boolean for "delete panel open/closed" and a string
  for the typed confirmation text.
- Render a manager-only "danger zone" section near the bottom of the page
  (after the existing backorders section, before the closing `msg` line is
  fine) — only when `profile?.role === 'manager'`:
  - A `btn btn-danger btn-sm` "ลบออเดอร์นี้" button that opens the
    confirmation panel.
  - The panel: explanatory text asking the manager to type the exact
    `makro_order_no` to confirm, a text input bound to the confirmation
    state, and a `btn btn-danger` "ลบถาวร" button `disabled` unless the
    typed value === `order.makro_order_no` exactly (case-sensitive, no
    trimming leniency — order numbers don't have stray whitespace). When
    `order.status === 'shipped'`, prepend/emphasize a visibly stronger
    warning line above the input (distinct copy from the non-shipped case —
    your call on exact wording, but it must read as a stronger warning, not
    just repeat the same sentence).
  - On confirm: call `deleteOrder` with the 4-field snapshot from the
    already-loaded `order` object, then `nav('/')` on success; on failure,
    show the thrown error via the existing `msg` state pattern (don't
    navigate away on failure).
- Tests (`OrderDetail.test.tsx`): the button is absent for a non-manager
  profile and present for a manager (mock `useAuth` the same way other test
  files in this codebase mock it — check `AppShell.test.tsx` for the
  pattern); typing the wrong order number keeps the confirm button
  disabled; typing the exact right number enables it and clicking it calls
  `deleteOrder` then navigates to `/`; the shipped-order warning copy
  differs from the non-shipped one (assert both variants render their own
  distinct text on two renders with different `order.status` fixtures).

### 1d. Tests

Full list run at the end: `orders.test.ts`, `OrderDetail.test.tsx`. No
Deno/edge-function involvement in this task — everything is client-side
Supabase JS calls against RLS, so there is no edge function to redeploy.
The RLS enforcement itself (1a) is verified live by the controller against
the cloud database, not by vitest.

Report: `.superpowers/sdd/2026-09-12-delete-order/task-1-report.md`.
