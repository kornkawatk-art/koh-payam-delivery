# Plan — Multi-item claims, no-forced-delete qty field, bigger photo caps

Spec: agreed in conversation 2026-09-12 (grilling session, "ยืนยันตามนี้").
Branch: `feature/claim-multi-item` off `main`.

## Context

Three requested fixes, bundled into one branch since they touch overlapping
files (`CustomerClaimForm.tsx`, `PhotoCapture` call sites):

1. The claim form's "จำนวน" (qty) input defaults to `1` and requires
   deleting the digit before typing a new one — same friction the pack
   screen's box-count inputs had, fixed there with `onFocus` select-all.
2. **The big one:** when a customer reports `missing_in_box` ("ของขาดใน
   กล่อง"), they can currently pick only one product per claim. They need
   to be able to pick several products in one submission, each with its
   own qty — as **one claim record**, not several separate claims. Verified
   via `select count(*) from claims` on the live cloud DB: **zero existing
   rows**, so this is a clean schema cutover, no data migration needed.
3. The evidence-photo cap goes from 3 to 5, in both places it's set today
   (`CustomerClaimForm.tsx`'s claim photos, `PierLoad.tsx`'s pier/boat-load
   photos) — `PackOrder.tsx`'s pack photos are already uncapped, leave as-is.

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest, Deno edge
  functions. Supabase cloud (`kprlqjxwolljkgqyzygf`) — controller applies
  the migration and redeploys the two touched edge functions
  (`submit-claim`, `order-view`) after review.
- **Qty field default stays `1`** (0 items is meaningless for a claim) —
  do not change `min={1}` or the default value. Only add
  `onFocus={(e) => e.target.select()}`, matching the exact pattern already
  used on `PackOrder.tsx`'s paper/foam/piece inputs.
- **Multi-item claims — only `missing_in_box` changes shape.** `damaged`
  keeps its existing single-product `<select>` UI exactly as today;
  `box_lost` keeps its existing no-item-picker UI exactly as today (a
  single qty + shared description, no product reference at all — this
  was explicitly confirmed to stay unchanged). Only `missing_in_box` gets
  a checkbox list of the order's products, each with its own qty input
  that appears once checked.
- **Schema — clean cutover** (verified zero existing `claims` rows, so no
  backward-compatibility path is needed):
  - New table `claim_items (id uuid pk, claim_id uuid references
    claims(id) on delete cascade, order_item_id uuid references
    order_items(id) on delete set null, qty numeric(12,3) not null)`.
  - Drop `claims.order_item_id` and `claims.qty` — every claim's items now
    live exclusively in `claim_items`, including the `damaged` (always
    exactly 1 row) and `box_lost` (always 0 rows) cases. This uniformity
    means no downstream code branches on claim type to decide whether an
    "items" concept applies — every claim has `claim_items.length >= 0`,
    full stop.
  - `claim_items` RLS: mirror `claim_photos`'s exact existing shape (read
    `supabase/migrations/0002_rls.sql` and `0007_hardening.sql` for its
    precise definition before writing this) — `enable row level security`
    plus ONE `team_read` policy (`for select to authenticated using
    (public.is_team_member())`), **no insert/update/delete policy at
    all** — exactly like `claim_photos`, because the only writer is the
    `submit-claim` edge function using the service-role key, which
    bypasses RLS entirely; team members only ever read this table.
  - Insert atomicity: a claim with zero items rows would be a real bug
    (an orphaned/broken claim a manager can't act on), so the insert of
    the parent `claims` row and its `claim_items` rows must not be able to
    partially succeed. Add a single Postgres function,
    `create_claim(p_order_id uuid, p_type text, p_description text,
    p_items jsonb) returns uuid` (`language plpgsql`, `security definer`,
    `set search_path = public`) that inserts one `claims` row, then loops
    `p_items` (a JSON array of `{order_item_id, qty}`, possibly empty for
    `box_lost`) inserting one `claim_items` row per entry, all inside the
    function's own implicit transaction — if any insert fails, the whole
    function call rolls back and nothing is left behind. `submit-claim`
    calls this via `.rpc('create_claim', {...})` instead of a raw
    `.from('claims').insert(...)`.
- **`submit-claim` edge function — unify the request shape.** Replace the
  single `orderItemIndex`/`qty` fields with `items: { orderItemIndex:
  number; qty: number }[]` for every claim type: `box_lost` sends `[]`,
  `damaged` sends exactly one entry, `missing_in_box` sends one or more.
  Validate: `damaged` must have exactly 1 entry, `missing_in_box` must
  have at least 1 entry, `box_lost` must have exactly 0 (reject with 400
  otherwise — this is a real validation the current single-item code
  already does implicitly via `needsItem`, do not silently accept a
  malformed request). Resolve each `orderItemIndex` against the order's
  `order_items` (same lookup the current code does), build the `p_items`
  jsonb array, call `create_claim`.
- **`resolveClaim` / `createResendBackorder`** (`src/lib/api/claims.ts`,
  `src/lib/api/backorders.ts`): refund amount stays exactly as today — ONE
  manager-typed total for the whole claim, no per-item breakdown, no
  change to `resolveClaim`'s signature or `claims.refund_amount`.
  `createResendBackorder` must now create **one `backorders` row per
  `claim_items` row** on that claim (each with that item's own
  `product_name`/`qty`), instead of the single row it creates today —
  read the function in full first, the change is mechanical (loop instead
  of one insert) but must preserve every other field it currently sets
  (`reason: 'claim_resend'`, `status: 'pending'`, `target_ship_date:
  null`, etc.) for each row.
- **`ClaimDetail.tsx`**: replace the current single `{item && <p>รายการ:
  ...}</p>}` line with a list of every `claim_items` row (product name ×
  qty each) — `getClaim` (`src/lib/api/claims.ts`) must join
  `claim_items(qty, order_items(product_name))` instead of the current
  bare `order_items(product_name,...)` single join.
- **`ClaimsQueue.tsx`**: the "จำนวน" column header and cell change to
  "จำนวนรายการ" showing the item **count** (`claim_items.length`, e.g.
  "2 รายการ"), not a summed quantity. `listClaims`
  (`src/lib/api/claims.ts`) must select `claim_items(id)` (just enough to
  count) alongside its existing fields.
- **Customer-facing surfaces:**
  - `CustomerClaimForm.tsx`: for `missing_in_box`, render every item in
    `items` as a checkbox with a qty input that appears once checked (qty
    input disabled/hidden while unchecked); `damaged` keeps its existing
    single `<select>`; `box_lost` keeps its existing no-picker UI. Submit
    button disabled until at least one item is checked (`missing_in_box`)
    — mirror the existing implicit validation shape, do not let an empty
    selection submit.
  - `order-view` edge function: its `claims` select must join
    `claim_items(qty, order_items(product_name))` and the response's
    `claims[].` shape gains an `items: { productName: string; qty: number
    }[]` array (replacing the bare `qty` field — read the full mapping
    block in `supabase/functions/order-view/index.ts` before editing, it
    also strips internal `[ทีม]` note lines from `description`, preserve
    that untouched).
  - `CustomerOrderView.tsx`: its claims list renders each item's product
    name + qty (e.g. "ขนมปังแซนวิช × 2, นมสด × 1") instead of the current
    bare `× {c.qty}`, for every claim type uniformly (a `damaged`/`
    box_lost` claim's `items` array just happens to have 1 or 0 entries —
    render 0 entries as no item line at all, same as today's `box_lost`
    which shows no item reference).
  - i18n (`src/routes/customer/i18n.ts`): `claim_form_photos` en/th text
    changes from "(up to 3)"/"(สูงสุด 3)" to "(up to 5)"/"(สูงสุด 5)". Add
    whatever new key(s) the multi-select checkbox UI needs (e.g. a hint
    that multiple items can be picked) — keep wording terse, matching this
    file's existing one-line-per-key style; check both `en` and `th`
    blocks get the same new keys (this file has an existing parity test —
    run it).
- **Photo caps**: `CustomerClaimForm.tsx`'s `<PhotoCapture max={3} .../>`
  → `max={5}`; `PierLoad.tsx`'s `<PhotoCapture max={3} .../>` → `max={5}`,
  and its adjacent `"รูปหลักฐาน (สูงสุด 3)"` label text → `"(สูงสุด 5)"`.
  `PackOrder.tsx`'s pack-photo `<PhotoCapture>` has no `max` prop today —
  leave it uncapped, do not add one.
- All existing tests must stay green; every touched file's existing test
  suite needs updating for the new shapes (multi-item claims, `max={5}`,
  the `onFocus` addition) — this is expected, not a regression.

## Task 1 (single batch)

### 1a. Migration `koh-payam-delivery/supabase/migrations/0015_claim_items.sql`

Read `supabase/migrations/0002_rls.sql` and `0007_hardening.sql` in full
first for `claim_photos`'s exact RLS shape and `claims`'s exact current
column list, then write:

```sql
create table claim_items (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  order_item_id uuid references order_items(id) on delete set null,
  qty numeric(12,3) not null
);
create index on claim_items (claim_id);

alter table claims drop column order_item_id;
alter table claims drop column qty;

alter table claim_items enable row level security;
create policy team_read on claim_items for select to authenticated
  using (public.is_team_member());

create or replace function public.create_claim(
  p_order_id uuid,
  p_type text,
  p_description text,
  p_deadline_at timestamptz,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_claim_id uuid;
  v_item jsonb;
begin
  insert into claims (order_id, type, description, status, deadline_at)
  values (p_order_id, p_type, p_description, 'open', p_deadline_at)
  returning id into v_claim_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into claim_items (claim_id, order_item_id, qty)
    values (v_claim_id, (v_item->>'order_item_id')::uuid, (v_item->>'qty')::numeric);
  end loop;

  return v_claim_id;
end;
$$;
```

`p_deadline_at` is computed exactly where `deadline` is computed today —
`submit-claim/index.ts` already derives it from `shipped_at +
CLAIM_WINDOW_MS` before its current `.from('claims').insert(...)` call;
keep that one TS computation as the only place the 48h window is turned
into a timestamp, and just pass its existing `deadline` value through as
this new parameter instead of putting a second, duplicate `interval '48
hours'` literal in SQL. `box_seq` (an existing nullable `claims` column,
currently always `null` from this form) stays on `claims` untouched —
only `order_item_id`/`qty` move to `claim_items`.

Controller applies via `supabase db push` after review, and redeploys
`submit-claim` and `order-view` (`supabase functions deploy submit-claim
order-view`).

### 1b. `koh-payam-delivery/supabase/functions/submit-claim/index.ts`

Read the whole file first. Replace the single `orderItemIndex`/`qty`
handling with the `items` array shape described in Global Constraints:
validate array length against `type` (0 for `box_lost`, exactly 1 for
`damaged`, 1+ for `missing_in_box`, 400 otherwise), resolve each
`orderItemIndex` to an `order_items.id` the same way the current code
does (reusing the existing `order_items` select), build the `p_items`
jsonb payload (`[{order_item_id, qty}, ...]`, `qty` clamped the same way
the current single-`qty` code does — `Math.max(1, Math.floor(...))` per
item, not just once). Keep the existing `deadline` computation
(`shippedMs + CLAIM_WINDOW_MS`) exactly as today, and call
`.rpc('create_claim', { p_order_id: o.id, p_type: p.type, p_description:
description, p_deadline_at: deadline, p_items: itemsJson })` instead of
`.from('claims').insert(...)`. Keep every other existing check untouched
(token lookup, 48h window, photo-key prefix validation, `photoKeys`
linking to `claim_photos` after the claim is created — that linking
still targets the single returned claim id, unchanged).

### 1c. `koh-payam-delivery/supabase/functions/order-view/index.ts`

Read the whole file first (note the existing note-stripping logic on
`description` — preserve it). Change the `claims(...)` select to join
`claim_items(qty, order_items(product_name))`, and the response mapping
to include `items: { productName, qty }[]` per claim (empty array for a
`box_lost` claim, exactly one entry for `damaged`).

### 1d. `koh-payam-delivery/src/lib/api/claims.ts`

- `listClaims`: select gains `claim_items(id)` (or similar minimal
  projection) so `ClaimRow` can carry an item **count**; `ClaimRow` type
  gains `itemCount: number` (rename/replace the current bare `qty:
  number` field on `ClaimRow` — it no longer makes sense as a single
  number once a claim can hold several differently-quantified items).
- `getClaim`: select gains `claim_items(qty, order_items(product_name))`
  instead of the current single `order_items(...)` join, so `ClaimDetail`
  can render every item.
- `resolveClaim`: unchanged signature/behavior — refund amount stays one
  manager-typed total, confirmed explicitly in grilling.

### 1e. `koh-payam-delivery/src/lib/api/backorders.ts`

`createResendBackorder`: read the current single-row version in full,
then change it to select `claim_items(qty, order_items(product_name))`
for the given `claim_id` and insert one `backorders` row per item
(looping), each carrying that item's own `product_name`/`qty` and every
other field the current single insert sets (`reason: 'claim_resend'`,
`status: 'pending'`, `target_ship_date: null`, `source_order_id`).

### 1f. `koh-payam-delivery/src/routes/team/ClaimDetail.tsx`

Replace the single `{item && <p>รายการ: {item.product_name}</p>}` block
with a list rendering every entry from `c.claim_items` (product name ×
qty). Everything else on this page (decision/resolution/refund-amount
UI, photos, note) stays unchanged per Global Constraints.

### 1g. `koh-payam-delivery/src/routes/team/ClaimsQueue.tsx`

"จำนวน" column header → "จำนวนรายการ"; cell renders
`${c.itemCount} รายการ` instead of the current bare number.

### 1h. `koh-payam-delivery/src/routes/customer/CustomerClaimForm.tsx`

- For `type === 'missing_in_box'`: replace the single `<select>` with a
  checkbox per `items` entry; checking one reveals a qty input next to it
  (default `1`, `min={1}`, `onFocus` select-all per Global Constraints);
  unchecking removes/hides its qty. Track selection as local state (e.g.
  a map of item index → qty, or an array of `{index, qty}` for only the
  checked ones).
- For `type === 'damaged'`: keep the existing single `<select>` exactly
  as today.
- For `type === 'box_lost'`: keep the existing no-item-picker UI exactly
  as today.
- `submit()` builds the `items` array from whichever of the three shapes
  above is active (`box_lost` → `[]`; `damaged` → one entry from the
  existing `itemIndex`/`qty` state; `missing_in_box` → one entry per
  checked item with its own qty) and POSTs it as `items` in the body,
  replacing the current `orderItemIndex`/single `qty` fields.
- Submit button/gate: disabled when `missing_in_box` has zero items
  checked (mirror today's implicit requirement that a `missing_in_box`
  claim always references something).
- Every remaining qty input (the `damaged` single-qty field, and each
  per-item qty in the new `missing_in_box` checkbox list) gets
  `onFocus={(e) => e.target.select()}` per Global Constraints — the
  default-1-hard-to-overwrite friction was the original ask.
- `<PhotoCapture max={3} .../>` → `max={5}`.

### 1i. `koh-payam-delivery/src/routes/customer/CustomerOrderView.tsx`

Its claims-list rendering (`{t(lang, ...)} × {c.qty} · ...`) changes to
render each claim's `items` array (product name × qty per entry, comma-
or line-separated — your call on exact layout, keep it compact) instead
of the bare `× {c.qty}`; a claim with an empty `items` array (i.e.
`box_lost`) renders with no item line, same as today.

### 1j. `koh-payam-delivery/src/routes/customer/i18n.ts`

`claim_form_photos` en/th → "(up to 5)"/"(สูงสุด 5)". Add any new key(s)
1h's checkbox-list UI needs, in both `en` and `th` blocks (this file has
an existing en/th key-parity test — it must still pass).

### 1k. `koh-payam-delivery/src/routes/team/PierLoad.tsx`

`<PhotoCapture max={3} .../>` → `max={5}`; the adjacent
`"รูปหลักฐาน (สูงสุด 3)"` label → `"(สูงสุด 5)"`.

### 1l. Tests

Update every existing test file whose subject changed shape:
`CustomerClaimForm.test.tsx`, `ClaimDetail.test.tsx`,
`ClaimsQueue.test.tsx`, `CustomerOrderView.test.tsx` (if it asserts
claims rendering), `claims.test.ts` (if it exists — check
`src/lib/api/`), `backorders.test.ts`, `i18n.test.ts` (parity check),
`PierLoad.test.tsx`. Add new coverage: `submit-claim`'s type/items-count
validation (0/1/1+ per type, reject mismatches) if this project has
Deno-function-level tests for it (check `supabase/functions/submit-claim/`
for an existing test file — if none exists, this function has never had
direct tests in this codebase and you don't need to newly add a Deno test
harness for it, just make sure the client-side call shape in
`CustomerClaimForm.tsx` is covered); `create_claim`'s atomicity is a DB
concern the controller verifies live after migration, not something
vitest can exercise.

Full suite run at the end: whatever `npx vitest run` reports must be 100%
green, and `npm run build` must succeed.

Report: `.superpowers/sdd/2026-09-12-claim-multi-item/task-1-report.md`.
