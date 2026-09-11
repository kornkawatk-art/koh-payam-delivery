# Plan — Group same-customer orders (multi-PO split bills)

Spec: agreed in conversation 2026-09-11 (grilling session, "ยืนยันตามนี้").
Branch: `feature/customer-grouping` off `main` (@ 7599fca).

## Context

Customers often split one purchase into multiple Makro POs ("ซอยบิล") that
ship together. Today each PO is its own isolated `/o/<token>` link — the
customer has to ask the team for each link separately. Confirmed against
the real file: `Customer Phone` (in `OrderExport`, never imported before)
reliably groups these — two real examples in the Payam subset each share
one phone number, one ship date, across 2–3 separate PO numbers.

This is additive to the existing per-order model: no new token type, no
new table. `orders.customer_phone` is a new soft-optional column used
purely to compute "same customer, same day" at read time.

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest. Supabase
  cloud (`kprlqjxwolljkgqyzygf`) — controller applies the migration and
  redeploys `order-view` after review; no local Docker/Deno.
- `customer_phone` is **soft-optional** on import (same pattern as
  `paymentMethod`/`paymentStatus`/`outstandingAmount` from the previous
  batch — see `ORDER_SOFT` in `buildImport.ts`): a file/mapping missing it
  must import with zero errors, no grouping shown for that batch.
- Grouping key = `customer_phone` (exact match) **AND** `ship_date` (exact
  match). Never group across different ship dates. Blank/null phone on
  either side never groups (avoids merging unrelated customers who both
  lack a phone number).
- `customer_phone` is **never displayed anywhere** — not to the customer,
  not to the team. It exists solely to compute groups server/client side.
  Never add it to any rendered `<td>`, `<p>`, or API response field that
  isn't the internal grouping query itself.
- No new link/token type. Every order keeps exactly the behavior it has
  today (own status, own boat, own 48h claim window, own link). The team's
  "คัดลอกลิงก์" workflow is completely unchanged.
- Customer page: the cross-link list must never include a sibling whose
  own link would 404 (already past its own 48h claim window, or expired
  for whatever reason `order-view` already 404s the primary order for) —
  reuse the exact same validity rule already in `order-view`, don't
  duplicate slightly-different logic.
- All existing tests must stay green; existing fixtures lacking
  `Customer Phone` must continue to import without error.

## Task 1 (single batch)

### 1a. Migration `koh-payam-delivery/supabase/migrations/0011_customer_phone.sql`

```sql
alter table orders
  add column if not exists customer_phone text;
```

Controller applies to cloud (`supabase db push`) after the task review.

### 1b. `koh-payam-delivery/src/lib/import/buildImport.ts`

Follow the exact existing pattern for `paymentMethod`/`paymentStatus` in
this same file (read it before editing — `OrderMapping`, `DEFAULT_ORDER_MAPPING`,
`FIELD_LABELS_ORDER`, `ORDER_SOFT`, and the order-row loop in `buildImport()`):

- `OrderMapping` gains `customerPhone: string`.
- `DEFAULT_ORDER_MAPPING` gains `customerPhone: 'Customer Phone'` (the real
  file's exact header name).
- `FIELD_LABELS_ORDER` gains `customerPhone: 'เบอร์โทรลูกค้า'`.
- `ORDER_SOFT` gains `'customerPhone'` — same soft-optional treatment
  (never blocks import whether blank or mapped-to-a-missing-column).
- `ParsedOrder` gains `customerPhone: string | null`.
- In the order-row loop: `const customerPhone = om.customerPhone ? (r[om.customerPhone] ?? '').trim() : ''`
  then store `customerPhone: customerPhone || null` — mirror the
  `paymentMethod` line exactly.
- Tests: existing fixtures (lacking this column) must still build with
  zero validation errors (soft-optional proof, same style as the existing
  `paymentMethod`/`outstandingAmount` soft-optional test). Add one new
  fixture row with a real-shaped phone number (e.g. `"0826289533"`) and
  assert it comes through as `ParsedOrder.customerPhone`.

### 1c. `koh-payam-delivery/src/lib/api/orders.ts` — `commitImport`

- Insert branch: add `customer_phone: o.customerPhone`.
- Update/sync branch: add `customer_phone: o.customerPhone` — refreshes on
  every re-import, same as the payment fields.
- Tests (`orders.test.ts`): update the `parsedOrders` fixture to carry
  `customerPhone: '0826289533'`; add it to both the fresh-insert
  `toMatchObject` and the re-import-sync `patch` `toEqual` assertions. The
  `not.toHaveProperty` protected-column list is unchanged — `customer_phone`
  is deliberately not on it (it's meant to sync).

### 1d. `koh-payam-delivery/src/lib/api/shipDays.ts`

- `listOrdersForDay`'s `.select(...)` string gains `customer_phone`
  (it already selects `id`, needed to exclude self when grouping). Update
  `shipDays.test.ts`'s pinned select-string assertion.

### 1e. `koh-payam-delivery/src/routes/team/DailyDashboard.tsx`

- Client-side grouping (no new query — derive from the `rows` already
  loaded for the day): for each row, it has "siblings" if another row in
  the same `rows` array has the same non-null/non-blank `customer_phone`.
- Add a small `badge badge-neutral` reading `หลาย PO` next to rows that
  have at least one sibling (placement: your call, keep it compact — don't
  add a new table column, similar to how the existing "เก็บเงิน" badge sits
  inline near the status cell but visually distinct from it, e.g. a
  different tone so the two badges aren't confused).
- Tests: a new test with two same-phone/same-day rows and one unrelated
  row asserts the badge appears on the two grouped rows and not the third.

### 1f. `koh-payam-delivery/supabase/functions/order-view/index.ts`

Read the whole file before editing — it already has the 48h-expiry check
for the primary order (`shippedMs` / `CLAIM_WINDOW_MS` logic) and an
explicit allowlist response object.

- After loading the primary order `o` and validating it's not expired: if
  `o.customer_phone` is present (non-null, non-empty), query sibling
  orders: same `customer_phone`, same `ship_date`, `id != o.id`, selecting
  `makro_order_no, status, shipped_at, link_token`.
- Filter siblings to only those that would themselves pass the *exact
  same* validity rule already applied to the primary order above (not
  expired: `shipped_at` is null, or `now - shipped_at <= CLAIM_WINDOW_MS`)
  — extract/reuse that check rather than re-deriving a second version of
  it.
- Response gains `siblingOrders: { orderNo: string; status: string; token: string }[]`
  (empty array when there are no siblings or `customer_phone` is null).
  `token` here is the sibling's own `link_token` — this is intentional:
  the requester already holds a valid, unexpired token proving they are
  this phone number's customer, so revealing sibling tokens for orders
  sharing that same phone+day is the whole point of this feature. Do NOT
  put `customer_phone` itself anywhere in the response.
- Controller redeploys `order-view` after review and live-smokes it (two
  orders, same phone, same ship_date, one shipped >48h ago — confirm the
  fresh one lists only the valid sibling, and confirm the response never
  contains `customer_phone`/`payment_method`/`payment_status`, matching
  the existing no-leak pattern from the previous batch).

### 1g. `koh-payam-delivery/src/routes/customer/CustomerOrderView.tsx` + `i18n.ts`

- `OrderView` type gains `siblingOrders: { orderNo: string; status: string; token: string }[]`.
- New i18n keys, both `en` and `th` (parity-tested by the existing generic
  parity test): `related_orders_heading` — en `"You have {n} more order(s)
  today"`, th `"คุณมีออเดอร์อื่นวันนี้อีก {n} รายการ"` (uses the existing
  `t(lang, key, vars)` interpolation, e.g. `{n: data.siblingOrders.length}`);
  `view` — en `"View"`, th `"ดู"`.
- When `data.siblingOrders.length > 0`, render a card/section near the top
  of the page (above `OrderStatusTimeline`, same visual language as the
  other alert/info sections already in this file) listing each sibling as
  `{orderNo} · {t(lang, 'status_' + status)}` with a `Link` (from
  `react-router-dom`, already used elsewhere in this codebase for in-app
  navigation) to `/o/${sibling.token}`, labelled with `t(lang, 'view')`.
  Reuse the existing `status_*` i18n keys already in this file for the
  translated status label — do not invent new ones.
- Nothing here ever renders `customer_phone` (it isn't in the API response
  in the first place — nothing to guard against, just don't add it).

### 1h. Tests

Full list, run at the end: `buildImport.test.ts`, `orders.test.ts`,
`shipDays.test.ts`, `DailyDashboard.test.tsx`, `CustomerOrderView.test.tsx`
(sibling list shown/hidden, correct status labels, correct link hrefs,
`related_orders_heading` interpolates the count correctly), `i18n.test.ts`
(parity, automatic). `order-view/index.ts` is Deno, not in vitest —
controller live-smokes it per 1f.

Report: `.superpowers/sdd/2026-09-11-customer-grouping/task-1-report.md`.
