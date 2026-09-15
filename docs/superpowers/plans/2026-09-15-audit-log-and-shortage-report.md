# Plan — Audit log viewer + shortage report (both manager-only)

Spec: agreed in conversation 2026-09-15 via the grilling skill (3 rounds,
confirmed with "ยืนยันตามนี้" + a direct follow-up confirming manager-only
visibility for both).

Branch: `feature/audit-log-and-shortage-report` off `main`.

## Context

Two independent, unrelated-in-code but jointly-requested features. Each is
its own task below; do not let one leak into the other's files.

1. **Audit log viewer** (`audit_logs` table has existed since day one and is
   written from many places, but this app has never had a page to read it —
   confirmed by grep, `audit_logs` is only ever selected via `logAction`'s
   own insert, never queried elsewhere in `src/`). Manager-only, no
   filters/search in this version, reverse-chronological, last 30 days
   (matching the table's own existing cron retention — see
   `0006_cron_cleanup.sql`/`0007_hardening.sql`'s `purge_old_orders()`).
   Each row renders as a plain-Thai sentence per action type, not raw JSON.
2. **Shortage report**: ranks products by total quantity short over a
   manager-chosen date range, scoped **only** to Makro-side under-shipment
   (`order_items.status = 'short'`) — explicitly **not** customer-claimed
   shortages (`claims` of type `missing_in_box`/`damaged` are a different
   concept, already covered by the claims queue). Clicking a product row
   expands an accordion underneath showing which orders/customers it was
   short on.

Both are new manager-only NAV destinations (same visibility pattern as the
existing `/claims` and `/line-contacts` — `roles: ['manager']` in
`src/lib/roles.ts`'s `NAV` array, no RLS change needed anywhere: every
table both features read (`audit_logs`, `order_items`, `orders`, `claims`,
`ship_days`, `profiles`) already has a `team_read` policy gated on
`is_team_member()`, which every active manager satisfies).

Read `src/lib/roles.ts`, `src/lib/navAccentStyles.ts`,
`src/components/ui/PageHeader.tsx`, `src/lib/api/audit.ts`, and
`src/routes/team/LineContacts.tsx` (closest existing example of a simple
manager-only list page) in full before starting either task.

## Global Constraints

- Stack unchanged: Vite + React 18 + TS + Tailwind 3, Vitest, Supabase. No
  migration needed for either task — both are pure reads against existing
  tables/columns.
- New NAV entries in `src/lib/roles.ts` (same array, same shape as the 6
  existing entries — `path/label/roles/icon/accent`):
  - `{ path: '/audit-log', label: 'ประวัติการใช้งาน', roles: ['manager'], icon: ClockCounterClockwise, accent: 'slate' }`
  - `{ path: '/shortage-report', label: 'รายงานของขาด', roles: ['manager'], icon: ChartBar, accent: 'violet' }`
  Both icons from `@phosphor-icons/react` (already a dependency). Append
  after the existing 6 entries; do not reorder/modify any existing one.
- `tailwind.config.js`: add two new entries to the existing `accent` color
  group (alongside indigo/emerald/amber/teal/rose/line) —
  `slate: { DEFAULT: '#475569', soft: '#f1f5f9' }` and
  `violet: { DEFAULT: '#7c3aed', soft: '#f5f3ff' }`. Add the matching two
  keys to `NavAccent` (`src/lib/roles.ts`) and to `NAV_ACCENT_CLASSES`
  (`src/lib/navAccentStyles.ts`), following that file's exact existing
  per-key shape (`icon`/`chipBg`/`activeBg`/`activeText` class strings —
  literal strings, not template interpolation, per that file's own
  documented reason).
- Wire both routes in `src/App.tsx`, mirroring exactly how `/line-contacts`
  is already wired (`RequireRole` wrapper, same tree position among the
  other authenticated team routes).
- Both new pages use `PageHeader` with their new `icon`/`accent`, matching
  the convention every other top-level NAV page already follows (see
  `ClaimsQueue.tsx`/`LineContacts.tsx`).
- All existing tests must stay green.

## Task 1: Audit log viewer

### 1a. `src/lib/api/auditLogs.ts` (+ `.test.ts`)

New file. Export a formatted, ready-to-render row type and one function:

```ts
export type AuditLogRow = { id: number; createdAt: string; message: string }
export async function listAuditLogs(): Promise<AuditLogRow[]>
```

**Query shape**: select `id, user_id, action, entity_type, entity_id, meta,
created_at` from `audit_logs`, `.order('created_at', {ascending: false})`,
no date filter needed (the table's own cron already purges rows older
than 30 days — do not re-filter client-side, that would just be redundant
work; if you want a defensive cap against an unexpectedly large result,
`.limit(1000)` is enough headroom, not a real pagination UI). Thai error
on failure, this file's convention (see `lineContacts.ts` for the
established phrasing style): `'โหลดประวัติการใช้งานไม่สำเร็จ: ' + error.message`.

**Entity resolution (batched, not N+1)**: after the first query, collect
the distinct ids needed per `entity_type` and issue one batched follow-up
query per table actually referenced in this page of rows (skip a query
entirely if no row needs it):
- `entity_type = 'order'` → `orders` rows by `id in (...)`, columns
  `id, makro_order_no, ship_day_id` (the `ship_day_id` is needed only for
  `boat_set` rows — see below; harmless to always select it).
- `entity_type = 'claim'` → `claims` rows by `id in (...)`, joined to
  `orders(makro_order_no)` (`.select('id, orders(makro_order_no)')`) — a
  claim's own row has no order number itself, only `order_id`.
- `entity_type = 'ship_day'` → not actually needed as a lookup: the
  `import` action's own `meta.shipDate` already carries the date directly
  (see the template table below) — do not add a `ship_days` query for this
  action; only add one if `boat_set` rows are present (see next bullet).
- `boat_set` rows specifically need `ship_days.boats` (a `jsonb` array of
  `{id,name}`) to turn `meta.boatId` into a real boat name: after
  resolving the `order` row's `ship_day_id` for any `boat_set` row, batch-
  fetch `ship_days` by those `ship_day_id`s (`select('id, boats')`), then
  find the `{id: meta.boatId}` entry in that ship day's `boats` array. If
  not found (boat later renamed/removed, or the lookup fails for any
  reason), fall back to `` `เรือ #${meta.boatId}` `` — never let a missing
  boat name break the whole row.
- `entity_type = 'line_contact'` → no lookup needed at all, `entity_id`
  IS the phone number already (see `register-line-contact`/`lineContacts.ts`
  — phone is the natural key for that table).
- `user_id` (present on every row except the 3 customer-initiated actions
  below, which always write `user_id: null`) → batch-fetch `profiles` by
  the distinct non-null ids present (`select('id, name')`), for the "who
  did it" part of each sentence.

Every lookup is best-effort per row: if a specific order/claim/profile
somehow isn't found (deleted since, e.g. `order_deleted` — though that
action's own `meta` already carries everything needed and shouldn't
attempt an order lookup at all, see its row in the table below), fall back
to a generic phrase rather than throwing or blanking the whole list — one
bad row must never break the page.

**The exact 14 actions this app currently writes, and their template**
(verified live against every `logAction(...)`/raw `audit_logs.insert`
call site in `src/` and `supabase/functions/` — this is not a guess, it is
the complete current set; if a 15th ever appears, add
`` `${action} (${entityType})` `` as an honest fallback rather than
crashing, but every existing call site must produce a real Thai sentence,
not the fallback):

| `action` | `entity_type` | `user_id` | `meta` shape | Template (`{name}` = resolved profiles.name when `user_id` is set, omit the "โดย {name}" clause entirely when `user_id` is null) |
|---|---|---|---|---|
| `import` | `ship_day` | set | `{shipDate, created, synced}` | `นำเข้าออเดอร์วันที่ {shipDate} — ใหม่ {created} รายการ · sync {synced} รายการ โดย {name}` |
| `status_change` | `order` | set | `{from, to}` | `เปลี่ยนสถานะออเดอร์ {makro_order_no} จาก "{fromLabel}" → "{toLabel}" โดย {name}` — from/to labels: reuse the exact 4 strings from `StatusBadge.tsx`'s `LABEL` map (`imported`→นำเข้าแล้ว, `packed`→แพ็คเสร็จ, `at_pier`→ถึงท่าเรือ, `shipped`→ส่งแล้ว) |
| `boat_set` | `order` | set | `{boatId}` | `เลือก{boatName}ให้ออเดอร์ {makro_order_no} โดย {name}` (boatName resolution above; if resolved to a real name prefix it naturally, e.g. "เลือกเรือ 1 ให้..." — the `boats` array's own `name` field already reads like "เรือ 1", don't double up "เรือ") |
| `pier_name_set` | `order` | set | `{pierName}` | `บันทึกชื่อคนลงเรือ "{pierName}" ให้ออเดอร์ {makro_order_no} โดย {name}` |
| `regen_link` | `order` | set | none | `สร้างลิงก์ลูกค้าใหม่ให้ออเดอร์ {makro_order_no} โดย {name}` |
| `order_deleted` | `order` | set | `{makroOrderNo, customerNameEn, status, shipDate}` (**note**: camelCase keys, not snake_case — this meta shape predates the others; the order row no longer exists, do not attempt to look it up, use only these meta fields) | `ลบออเดอร์ {makroOrderNo} ({customerNameEn}) ถาวร — กำหนดส่ง {shipDate} โดย {name}` |
| `pack_saved` | `order` | set | `{paperCount, foamCount, pieceCount, packerName}` | `บันทึกแพ็คออเดอร์ {makro_order_no} — ลังกระดาษ {paperCount} · ลังโฟม {foamCount} · ชิ้น {pieceCount} โดย {name}` |
| `claim_submitted` | `claim` | **null** | `{orderId}` | `ลูกค้ายื่นเคลม — ออเดอร์ {makro_order_no}` (no "โดย" clause — customer-initiated; resolve the order number via the `claims`→`orders` join, not `meta.orderId` directly, since the claim row itself is the entity to look up) |
| `claim_resolved` | `claim` | set | `{decision, resolution?, resendBackorderFailed?}` | `หัวหน้า{decisionLabel}เคลม — ออเดอร์ {makro_order_no}{resolutionClause} โดย {name}` — decisionLabel: `approved`→"อนุมัติ", `rejected`→"ปฏิเสธ"; resolutionClause only when `decision==='approved'`: ` (${resolutionLabel})` where `refund`→"คืนเงิน", `resend_next_day`→"ส่งชดเชยวันถัดไป" (exact strings, reuse from `ClaimDetail.tsx`); if `resendBackorderFailed` is true, append ` ⚠️ สร้างรายการส่งชดเชยไม่สำเร็จ` |
| `claim_auto_closed` | `claim` | **null** | `{trigger: 'resend_fulfilled'}` | `ปิดงานเคลมอัตโนมัติ — ออเดอร์ {makro_order_no} (ของชดเชยส่งถึงลูกค้าแล้ว)` (no "โดย" clause — system-triggered, matches the feature's own design: this action always has `user_id: null`, see `backorders.ts`) |
| `line_contact_registered` | `line_contact` | **null** | `{replacedExisting}` | `replacedExisting` true → `เบอร์ {entity_id} อัปเดตชื่อ LINE (บัญชีเดิม)`; false → `เบอร์ {entity_id} ลงทะเบียนผูก LINE ครั้งแรก` (no "โดย" — customer-initiated) |
| `line_contact_pending_created` | `line_contact` | **null** | `{oldLineUserId}` | `เบอร์ {entity_id} มีคำขอผูก LINE บัญชีใหม่ รอหัวหน้าตรวจสอบ` (no "โดย") |
| `line_contact_approved` | `line_contact` | set | `{oldLineUserId, newLineUserId}` | `หัวหน้าอนุมัติคำขอเปลี่ยน LINE ของเบอร์ {entity_id} โดย {name}` |
| `line_contact_rejected` | `line_contact` | set | `{oldLineUserId, newLineUserId}` | `หัวหน้าปฏิเสธคำขอเปลี่ยน LINE ของเบอร์ {entity_id} โดย {name}` |

If a `user_id` is set but the corresponding `profiles` row can't be
resolved (deleted account), fall back to `"ทีมงาน"` rather than omitting
the clause or showing a raw id.

Tests: one test per action row in the table above (14 total — a real
Postgres row shape in, the exact expected Thai sentence out), plus: the
batched-lookup queries fire once each (not once per row) for a page with
multiple rows sharing the same order/claim, a `boat_set` row correctly
resolves a real boat name from a stubbed `ship_days.boats` array and
falls back to `` `เรือ #{id}` `` when not found, a missing `profiles` row
falls back to `"ทีมงาน"`, and the `.order('created_at', {ascending:
false})` call shape.

### 1b. `src/routes/team/AuditLog.tsx` (+ `.test.tsx`)

Per Global Constraints (`icon={ClockCounterClockwise}`, `accent="slate"`,
`PageHeader title="ประวัติการใช้งาน"`). Read `LineContacts.tsx` first for
this codebase's established loading/failed/empty-state conventions
(`Spinner`/`alert alert-danger`/`muted`) and match them exactly — this
page is simpler (one list, no filters, no search box, no actions). Each
row: `formatDateTimeTH(createdAt)` + the message string, in a `data-table`
or a simple `card`-per-row list (your call — check which reads better
given messages vary a lot in length; a `data-table` with two columns
`เวลา`/`เหตุการณ์` is the more likely fit given this codebase's existing
list-page precedent). Empty state: `"ยังไม่มีประวัติการใช้งาน"`.

Tests: renders every row's message + formatted time; empty state; failed
state on a load error.

Report: `.superpowers/sdd/2026-09-15-audit-log-and-shortage-report/task-1-report.md`.

## Task 2: Shortage report

### 2a. `src/lib/api/shortageReport.ts` (+ `.test.ts`)

New file.

```ts
export type ShortageDetailRow = {
  orderId: string
  makroOrderNo: string
  customerNameEn: string
  shipDate: string
  qty: number
}
export type ShortageProductRow = {
  productName: string
  totalQty: number
  orderCount: number
  details: ShortageDetailRow[]
}
export async function getShortageReport(fromDate: string, toDate: string): Promise<ShortageProductRow[]>
```

**Query**: `order_items` joined to `orders` — `.select('product_name,
qty_ordered, qty_shipped, shortage_qty, order_id,
orders(makro_order_no,customer_name_en,ship_date)')`, filtered
`.eq('status', 'short')` and `orders.ship_date` between `fromDate`/`toDate`
inclusive (Supabase nested-table date filtering isn't directly
expressible in one `.select()` chain the way a plain column is — check
whether this needs `.gte()`/`.lte()` on a joined column via PostgREST's
dot-notation filter e.g. `.gte('orders.ship_date', fromDate)`, or whether
it's simpler/more reliable to filter client-side after the fetch since
this table is small; prefer server-side filtering if PostgREST supports
it cleanly for this join shape, fall back to client-side filtering with a
comment explaining why if not — either is acceptable, but don't silently
fetch unbounded history when a manager picks a narrow range).

**Per-row quantity**: mirror `syncShortageBackorders`'s existing fallback
exactly (`src/lib/api/backorders.ts`) — `shortage = Number(shortage_qty)
|| 0; qty = shortage > 0 ? shortage : Math.max(0, Number(qty_ordered) -
Number(qty_shipped))`. Do not invent a different formula; this one is
already proven correct and matches what the rest of the app already shows
as "ของขาด" elsewhere.

**Aggregation**: group by `product_name`. `totalQty` = sum of each row's
resolved qty. `orderCount` = count of **distinct** `order_id` for that
product (a product could in principle appear twice on the same order's
`order_items` — count the order once, not twice, though this is an edge
case unlikely to occur since `product_name` should be unique per order in
practice; be correct anyway). `details` = one entry per contributing
order (`orderId`, `makroOrderNo`, `customerNameEn`, `shipDate`, that
order's own qty for this product). Sort the top-level array by `totalQty`
descending; sort each product's `details` array by `shipDate` ascending
(oldest first, so the accordion reads like a timeline).

Thai error on failure: `'โหลดรายงานของขาดไม่สำเร็จ: ' + error.message`.

Tests: the aggregation logic is the important thing to verify — build a
fixture with 2 products across several orders (including one product
appearing via two different orders on two different dates, and one order
contributing to two different products) and assert the exact grouped/
sorted/summed output; the qty fallback formula (both branches: real
`shortage_qty` present, and the `qty_ordered - qty_shipped` fallback when
it's 0/absent); a row with `product_name` matching but from an order
outside the date range is excluded; empty result when nothing matches;
Thai error on a query failure.

### 2b. `src/routes/team/ShortageReport.tsx` (+ `.test.tsx`)

Per Global Constraints (`icon={ChartBar}`, `accent="violet"`, `PageHeader
title="รายงานของขาด"`). Two `type="date"` inputs (`จาก`/`ถึง`, mirror the
existing single-date-input pattern already used in `DailyDashboard.tsx`/
`BoatSetup.tsx` for the `<input type="date">` element itself, but this
page needs two) defaulting to a sensible range — the plan leaves the
exact default to you (e.g. last 30 days, matching the audit log's own
retention window, is a reasonable default so the page isn't empty on
first load) — re-fetches `getShortageReport` whenever either date
changes. Ranked list, each row: product name + `totalQty` + `orderCount`
("ขาดจาก N ออเดอร์"). Clicking a row toggles an inline accordion
underneath (no navigation, no modal) showing that product's `details`
array as a small table (order number as a `Link` to `/order/{orderId}`,
customer name, ship date via `formatDateTH`, that order's qty). Empty
state when the range has zero shortages: `"ไม่มีของขาดในช่วงที่เลือก"`.

Tests: renders the ranked list in the right order; clicking a row expands
its accordion with the right order-level rows and a working link; a
second click collapses it again; changing either date input re-fetches
with the new range; empty state; failed state.

Report: `.superpowers/sdd/2026-09-15-audit-log-and-shortage-report/task-2-report.md`.

## After both tasks: controller steps

- No migration to apply, no edge function to redeploy — pure client-side
  reads against existing tables. A quick live sanity check after merge is
  still worthwhile: open both new pages against production data and
  confirm the audit log shows real recent entries with correct Thai
  sentences (spot-check a few different action types), and the shortage
  report shows a sensible ranking for a date range known to contain real
  shortages.
- Update `docs/user-guide-th.md` with two new sections describing both
  pages (manager-only, where to find them, what they show).
- Merge to `main` with `--no-ff`, verify tests+build on merged main, delete
  the branch, clean the SDD workspace, commit the docs update, push only
  on explicit instruction.
