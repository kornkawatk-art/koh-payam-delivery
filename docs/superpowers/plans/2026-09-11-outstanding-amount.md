# Plan — Outstanding amount / cash-on-delivery visibility

Spec: agreed in conversation 2026-09-11 (grilling session, "ยืนยันตามนี้").
Branch: `feature/outstanding-amount` off `main` (@ 8b41072).

## Context

The Makro `OrderExport` file (the address/order-level file already imported
daily) carries real payment data that nothing in the app currently reads:
`Payment Method`, `Payment Status`, `Outstanding Amount` (plus `Invoice
Amount`, `Paid Amount`, `Refund Pending`, `Refunded Amount` — out of scope,
skip them). Confirmed against the real file: `Outstanding Amount > 0` alone
is a reliable "needs cash collected at delivery" signal — 118 of 122 rows
with a nonzero outstanding amount are `Payment Method = "Pay On Delivery"`;
every other payment method is essentially always `Paid` with a zero balance.
So gate everything on the numeric amount, not on matching payment-method
strings (Makro could add new method names without warning).

This is a *different* kind of money than what Phase-1/the Makro rework
removed: that was unreliable per-item unit pricing (not in the file at all).
This is an order-level balance Makro itself computes and exports — reliable,
and exactly the "แจ้งการชำระเงิน" (payment notice) pain point from the
original brainstorm, never built.

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest. Supabase cloud
  (`kprlqjxwolljkgqyzygf`) — controller applies the migration and redeploys
  `order-view` after review; no local Docker/Deno.
- New `orders` columns are **soft-optional**: a file/mapping missing them
  must import exactly as it does today, with no error and no banner shown
  for that batch. Never let this feature block the daily import.
- Display condition everywhere: `outstanding_amount > 0`. Never gate on
  `payment_method` string matching.
- Team screens (Thai) show amount + method. The customer page shows only
  the amount (no payment method) — EN/TH via i18n, `formatTHB` for the
  number, no per-item pricing revival.
- The claims "จำนวนเงินคืน" (refund) field is untouched — stays an
  independent manual number, no link to this feature.
- No new gate on any status transition — purely informational, ship-off
  still requires only boat + handoff photo, unchanged.
- Non-destructive re-import (existing behavior) must refresh these 3
  fields on every sync, same as `customer_name_en`/`sub_district`/
  `makro_order_status` today — a customer's balance can change between
  imports (they pay before delivery).
- All existing tests must stay green; existing fixtures that lack these 3
  columns must continue to import without error (soft-optional, proves it).

## Task 1 (single batch)

### 1a. Migration `koh-payam-delivery/supabase/migrations/0010_outstanding_amount.sql`

```sql
alter table orders
  add column if not exists payment_method text,
  add column if not exists payment_status text,
  add column if not exists outstanding_amount numeric(12,2);
```

Controller applies to cloud (`supabase db push`) after the task review.

### 1b. `koh-payam-delivery/src/lib/import/buildImport.ts`

- `OrderMapping` gains `paymentMethod: string`, `paymentStatus: string`,
  `outstandingAmount: string`.
- `DEFAULT_ORDER_MAPPING` gains `paymentMethod: 'Payment Method'`,
  `paymentStatus: 'Payment Status'`, `outstandingAmount: 'Outstanding
  Amount'` — the real file's exact header names.
- `FIELD_LABELS_ORDER` gains Thai labels: `paymentMethod: 'วิธีชำระเงิน'`,
  `paymentStatus: 'สถานะการชำระเงิน'`, `outstandingAmount: 'ยอดค้างชำระ'`.
- `ORDER_REQUIRED` stays unchanged (these 3 are never required).
- **Soft-optional column-existence check**: add a new
  `const ORDER_SOFT: (keyof OrderMapping)[] = ['paymentMethod',
  'paymentStatus', 'outstandingAmount']` and change `validateMapping`'s
  order-loop so that for keys in `ORDER_SOFT`, a mapped-but-not-found
  column is *not* pushed as a problem either (today's loop already skips
  the "required" check for non-required keys when blank; extend it so
  these 3 keys skip the "not found in file" check too, regardless of blank
  or non-blank — they must never block import). Keep the existing
  behavior for every other order/detail field unchanged.
- `ParsedOrder` gains `paymentMethod: string | null`, `paymentStatus:
  string | null`, `outstandingAmount: number`.
- In `buildImport`'s order-row mapping: read the 3 raw columns via `om`
  (blank/missing → `paymentMethod`/`paymentStatus` `null`,
  `outstandingAmount` via the existing `toNum()` helper → `0` when blank
  or unparseable — reuse `toNum`, do not write a second numeric parser).
- Tests: existing fixtures/tests must still pass unmodified (proves
  soft-optional). Add new coverage: a detail+order fixture pair (or an
  extension of the existing order-export sample) where the 3 columns ARE
  present, using real-shaped values, e.g. one row `Payment Method: "Pay On
  Delivery", Payment Status: "Unpaid", Outstanding Amount: "6172.5"` and
  one row `Payment Method: "QR_CODE", Payment Status: "Paid", Outstanding
  Amount: "0"` (or blank) — assert `ParsedOrder.outstandingAmount` /
  `.paymentMethod` come through correctly for both, and that a file
  missing these columns entirely still builds with no validation error.

### 1c. `koh-payam-delivery/src/lib/api/orders.ts` — `commitImport`

- Insert branch (`.insert({...})` for a brand-new order): add
  `payment_method: o.paymentMethod, payment_status: o.paymentStatus,
  outstanding_amount: o.outstandingAmount`.
- Update/sync branch (`.update({...})` for an existing order): add the
  same 3 fields — they refresh on every re-import, same as
  `customer_name_en`/`sub_district`/`makro_order_status`.
- `getOrder` stays on `select('*', ...)` — no change needed, new columns
  ride along automatically.
- Tests (`orders.test.ts`): update the `parsedOrders` fixture to carry
  `paymentMethod: 'Pay On Delivery', paymentStatus: 'Unpaid',
  outstandingAmount: 6172.5`. Update both the fresh-insert
  `toMatchObject` assertion and the re-import-sync `patch` `toEqual`
  assertion to include `payment_method: 'Pay On Delivery', payment_status:
  'Unpaid', outstanding_amount: 6172.5`. The existing `not.toHaveProperty`
  protected-column list (`status`, `boat_id`, `paper_box_count`,
  `foam_box_count`, `shipped_at`, `packed_at`, `link_token`) is unchanged —
  these 3 new fields are deliberately NOT protected, they're meant to sync.

### 1d. `koh-payam-delivery/src/routes/team/PierLoad.tsx`

- When the selected order (`sel`) — note `PierOrder` type needs
  `outstanding_amount: number | null` and `payment_method: string | null`
  added, and `listOrdersForDay`'s select (see 1g) must return them — has
  `outstanding_amount > 0`, show a prominent alert above/near the boat
  picker: `alert alert-warn` with text
  `` `เก็บเงินปลายทาง ${formatTHB(sel.outstanding_amount)} (${sel.payment_method})` ``
  (import `formatTHB` from `../../lib/format`). No alert when 0/null.

### 1e. `koh-payam-delivery/src/routes/team/OrderDetail.tsx`

- Same alert, same condition, placed near the top of the page (e.g. right
  after the status header, before the customer-link card). Same copy as
  1d for consistency.

### 1f. `koh-payam-delivery/src/routes/team/DailyDashboard.tsx`

- Add a small `badge badge-warn` reading `เก็บเงิน` in the row of any order
  with `outstanding_amount > 0` (next to or inside the existing status
  cell — controller/implementer's call on exact placement, keep the table
  from growing a whole new column). `listOrdersForDay`'s select (1g) must
  include `outstanding_amount`.

### 1g. `koh-payam-delivery/src/lib/api/shipDays.ts`

- `listOrdersForDay`'s `.select(...)` string gains `outstanding_amount`
  and `payment_method` (both needed: 1f for the badge, 1d's `PierOrder`
  type is populated from this same call in `PierLoad`). Update
  `shipDays.test.ts`'s pinned select-string assertion accordingly.

### 1h. `koh-payam-delivery/supabase/functions/order-view/index.ts`

- Orders `select` already uses `*` for the top-level `orders` fields, so
  `o.outstanding_amount` is already fetched — no select change needed.
- Response `body` gains `outstandingAmount: o.outstanding_amount > 0 ?
  Number(o.outstanding_amount) : null` — never leak `payment_method` or
  `payment_status` to the customer (Q3a/Q8 scoped this to amount only).
- Controller redeploys `order-view` after review and live-smokes it.

### 1i. `koh-payam-delivery/src/routes/customer/CustomerOrderView.tsx` + `i18n.ts`

- New i18n keys, both `en` and `th` (parity-tested):
  `outstanding_amount_label`: en `"Amount due on delivery"`, th
  `"ยอดที่ต้องชำระ"`.
- In `CustomerOrderView`, when `data.outstandingAmount` is a positive
  number, render a line (near the boxes/boat summary section) using
  `formatTHB` — reuse the existing customer-page number formatting
  convention (check how `formatDate`/`formatDateTime` are imported from
  `../../lib/format` already; add `formatTHB` to that import). Format:
  `{t(lang,'outstanding_amount_label')}: {formatTHB(data.outstandingAmount)}`.
  No line at all when null/0.
- `OrderView` type in this file gains `outstandingAmount: number | null`.

### 1j. Tests

Full list, run at the end: `orders.test.ts`, `buildImport.test.ts`,
`shipDays.test.ts`, `PierLoad.test.tsx` (new test: alert shown/hidden by
`outstanding_amount`), `OrderDetail.test.tsx` (same), `DailyDashboard.test.tsx`
(badge shown/hidden), `CustomerOrderView.test.tsx` (line shown/hidden,
correct formatted amount, absent when null). `order-view/index.ts` is Deno,
not in vitest — controller live-smokes it (existing live-smoke pattern from
this session: insert a test order with `outstanding_amount` set, fetch the
function, assert `outstandingAmount` present and correctly typed, assert no
`payment_method`/`payment_status` leak).

Report: `.superpowers/sdd/2026-09-11-outstanding-amount/task-1-report.md`.
