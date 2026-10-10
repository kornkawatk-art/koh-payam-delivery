# Foam box tracking — design

Date: 2026-10-10 · Status: approved in conversation (grill-me), awaiting spec review

## Problem

Fresh food goes out in the shop's foam boxes (ลังโฟม). Customers keep them,
so the shop runs short. The team needs to know how many boxes each customer
is holding, so the boxes can be asked back.

**Success:** for every customer the team can see an outstanding count it
trusts, and customers are reminded on the page they already open.

**Out of scope (this round):** deposit money (มัดจำ), LINE reminder text,
a menu badge.

## Decisions

| # | Decision |
|---|---|
| Scope | Count boxes only — no money. |
| Who records returns | Pier staff on the mainland when the boat brings empties back, on a new page. |
| Opening balances | Start at 0; a manager can **set** a customer's balance ("holds N now"). |
| Customer sees | A box on the order link page when the balance is above 0. |
| Roles | Pier + manager record returns; only managers set a balance. |
| Data approach | A: store only returns and set-balance; "sent" is derived from orders. |
| Q1 | One "ตั้งยอด" command covers both the opening balance and corrections. |
| Q2 | Returning more than is outstanding floors the balance at 0 — no credit; the app warns first. |
| Q3 | No delete; a mistake is corrected with a new "ตั้งยอด". |
| Q4 | "Sent" counts from the go-live date (the migration's run date). |
| Q5 | The page lists customers with a balance by default (most first), searchable, with a "show all" toggle; a row shows balance, last sent date, รับคืน, ตั้งยอด (manager); the name opens history. |
| Q6 | Pier pages (single + group) show "ลูกค้ารายนี้ค้างลังโฟม N ใบ — ฝากคนเรือทวงคืน", read-only. |
| Q7 | Customer page: TH "คุณมีลังโฟมของร้านค้างอยู่ N ใบ กรุณาคืนกับเรือ" / EN "You have N of our foam boxes — please return them with the boat"; hidden at 0. |
| Q8 | No menu count. |

## Customer identity

The same key as box-sticker short names: `customerKey` in
`src/lib/api/customerAliases.ts` — `phone:<digits>|name:<NAME>` (or
`name:<NAME>` without a phone). One owner's separate shops count separately.

## Data

New table `public.foam_box_moves`:

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| customer_key | text not null | as above |
| customer_name | text not null | display name at the time |
| kind | text not null | `'return'` or `'set'` |
| qty | int not null | `> 0` for return, `>= 0` for set |
| note | text | optional |
| created_by | uuid → profiles | |
| created_at | timestamptz default now() | event time |

Index on `(customer_key, created_at)`.

Tracking start: a new single-row table `public.app_settings`
(`id boolean primary key default true check (id)`, `foam_tracking_start
timestamptz not null`), inserted by the migration with `now()`. Readable by
team members; no client writes.

RLS:
- select: `is_team_member()`
- insert `return`: active profile with role `pier` or `manager`
- insert `set`: `is_manager()`
- no update / delete policies

Audit log actions: `foam_return`, `foam_set` (Thai messages in `auditLogs.ts`).

## Calculation (one pure function, shared)

`supabase/functions/_shared/foamBalance.ts` (no imports, like `eggs.ts`), used by
the team app and by `order-view`:

Events for one customer, sorted by time:
- **sent**: each order with `status = 'shipped'`, `shipped_at >= foam_tracking_start`,
  `foam_box_count > 0` → `+foam_box_count` at `shipped_at`
- **return** → `balance = max(0, balance - qty)`
- **set** → `balance = qty`

Returns the balance and the last sent date.

Example: sent 3 → return 5 (0, not −2) → sent 2 → **2**.

## Screens

1. **`/foam` "ลังโฟม"** (menu; roles pier + manager): as Q5. "รับคืน" opens a
   quantity input (warns if more than outstanding); "ตั้งยอด" (manager) a
   quantity + optional note. History: every sent / return / set with who and when.
   Loads all shipped orders since the start (paged via `fetchAll`) + all moves.
2. **Pier pages** (`PierLoad`, `PierGroup`): the read-only line from Q6 when the
   balance is above 0.
3. **Customer page** (`CustomerOrderView` via `order-view`): the box from Q7.
   `order-view` returns `foamBoxesOutstanding: number` for the order's customer.

## Rollout

1. Migration (table, settings row, RLS) — run on "รันได้".
2. Push.
3. Deploy `order-view`.

Before the migration runs, the app must not break: the new page and pier line
fail soft (no balance shown) if the table is missing.

## Testing

- Pure balance function: ordering, floor at 0, set, start-date cutoff.
- API: query shapes; returns/sets write the right rows and audit entries.
- Page: list filters/sorting, return warning, set hidden for pier role.
- Pier line and customer box shown only above 0.
