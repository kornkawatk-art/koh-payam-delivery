# Plan — Phone-first backorder matching + "unmatched backorders" view

Spec: agreed in conversation 2026-09-12 (grilling session, "ยืนยันตามนี้").
Branch: `feature/backorder-phone-match` off `main`.

## Context

`linkBackordersToDay` (runs automatically at the end of every `commitImport`)
currently matches a pending backorder to a same-day order by exact
`customer_name_en` string equality only. Real production data confirms
`customer_phone` is 100% populated today (12/12 orders), even though the
import schema still treats it as optional — so matching by phone first,
falling back to name, closes a real silent-failure mode (a Makro-side
spelling difference between two orders for the same person breaks the
name match with zero visible symptom). Separately, there is currently no
screen anywhere that shows a pending backorder that hasn't yet been
matched to a target order — it stays completely invisible until a match
happens, which could be never for a customer who doesn't reorder soon.
Verified live: 3 real unmatched backorder rows exist in production right
now (2 from a claim's "resend next day", 1 from an ordinary shortage).

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest. Supabase
  cloud (`kprlqjxwolljkgqyzygf`) — no edge function involved, no DB schema
  change (no migration needed — every column this touches already
  exists: `orders.customer_phone`, `backorders.created_at`).
- **Matching order: phone first, name as fallback**, per backorder, not
  globally — read `linkBackordersToDay` in `koh-payam-delivery/src/lib/api/backorders.ts`
  in full before changing it. For each pending backorder: if its source
  order has a non-empty `customer_phone`, look for a same-day order whose
  `customer_phone` matches (trimmed, exact) — if found, use it. If the
  source order's phone is empty, OR no phone match was found among that
  day's orders, fall back to the existing exact `customer_name_en` match.
  Do not change the "first match wins" behavior for the (rare, already-
  existing) case of multiple same-day orders sharing the same customer —
  that edge case is unchanged, just now reachable via phone too.
- The `orders` query inside `linkBackordersToDay` must select
  `customer_phone` alongside the existing `id,customer_name_en`; the
  `backorders` query's join (`orders!backorders_source_order_id_fkey(...)`)
  must also select `customer_phone` alongside `customer_name_en`.
- **New: an "unmatched backorders" section on `ClaimsQueue.tsx`**, manager-
  only (this route is already manager-gated — no new role check needed).
  It is a **separate table below the existing claims table**, with its
  own heading — do not merge it into the claims table or its status
  filter, since a backorder with `reason: 'shortage'` has nothing to do
  with claims at all.
  - Read-only. No manual-match action, no mutation of any kind — this
    view only ever calls a new read function, never writes.
  - Shows every `backorders` row where `target_order_id is null`
    (regardless of `reason`), each with: source customer name, product
    name × qty, reason (`shortage` → "ของขาด", `claim_resend` → "ชดเชยจากเคลม",
    same Thai labels this codebase already uses elsewhere for these two
    reasons — check `PackOrder.tsx`'s "ของค้างส่งจากออเดอร์ก่อนหน้า" section
    and any other existing `reason` rendering for the exact established
    wording, don't invent new labels for values that already have one),
    and how many days it's been waiting (computed client-side from
    `created_at`).
  - Sorted **oldest first** (longest-waiting at the top — this is the
    whole point of the view, surfacing what's stalest).
  - A row's "days waiting" is **highlighted (red/warn styling, matching
    this codebase's existing `overdue`/red-highlight convention already
    used in this same `ClaimsQueue.tsx` file for claim deadlines)** when
    it has been unmatched for **more than 7 days**.
  - Empty state: a plain "ไม่มีรายการค้างส่งที่ยังจับคู่ไม่สำเร็จ" message,
    matching this file's existing empty-state style for the claims table.
- All existing tests must stay green.

## Task 1 (single batch)

### 1a. `koh-payam-delivery/src/lib/api/backorders.ts`

- `linkBackordersToDay`: read it in full first. Change its `orders` select
  to include `customer_phone`, and its `pend` select's nested join to
  include `customer_phone` alongside `customer_name_en`. Change the
  matching logic per Global Constraints (phone-first, name-fallback per
  row) — replace the current single `.find((o) => o.customer_name_en === cust)`
  with a two-step lookup (phone match attempt, then name match attempt if
  the phone attempt didn't apply or didn't find anything). Keep everything
  else in this function (the `target_ship_date` skip-if-already-tied-to-
  another-day check, the update call, the `linked` counter) unchanged.
- New `export async function listUnmatchedBackorders(): Promise<UnmatchedBackorderRow[]>`
  (define `UnmatchedBackorderRow` alongside the existing `BackorderRow`
  type at the top of this file) — selects
  `id,reason,product_name,qty,created_at,orders!backorders_source_order_id_fkey(customer_name_en)`
  from `backorders` where `target_order_id is null` (any `status`, any
  `reason` — a fulfilled-but-somehow-still-unmatched row would be a bug
  worth surfacing too, don't filter status), ordered by `created_at`
  ascending. Map to `{ id, customerName, productName, qty, reason,
  createdAt }` (flatten the joined `orders.customer_name_en` the same way
  `listClaims` already flattens its `orders(...)` join in `claims.ts` —
  match that established pattern). Throw this file's usual Thai-error
  convention on failure.
- Tests (`backorders.test.ts`): extend the matching tests for
  `linkBackordersToDay` — a phone match wins over an available but
  different name (proving phone is tried first), a name-fallback still
  works when the source order's phone is empty, and the existing
  behavior (name match when phone data doesn't apply) stays covered. Add
  coverage for `listUnmatchedBackorders`: returns only `target_order_id
  is null` rows in `created_at` ascending order, correctly flattens the
  joined customer name, and maps `reason` through unchanged.

### 1b. `koh-payam-delivery/src/routes/team/ClaimsQueue.tsx`

Read the whole file first (it already has the `overdue` red-highlight
convention on claim rows past `deadline_at`, and its own loading/failed/
empty-state handling for the claims table — mirror those same patterns
for the new section rather than inventing new ones).

- New state loading `listUnmatchedBackorders()` (from 1a) alongside the
  existing claims load — independent fetch, independent loading/failed
  state, so a failure loading one doesn't blank the other (mirror how
  `ClaimDetail.tsx` already keeps its own claim state and its independent
  evidence-photos fetch from stepping on each other, per that file's
  existing comment about exactly this).
- New section below the existing claims table: a heading (e.g. "ค้างส่งที่
  ยังจับคู่ไม่สำเร็จ") and a table with columns for customer name / สินค้า
  (product × qty) / ที่มา (reason, translated per Global Constraints) /
  ค้างมาแล้ว (days, computed from `createdAt` to now — reuse this file's
  existing date/`now` pattern already used for the `overdue` claims
  check) — highlight the row (same red/warn class already used for
  overdue claims in this file) when days waiting > 7.
  Sorted oldest-first is already guaranteed by 1a's ordering — do not
  re-sort client-side in a way that could disagree with it.
- Tests (`ClaimsQueue.test.tsx`): the new section renders every unmatched
  backorder row with the right customer/product/qty/reason-label; a row
  older than 7 days gets the highlight class and one that isn't does not;
  the empty state shows when there are zero unmatched rows; a failure
  loading unmatched backorders doesn't blank the existing claims table
  (and vice versa).

### 1c. Tests

Full list run at the end: `backorders.test.ts`, `ClaimsQueue.test.tsx`.
No migration, no edge function involved in this task.

Report: `.superpowers/sdd/2026-09-12-backorder-phone-match/task-1-report.md`.
