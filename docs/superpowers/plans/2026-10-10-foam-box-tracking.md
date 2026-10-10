# Foam Box Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track how many of the shop's foam boxes each customer is holding, record returns at the pier, and remind customers on their order page.

**Architecture:** A new `foam_box_moves` table stores only what the team types (returns, set-balance). "Sent" is derived from shipped orders' `foam_box_count` since a tracking-start timestamp in a new one-row `app_settings` table. One pure function (`supabase/functions/_shared/foamBalance.ts`, dependency-free like `eggs.ts`) turns a customer's events into a balance and is used by both the team app (Vite) and the `order-view` edge function (Deno). The customer key moves into `_shared/customerKey.ts` so both sides group customers identically.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind 3, Vitest + Testing Library (jsdom), Supabase (Postgres + RLS + PostgREST, Deno edge functions).

**Spec:** `docs/superpowers/specs/2026-10-10-foam-box-tracking-design.md`

All paths below are relative to `koh-payam-delivery/` unless they start with `docs/`.
Run commands from `koh-payam-delivery/`. Tests: `npx vitest run <file>`; types: `npx tsc --noEmit -p .`.

## Global Constraints

- Count boxes only — no money, no LINE text, no menu count.
- Customer key = `phone:<digits>|name:<NAME>` or `name:<NAME>` (NAME = trimmed, whitespace collapsed, upper-cased) — identical on both sides.
- Balance: events sorted by time; sent `+qty`; return `max(0, balance - qty)`; set `= qty`.
- "Sent" = orders with `status = 'shipped'`, `shipped_at >= foam_tracking_start`, `foam_box_count > 0`, at `shipped_at`.
- Roles: pier + manager record returns; only managers set; enforced by RLS, not only hidden buttons.
- No update/delete of moves; a mistake is fixed with a new set.
- Every return/set writes an audit log (`foam_return`, `foam_set`).
- Team UI copy is Thai. Customer copy is TH + EN, exactly: TH `คุณมีลังโฟมของร้านค้างอยู่ {n} ใบ กรุณาคืนกับเรือ` / EN `You have {n} of our foam boxes — please return them with the boat`.
- Pier line exactly: `ลูกค้ารายนี้ค้างลังโฟม {n} ใบ — ฝากคนเรือทวงคืน`.
- Before the migration runs nothing may break: the page, pier line and customer box fail soft.
- Use `fetchAll` (`src/lib/api/fetchAll.ts`) for any read that can pass 1000 rows.

## Review Focus

1. Same timestamp for a ship and a return/set → order must be deterministic: at equal time, `sent` applies before `return`/`set` (a box can't be returned before it left). Test in Task 1.
2. A customer whose phone is formatted differently across orders ("082-628 9533" vs "0826289533") must be one customer. Test in Task 1 (customerKey) and Task 3 (grouping).
3. An order shipped before the tracking start must not count. Test in Task 1.
4. Pier staff must not be able to "set" even by calling the API directly. Covered by RLS in Task 2; UI hides the button (Task 4 test).
5. Tables missing (migration not yet run) → page shows a Thai "not enabled" message, pier line and customer box show nothing. Tests in Tasks 3, 4, 5, 6.

---

### Task 1: Shared customer key + balance function

**Files:**
- Create: `supabase/functions/_shared/customerKey.ts`
- Create: `supabase/functions/_shared/foamBalance.ts`
- Create: `supabase/functions/_shared/foamBalance.test.ts`
- Modify: `src/lib/groupOrders.ts` (re-export `normCustomerName`)
- Modify: `src/lib/api/customerAliases.ts` (re-export `customerKey`)

**Interfaces:**
- Produces:
  - `normCustomerName(name: string | null | undefined): string`
  - `customerKey(o: { customer_phone?: string | null; customer_name_en?: string | null }): string`
  - `type FoamEvent = { at: string; kind: 'sent' | 'return' | 'set'; qty: number; label?: string }`
  - `sentEvents(orders: FoamOrder[], start: string): FoamEvent[]` where `type FoamOrder = { status: string; shipped_at: string | null; foam_box_count: number | null; makro_order_no?: string }`
  - `foamBalance(events: FoamEvent[]): { balance: number; lastSentAt: string | null }`
  - `sortFoamEvents(events: FoamEvent[]): FoamEvent[]`

- [ ] **Step 1: Write the failing test** — `supabase/functions/_shared/foamBalance.test.ts`

```ts
import { customerKey, normCustomerName } from './customerKey'
import { foamBalance, sentEvents, sortFoamEvents, type FoamEvent } from './foamBalance'

test('customerKey: digits-only phone + normalized name; formatting differences are one customer', () => {
  expect(customerKey({ customer_phone: '082-628 9533', customer_name_en: ' jj   payam ' })).toBe(
    'phone:0826289533|name:JJ PAYAM',
  )
  expect(customerKey({ customer_phone: '0826289533', customer_name_en: 'JJ Payam' })).toBe(
    'phone:0826289533|name:JJ PAYAM',
  )
  expect(customerKey({ customer_phone: null, customer_name_en: 'Sunset' })).toBe('name:SUNSET')
  expect(normCustomerName('  a   b ')).toBe('A B')
})

const ev = (at: string, kind: FoamEvent['kind'], qty: number): FoamEvent => ({ at, kind, qty })

test('sent adds, return subtracts but never below 0, set replaces', () => {
  expect(
    foamBalance([
      ev('2026-10-10T01:00:00Z', 'sent', 3),
      ev('2026-10-11T01:00:00Z', 'return', 5),
      ev('2026-10-12T01:00:00Z', 'sent', 2),
    ]).balance,
  ).toBe(2)
  expect(
    foamBalance([ev('2026-10-10T01:00:00Z', 'sent', 3), ev('2026-10-11T01:00:00Z', 'set', 7)]).balance,
  ).toBe(7)
})

test('events are applied in time order, not array order; at the same instant sent comes first', () => {
  expect(
    foamBalance([ev('2026-10-12T00:00:00Z', 'return', 1), ev('2026-10-10T00:00:00Z', 'sent', 4)]).balance,
  ).toBe(3)
  // a return logged at the very instant of a ship still finds the box out
  expect(
    foamBalance([ev('2026-10-10T00:00:00Z', 'return', 2), ev('2026-10-10T00:00:00Z', 'sent', 2)]).balance,
  ).toBe(0)
  expect(
    sortFoamEvents([ev('2026-10-10T00:00:00Z', 'set', 1), ev('2026-10-10T00:00:00Z', 'sent', 2)]).map(
      (e) => e.kind,
    ),
  ).toEqual(['sent', 'set'])
})

test('lastSentAt is the latest ship; null with no ships', () => {
  expect(
    foamBalance([ev('2026-10-10T00:00:00Z', 'sent', 1), ev('2026-10-12T00:00:00Z', 'sent', 1)]).lastSentAt,
  ).toBe('2026-10-12T00:00:00Z')
  expect(foamBalance([ev('2026-10-10T00:00:00Z', 'set', 2)]).lastSentAt).toBeNull()
})

test('sentEvents: only shipped orders with foam boxes, shipped at/after the tracking start', () => {
  const start = '2026-10-10T00:00:00Z'
  expect(
    sentEvents(
      [
        { status: 'shipped', shipped_at: '2026-10-09T23:59:59Z', foam_box_count: 2 }, // before start
        { status: 'shipped', shipped_at: '2026-10-10T00:00:00Z', foam_box_count: 3, makro_order_no: 'PO-1' },
        { status: 'at_pier', shipped_at: null, foam_box_count: 4 }, // not shipped yet
        { status: 'shipped', shipped_at: '2026-10-11T00:00:00Z', foam_box_count: 0 }, // no foam
      ],
      start,
    ),
  ).toEqual([{ at: '2026-10-10T00:00:00Z', kind: 'sent', qty: 3, label: 'PO-1' }])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/foamBalance.test.ts`
Expected: FAIL — cannot resolve `./customerKey` / `./foamBalance`.

- [ ] **Step 3: Implement** — `supabase/functions/_shared/customerKey.ts`

```ts
// How the app tells customers apart: one owner (one phone) can run several
// shops, each its own Makro account name -- so phone AND name. Phone is
// digits only ("082-628 9533" == "0826289533"); name trimmed, runs of
// whitespace collapsed, upper-cased. No phone: name alone. Dependency-free:
// shared by the team app (Vite) and edge functions (Deno). Must match the SQL
// normalization in 0025_customer_per_shop.sql.

export const normCustomerName = (name: string | null | undefined) =>
  (name ?? '').trim().replace(/\s+/g, ' ').toUpperCase()

export function customerKey(o: {
  customer_phone?: string | null
  customer_name_en?: string | null
}): string {
  const digits = (o.customer_phone ?? '').replace(/\D/g, '')
  const name = normCustomerName(o.customer_name_en)
  return digits ? `phone:${digits}|name:${name}` : `name:${name}`
}
```

`supabase/functions/_shared/foamBalance.ts`

```ts
// How many of the shop's foam boxes a customer is holding (feature/foam-boxes).
// Dependency-free: shared by the team app and the order-view edge function so
// both show the same number.
//
// Events in time order: a ship adds its foam boxes; a return subtracts but the
// balance never goes below 0 (an over-return is old boxes, not credit); a set
// makes the balance exactly that number (opening balance or correction).

export type FoamEvent = { at: string; kind: 'sent' | 'return' | 'set'; qty: number; label?: string }

export type FoamOrder = {
  status: string
  shipped_at: string | null
  foam_box_count: number | null
  makro_order_no?: string
}

// At the same instant a ship is applied first -- a box can't come back before it left.
const RANK: Record<FoamEvent['kind'], number> = { sent: 0, return: 1, set: 2 }

export function sortFoamEvents(events: FoamEvent[]): FoamEvent[] {
  return [...events].sort(
    (a, b) => Date.parse(a.at) - Date.parse(b.at) || RANK[a.kind] - RANK[b.kind],
  )
}

/** Ships that count: shipped, with foam boxes, at or after the tracking start. */
export function sentEvents(orders: FoamOrder[], start: string): FoamEvent[] {
  const from = Date.parse(start)
  const out: FoamEvent[] = []
  for (const o of orders) {
    const n = Number(o.foam_box_count) || 0
    if (o.status !== 'shipped' || !o.shipped_at || n <= 0) continue
    if (Date.parse(o.shipped_at) < from) continue
    out.push({ at: o.shipped_at, kind: 'sent', qty: n, ...(o.makro_order_no ? { label: o.makro_order_no } : {}) })
  }
  return out
}

export function foamBalance(events: FoamEvent[]): { balance: number; lastSentAt: string | null } {
  let balance = 0
  let lastSentAt: string | null = null
  for (const e of sortFoamEvents(events)) {
    if (e.kind === 'sent') {
      balance += e.qty
      lastSentAt = e.at
    } else if (e.kind === 'return') balance = Math.max(0, balance - e.qty)
    else balance = e.qty
  }
  return { balance, lastSentAt }
}
```

In `src/lib/groupOrders.ts` replace the `normCustomerName` definition (the `export const normCustomerName = ...` two lines, keep its doc comment) with:

```ts
export { normCustomerName } from '../../supabase/functions/_shared/customerKey'
```

and if `groupOrders.ts` itself calls `normCustomerName`, also add `import { normCustomerName } from '../../supabase/functions/_shared/customerKey'` at the top.

In `src/lib/api/customerAliases.ts` replace the `customerKey` function body (lines `export function customerKey(o: CustomerRef): string { ... }`) with:

```ts
export { customerKey } from '../../../supabase/functions/_shared/customerKey'
```

and add `import { customerKey } from '../../../supabase/functions/_shared/customerKey'` (the file uses it internally). Remove the now-unused `normCustomerName` import if `tsc` reports it.

- [ ] **Step 4: Run tests**

Run: `npx vitest run supabase/functions/_shared/foamBalance.test.ts src/lib/api/customerAliases.test.ts src/lib/groupOrders.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/customerKey.ts supabase/functions/_shared/foamBalance.ts supabase/functions/_shared/foamBalance.test.ts src/lib/groupOrders.ts src/lib/api/customerAliases.ts
git commit -m "feat: shared customer key and foam box balance function"
```

---

### Task 2: Migration

**Files:**
- Create: `supabase/migrations/0031_foam_box_moves.sql`

**Interfaces:**
- Produces: table `public.app_settings (id boolean pk, foam_tracking_start timestamptz)`; table `public.foam_box_moves (id, customer_key, customer_name, kind, qty, note, created_by, created_at)`.

- [ ] **Step 1: Write the migration**

```sql
-- 0031_foam_box_moves.sql
-- Foam box tracking (feature/foam-boxes, spec 2026-10-10). Only what the team
-- types is stored here -- returns and set-balance; boxes SENT come from
-- shipped orders' foam_box_count since app_settings.foam_tracking_start.

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  foam_tracking_start timestamptz not null
);
insert into public.app_settings (foam_tracking_start) values (now())
  on conflict (id) do nothing;
alter table public.app_settings enable row level security;
drop policy if exists team_read on public.app_settings;
create policy team_read on public.app_settings
  for select to authenticated using (public.is_team_member());

create table if not exists public.foam_box_moves (
  id uuid primary key default gen_random_uuid(),
  customer_key text not null,
  customer_name text not null,
  kind text not null check (kind in ('return', 'set')),
  qty integer not null check ((kind = 'return' and qty > 0) or (kind = 'set' and qty >= 0)),
  note text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists foam_box_moves_customer_idx
  on public.foam_box_moves (customer_key, created_at);
alter table public.foam_box_moves enable row level security;

drop policy if exists team_read on public.foam_box_moves;
create policy team_read on public.foam_box_moves
  for select to authenticated using (public.is_team_member());

-- Returns: pier staff and managers. Set-balance: managers only. Rows are
-- written as the caller (created_by = auth.uid()). No update/delete policy:
-- a mistake is fixed with a new set.
drop policy if exists foam_return_insert on public.foam_box_moves;
create policy foam_return_insert on public.foam_box_moves
  for insert to authenticated
  with check (
    kind = 'return'
    and created_by = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_active and role in ('pier', 'manager')
    )
  );
drop policy if exists foam_set_insert on public.foam_box_moves;
create policy foam_set_insert on public.foam_box_moves
  for insert to authenticated
  with check (kind = 'set' and created_by = auth.uid() and public.is_manager());
```

- [ ] **Step 2: Sanity-check the SQL text** (no local Postgres in this repo)

Run: `grep -c "create policy" supabase/migrations/0031_foam_box_moves.sql`
Expected: `4`

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0031_foam_box_moves.sql
git commit -m "feat: foam_box_moves + app_settings tables with RLS (0031)"
```

(Production run happens later, only after the user says "รันได้".)

---

### Task 3: Team API

**Files:**
- Create: `src/lib/api/foamBoxes.ts`
- Create: `src/lib/api/foamBoxes.test.ts`
- Modify: `src/lib/api/auditLogs.ts` (two `case`s)
- Modify: `src/lib/api/auditLogs.test.ts` (one test)

**Interfaces:**
- Consumes: `customerKey`, `foamBalance`, `sentEvents`, `sortFoamEvents`, `FoamEvent` (Task 1); `fetchAll` (`src/lib/api/fetchAll.ts`); `logAction(action, entityType, entityId, meta)` (`src/lib/api/audit.ts`); `CustomerRef` (`src/lib/api/customerAliases.ts`).
- Produces:
  - `type FoamCustomer = { key: string; name: string; phone: string | null; balance: number; lastSentAt: string | null; events: FoamEvent[] }` (events sorted oldest first; return/set events carry `label` = note)
  - `getFoamTrackingStart(): Promise<string | null>` — null when not enabled / unreadable
  - `listFoamCustomers(): Promise<FoamCustomer[] | null>` — null = not enabled; sorted by balance desc then name
  - `getCustomerFoamBalance(ref: CustomerRef): Promise<number>` — 0 on any failure
  - `recordFoamReturn(c: { key: string; name: string }, qty: number, note?: string): Promise<void>`
  - `setFoamBalance(c: { key: string; name: string }, qty: number, note?: string): Promise<void>`

- [ ] **Step 1: Write the failing test** — `src/lib/api/foamBoxes.test.ts`

```ts
import {
  getCustomerFoamBalance,
  getFoamTrackingStart,
  listFoamCustomers,
  recordFoamReturn,
  setFoamBalance,
} from './foamBoxes'

const logAction = vi.fn().mockResolvedValue(undefined)
vi.mock('./audit', () => ({ logAction: (...a: unknown[]) => logAction(...a) }))

// Table-backed stand-in for supabase-js: filters eq/gte/not are applied,
// range() slices, maybeSingle() returns the first row, insert() records.
const db: Record<string, any[]> = {}
let missing = new Set<string>()
const inserts: { table: string; row: any }[] = []
vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      let rows = () => db[table] ?? []
      const filters: ((r: any) => boolean)[] = []
      const result = () =>
        missing.has(table)
          ? { data: null, error: { message: 'relation does not exist' } }
          : { data: rows().filter((r) => filters.every((f) => f(r))), error: null }
      const b: any = {
        select: () => b,
        eq: (c: string, v: any) => (filters.push((r) => r[c] === v), b),
        gte: (c: string, v: any) => (filters.push((r) => r[c] >= v), b),
        order: () => b,
        range: (lo: number, hi: number) => {
          const r = result()
          return Promise.resolve(r.data ? { ...r, data: r.data.slice(lo, hi + 1) } : r)
        },
        maybeSingle: () => {
          const r = result()
          return Promise.resolve(r.data ? { data: r.data[0] ?? null, error: null } : r)
        },
        insert: (row: any) => {
          inserts.push({ table, row })
          return Promise.resolve({ error: missing.has(table) ? { message: 'denied' } : null })
        },
        then: (res: any, rej: any) => Promise.resolve(result()).then(res, rej),
      }
      return b
    },
  },
}))

const START = '2026-10-10T00:00:00+00:00'
const order = (o: Partial<any>) => ({
  id: 'o',
  makro_order_no: 'PO',
  customer_name_en: 'JJ Payam',
  customer_phone: '0826289533',
  status: 'shipped',
  shipped_at: '2026-10-11T00:00:00+00:00',
  foam_box_count: 2,
  ...o,
})

beforeEach(() => {
  for (const k of Object.keys(db)) delete db[k]
  missing = new Set()
  inserts.length = 0
  logAction.mockClear()
  db.app_settings = [{ id: true, foam_tracking_start: START }]
})

test('not enabled yet (tables missing): start is null and the list is null', async () => {
  missing = new Set(['app_settings', 'foam_box_moves'])
  expect(await getFoamTrackingStart()).toBeNull()
  expect(await listFoamCustomers()).toBeNull()
})

test('listFoamCustomers groups by customer key (phone formatting does not split), applies moves, sorts by balance', async () => {
  db.orders = [
    order({ id: '1', makro_order_no: 'PO-1', foam_box_count: 3 }),
    order({ id: '2', makro_order_no: 'PO-2', customer_phone: '082-628-9533', foam_box_count: 2 }),
    order({ id: '3', customer_name_en: 'Sunset', customer_phone: null, foam_box_count: 1 }),
    order({ id: '4', customer_name_en: 'Quiet', customer_phone: '0811111111', foam_box_count: 0 }),
    order({ id: '5', shipped_at: '2026-10-09T00:00:00+00:00', foam_box_count: 9 }), // before start
  ]
  db.foam_box_moves = [
    { customer_key: 'phone:0826289533|name:JJ PAYAM', kind: 'return', qty: 1, note: null, created_at: '2026-10-12T00:00:00+00:00' },
  ]
  const list = (await listFoamCustomers())!
  expect(list.map((c) => [c.name, c.balance])).toEqual([
    ['JJ Payam', 4],
    ['Sunset', 1],
    ['Quiet', 0],
  ])
  expect(list[0].events.map((e) => e.kind)).toEqual(['sent', 'sent', 'return'])
  expect(list[0].lastSentAt).toBe('2026-10-11T00:00:00+00:00')
})

test('getCustomerFoamBalance: one customer; 0 when not enabled', async () => {
  db.orders = [order({ foam_box_count: 3 }), order({ customer_name_en: 'Other Shop', foam_box_count: 5 })]
  db.foam_box_moves = [
    { customer_key: 'phone:0826289533|name:JJ PAYAM', kind: 'set', qty: 6, note: null, created_at: '2026-10-12T00:00:00+00:00' },
  ]
  expect(await getCustomerFoamBalance({ customer_phone: '0826289533', customer_name_en: 'JJ Payam' })).toBe(6)
  missing = new Set(['app_settings'])
  expect(await getCustomerFoamBalance({ customer_phone: '0826289533', customer_name_en: 'JJ Payam' })).toBe(0)
})

test('recordFoamReturn / setFoamBalance insert the move and write an audit log', async () => {
  const c = { key: 'phone:0826289533|name:JJ PAYAM', name: 'JJ Payam' }
  await recordFoamReturn(c, 3, 'ฝากเรือมา')
  await setFoamBalance(c, 5)
  expect(inserts).toEqual([
    { table: 'foam_box_moves', row: { customer_key: c.key, customer_name: 'JJ Payam', kind: 'return', qty: 3, note: 'ฝากเรือมา' } },
    { table: 'foam_box_moves', row: { customer_key: c.key, customer_name: 'JJ Payam', kind: 'set', qty: 5, note: null } },
  ])
  expect(logAction).toHaveBeenCalledWith('foam_return', 'customer', c.key, { name: 'JJ Payam', qty: 3 })
  expect(logAction).toHaveBeenCalledWith('foam_set', 'customer', c.key, { name: 'JJ Payam', qty: 5 })
})

test('a rejected insert (e.g. pier trying to set) throws a Thai error and logs nothing', async () => {
  missing = new Set(['foam_box_moves'])
  await expect(setFoamBalance({ key: 'k', name: 'n' }, 1)).rejects.toThrow('บันทึกลังโฟมไม่สำเร็จ')
  expect(logAction).not.toHaveBeenCalled()
})

test('quantities must be whole and in range before anything is written', async () => {
  await expect(recordFoamReturn({ key: 'k', name: 'n' }, 0)).rejects.toThrow()
  await expect(setFoamBalance({ key: 'k', name: 'n' }, -1)).rejects.toThrow()
  expect(inserts).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/api/foamBoxes.test.ts`
Expected: FAIL — cannot resolve `./foamBoxes`.

- [ ] **Step 3: Implement** — `src/lib/api/foamBoxes.ts`

```ts
import { supabase } from '../supabase'
import { logAction } from './audit'
import { fetchAll } from './fetchAll'
import type { CustomerRef } from './customerAliases'
import { customerKey } from '../../../supabase/functions/_shared/customerKey'
import {
  foamBalance,
  sentEvents,
  sortFoamEvents,
  type FoamEvent,
} from '../../../supabase/functions/_shared/foamBalance'

// Foam box tracking (spec docs/superpowers/specs/2026-10-10-foam-box-tracking-design.md).
// Sent boxes come from shipped orders; foam_box_moves holds only returns and
// set-balance. Every read fails soft: before migration 0031 runs the tables
// don't exist, and nothing here may break the page that asked.

export type FoamCustomer = {
  key: string
  name: string
  phone: string | null
  balance: number
  lastSentAt: string | null
  events: FoamEvent[]
}

type MoveRow = { customer_key: string; kind: 'return' | 'set'; qty: number; note: string | null; created_at: string }
type OrderRow = {
  makro_order_no: string
  customer_name_en: string
  customer_phone: string | null
  status: string
  shipped_at: string | null
  foam_box_count: number | null
}
const ORDER_COLS = 'makro_order_no,customer_name_en,customer_phone,status,shipped_at,foam_box_count'

const moveEvent = (m: MoveRow): FoamEvent => ({
  at: m.created_at,
  kind: m.kind,
  qty: m.qty,
  ...(m.note ? { label: m.note } : {}),
})

/** When "sent" starts counting; null = tracking not enabled (or unreadable). */
export async function getFoamTrackingStart(): Promise<string | null> {
  const { data, error } = await supabase.from('app_settings').select('foam_tracking_start').maybeSingle()
  if (error || !data) return null
  return (data as { foam_tracking_start: string }).foam_tracking_start ?? null
}

/** Every customer who has had an order, with their balance; null = not enabled. */
export async function listFoamCustomers(): Promise<FoamCustomer[] | null> {
  const start = await getFoamTrackingStart()
  if (!start) return null
  let orders: OrderRow[]
  let moves: MoveRow[]
  try {
    ;[orders, moves] = await Promise.all([
      fetchAll<OrderRow>((from, to) =>
        supabase.from('orders').select(ORDER_COLS).order('id').range(from, to),
      ),
      fetchAll<MoveRow>((from, to) =>
        supabase
          .from('foam_box_moves')
          .select('customer_key,kind,qty,note,created_at')
          .order('created_at')
          .range(from, to),
      ),
    ])
  } catch {
    return null
  }

  const byKey = new Map<string, { name: string; phone: string | null; orders: OrderRow[]; moves: MoveRow[] }>()
  for (const o of orders) {
    const key = customerKey(o)
    const c = byKey.get(key) ?? { name: o.customer_name_en, phone: o.customer_phone, orders: [], moves: [] }
    c.orders.push(o)
    byKey.set(key, c)
  }
  for (const m of moves) byKey.get(m.customer_key)?.moves.push(m)

  const out: FoamCustomer[] = []
  for (const [key, c] of byKey) {
    const events = sortFoamEvents([...sentEvents(c.orders, start), ...c.moves.map(moveEvent)])
    const { balance, lastSentAt } = foamBalance(events)
    out.push({ key, name: c.name, phone: c.phone, balance, lastSentAt, events })
  }
  return out.sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name))
}

/** One customer's balance (pier pages). 0 on any failure. */
export async function getCustomerFoamBalance(ref: CustomerRef): Promise<number> {
  try {
    const start = await getFoamTrackingStart()
    if (!start) return 0
    const key = customerKey(ref)
    let q = supabase.from('orders').select(ORDER_COLS).eq('status', 'shipped').gte('shipped_at', start)
    q = ref.customer_phone ? q.eq('customer_phone', ref.customer_phone) : q.eq('customer_name_en', ref.customer_name_en ?? '')
    const [{ data: orders, error: oErr }, { data: moves, error: mErr }] = await Promise.all([
      q,
      supabase.from('foam_box_moves').select('customer_key,kind,qty,note,created_at').eq('customer_key', key),
    ])
    if (oErr || mErr) return 0
    const mine = ((orders ?? []) as OrderRow[]).filter((o) => customerKey(o) === key)
    return foamBalance([...sentEvents(mine, start), ...((moves ?? []) as MoveRow[]).map(moveEvent)]).balance
  } catch {
    return 0
  }
}

async function insertMove(
  kind: 'return' | 'set',
  c: { key: string; name: string },
  qty: number,
  note?: string,
): Promise<void> {
  const min = kind === 'return' ? 1 : 0
  if (!Number.isInteger(qty) || qty < min || qty > 9999) throw new Error('จำนวนลังไม่ถูกต้อง')
  const { error } = await supabase.from('foam_box_moves').insert({
    customer_key: c.key,
    customer_name: c.name,
    kind,
    qty,
    note: note?.trim() || null,
  })
  if (error) throw new Error('บันทึกลังโฟมไม่สำเร็จ: ' + error.message)
  await logAction(kind === 'return' ? 'foam_return' : 'foam_set', 'customer', c.key, { name: c.name, qty })
}

export const recordFoamReturn = (c: { key: string; name: string }, qty: number, note?: string) =>
  insertMove('return', c, qty, note)

/** Managers only (RLS enforces it): "this customer holds exactly `qty` now". */
export const setFoamBalance = (c: { key: string; name: string }, qty: number, note?: string) =>
  insertMove('set', c, qty, note)
```

In `src/lib/api/auditLogs.ts`, add before `case 'regen_link':`

```ts
    case 'foam_return':
      return `รับคืนลังโฟม ${meta.qty} ใบ จาก ${meta.name}${by}`

    case 'foam_set':
      return `ตั้งยอดลังโฟมของ ${meta.name} เป็น ${meta.qty} ใบ${by}`

```

Add to `src/lib/api/auditLogs.test.ts` a test in the file's existing style for one row of each action, asserting the two messages above (copy the shape of the existing `regen_link` test in that file, with `entity_type: 'customer'`, `entity_id: 'phone:0826289533|name:JJ PAYAM'`, `meta: { name: 'JJ Payam', qty: 3 }` → `รับคืนลังโฟม 3 ใบ จาก JJ Payam`).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/api/foamBoxes.test.ts src/lib/api/auditLogs.test.ts && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/foamBoxes.ts src/lib/api/foamBoxes.test.ts src/lib/api/auditLogs.ts src/lib/api/auditLogs.test.ts
git commit -m "feat: foam box API -- balances, returns, set-balance"
```

---

### Task 4: "ลังโฟม" page + menu

**Files:**
- Create: `src/routes/team/FoamBoxes.tsx`
- Create: `src/routes/team/FoamBoxes.test.tsx`
- Modify: `src/lib/roles.ts` (NAV entry)
- Modify: `src/App.tsx` (lazy route)

**Interfaces:**
- Consumes: `listFoamCustomers`, `recordFoamReturn`, `setFoamBalance`, `FoamCustomer` (Task 3); `useAuth()` from `src/lib/auth` (`profile.role`); `formatDateTH` from `src/lib/format`.
- Produces: route `/foam`, NAV item `{ path: '/foam', label: 'ลังโฟม', roles: ['pier', 'manager'], icon: Package, accent: 'amber' }`.

- [ ] **Step 1: Write the failing test** — `src/routes/team/FoamBoxes.test.tsx`

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FoamBoxes from './FoamBoxes'

const listFoamCustomers = vi.fn()
const recordFoamReturn = vi.fn().mockResolvedValue(undefined)
const setFoamBalance = vi.fn().mockResolvedValue(undefined)
vi.mock('../../lib/api/foamBoxes', () => ({
  listFoamCustomers: (...a: unknown[]) => listFoamCustomers(...a),
  recordFoamReturn: (...a: unknown[]) => recordFoamReturn(...a),
  setFoamBalance: (...a: unknown[]) => setFoamBalance(...a),
}))
const role = { current: 'manager' }
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ profile: { id: 'u1', name: 'x', role: role.current } }) }))

const jj = {
  key: 'phone:0826289533|name:JJ PAYAM',
  name: 'JJ Payam',
  phone: '0826289533',
  balance: 4,
  lastSentAt: '2026-10-11T00:00:00+00:00',
  events: [{ at: '2026-10-11T00:00:00+00:00', kind: 'sent', qty: 4, label: 'PO-1' }],
}
const zero = { key: 'name:QUIET', name: 'Quiet', phone: null, balance: 0, lastSentAt: null, events: [] }

beforeEach(() => {
  role.current = 'manager'
  listFoamCustomers.mockReset().mockResolvedValue([jj, zero])
  recordFoamReturn.mockClear()
  setFoamBalance.mockClear()
})

test('lists only customers holding boxes; "show all" reveals the rest; search filters', async () => {
  render(<FoamBoxes />)
  expect(await screen.findByText('JJ Payam')).toBeInTheDocument()
  expect(screen.queryByText('Quiet')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('checkbox', { name: 'แสดงลูกค้าทั้งหมด' }))
  expect(screen.getByText('Quiet')).toBeInTheDocument()
  await userEvent.type(screen.getByPlaceholderText('ค้นหาชื่อหรือเบอร์'), 'qui')
  expect(screen.queryByText('JJ Payam')).not.toBeInTheDocument()
})

test('record a return; more than outstanding asks to confirm first', async () => {
  render(<FoamBoxes />)
  const row = (await screen.findByText('JJ Payam')).closest('li') as HTMLElement
  await userEvent.click(within(row).getByRole('button', { name: 'รับคืน' }))
  const qty = within(row).getByLabelText('จำนวนที่รับคืน')
  await userEvent.clear(qty)
  await userEvent.type(qty, '6')
  expect(within(row).getByText(/มากกว่ายอดค้าง \(4 ใบ\)/)).toBeInTheDocument()
  await userEvent.click(within(row).getByRole('button', { name: 'บันทึกรับคืน' }))
  expect(recordFoamReturn).toHaveBeenCalledWith({ key: jj.key, name: 'JJ Payam' }, 6, '')
  expect(listFoamCustomers).toHaveBeenCalledTimes(2) // reloaded after saving
})

test('only managers see "ตั้งยอด"; a manager can set a balance', async () => {
  role.current = 'pier'
  const { unmount } = render(<FoamBoxes />)
  const row = (await screen.findByText('JJ Payam')).closest('li') as HTMLElement
  expect(within(row).queryByRole('button', { name: 'ตั้งยอด' })).not.toBeInTheDocument()
  unmount()

  role.current = 'manager'
  render(<FoamBoxes />)
  const row2 = (await screen.findByText('JJ Payam')).closest('li') as HTMLElement
  await userEvent.click(within(row2).getByRole('button', { name: 'ตั้งยอด' }))
  const qty = within(row2).getByLabelText('ยอดค้างตอนนี้')
  await userEvent.clear(qty)
  await userEvent.type(qty, '2')
  await userEvent.click(within(row2).getByRole('button', { name: 'บันทึกยอด' }))
  expect(setFoamBalance).toHaveBeenCalledWith({ key: jj.key, name: 'JJ Payam' }, 2, '')
})

test('the name opens the history', async () => {
  render(<FoamBoxes />)
  await userEvent.click(await screen.findByRole('button', { name: /JJ Payam/ }))
  expect(screen.getByText(/ส่งไป 4 ใบ · PO-1/)).toBeInTheDocument()
})

test('not enabled yet (migration not run) -> a Thai notice, no crash', async () => {
  listFoamCustomers.mockResolvedValue(null)
  render(<FoamBoxes />)
  expect(await screen.findByText(/ยังไม่ได้เปิดใช้ระบบติดตามลังโฟม/)).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/team/FoamBoxes.test.tsx`
Expected: FAIL — cannot resolve `./FoamBoxes`.

- [ ] **Step 3: Implement** — `src/routes/team/FoamBoxes.tsx`

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Package } from '@phosphor-icons/react'
import { PageHeader } from '../../components/ui/PageHeader'
import { PageSkeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { Notice, flash, type Flash } from '../../components/ui/Notice'
import { useAuth } from '../../lib/auth'
import { formatDateTH } from '../../lib/format'
import {
  listFoamCustomers,
  recordFoamReturn,
  setFoamBalance,
  type FoamCustomer,
} from '../../lib/api/foamBoxes'

const KIND_TH = { sent: 'ส่งไป', return: 'รับคืน', set: 'ตั้งยอดเป็น' } as const

/**
 * ลังโฟม: who is holding the shop's foam boxes. Pier staff and managers record
 * returns; managers set a balance (opening count or correction).
 */
export default function FoamBoxes() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'
  const [rows, setRows] = useState<FoamCustomer[] | null | undefined>(undefined) // undefined = loading, null = not enabled
  const [q, setQ] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [msg, setMsg] = useState<Flash>()

  const load = useCallback(() => {
    listFoamCustomers()
      .then(setRows)
      .catch(() => setRows(null))
  }, [])
  useEffect(load, [load])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return (rows ?? []).filter(
      (c) =>
        (showAll || c.balance > 0) &&
        (!s || c.name.toLowerCase().includes(s) || (c.phone ?? '').includes(s)),
    )
  }, [rows, q, showAll])

  if (rows === undefined) return <PageSkeleton rows={6} />
  if (rows === null)
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="ลังโฟม" icon={Package} accent="amber" />
        <p className="alert alert-warn">ยังไม่ได้เปิดใช้ระบบติดตามลังโฟม (รอรัน migration 0031)</p>
      </div>
    )

  const total = rows.reduce((n, c) => n + c.balance, 0)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="ลังโฟม" icon={Package} accent="amber" />
      <p className="text-sm text-ink-soft">
        ลูกค้าถือลังโฟมของร้านอยู่รวม <strong className="text-ink">{total}</strong> ใบ
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="min-w-0 flex-1"
          placeholder="ค้นหาชื่อหรือเบอร์"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          แสดงลูกค้าทั้งหมด
        </label>
      </div>
      <Notice flash={msg} />
      {shown.length === 0 ? (
        <EmptyState icon={Package} title="ไม่มีลูกค้าที่ค้างลังโฟม" hint="ติ๊ก “แสดงลูกค้าทั้งหมด” เพื่อตั้งยอดให้ลูกค้ารายอื่น" />
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((c) => (
            <FoamRow
              key={c.key}
              c={c}
              isManager={isManager}
              onSaved={(text) => {
                setMsg(flash.ok(text))
                load()
              }}
              onError={(text) => setMsg(flash.error(text))}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function FoamRow({
  c,
  isManager,
  onSaved,
  onError,
}: {
  c: FoamCustomer
  isManager: boolean
  onSaved: (text: string) => void
  onError: (text: string) => void
}) {
  const [mode, setMode] = useState<'none' | 'return' | 'set' | 'history'>('none')
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const n = Math.floor(Number(qty))
  const valid = Number.isInteger(n) && n >= (mode === 'return' ? 1 : 0) && n <= 9999
  const ref = { key: c.key, name: c.name }

  function open(m: 'return' | 'set' | 'history') {
    setMode(mode === m ? 'none' : m)
    setQty(m === 'set' ? String(c.balance) : '1')
    setNote('')
  }

  async function save() {
    setBusy(true)
    try {
      if (mode === 'return') {
        await recordFoamReturn(ref, n, note)
        onSaved(`บันทึกรับคืน ${n} ใบ จาก ${c.name} แล้ว`)
      } else {
        await setFoamBalance(ref, n, note)
        onSaved(`ตั้งยอดลังโฟมของ ${c.name} เป็น ${n} ใบแล้ว`)
      }
      setMode('none')
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="card flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="flex min-w-0 flex-1 flex-col items-start text-left" onClick={() => open('history')}>
          <span className="font-medium">{c.name}</span>
          <span className="text-xs text-ink-soft">
            {c.phone ?? 'ไม่มีเบอร์'}
            {c.lastSentAt ? ` · ส่งลังล่าสุด ${formatDateTH(c.lastSentAt.slice(0, 10))}` : ''}
          </span>
        </button>
        <span className={`badge ${c.balance > 0 ? 'badge-warn' : 'badge-neutral'} tnum`}>ค้าง {c.balance} ใบ</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => open('return')}>
          รับคืน
        </button>
        {isManager && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => open('set')}>
            ตั้งยอด
          </button>
        )}
      </div>

      {(mode === 'return' || mode === 'set') && (
        <div className="flex flex-col gap-2 border-t border-line pt-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="field-label">{mode === 'return' ? 'จำนวนที่รับคืน' : 'ยอดค้างตอนนี้'}</span>
            <input
              type="number"
              inputMode="numeric"
              min={mode === 'return' ? 1 : 0}
              className="w-24"
              aria-label={mode === 'return' ? 'จำนวนที่รับคืน' : 'ยอดค้างตอนนี้'}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
            ใบ
          </label>
          <input placeholder="หมายเหตุ (ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} />
          {mode === 'return' && valid && n > c.balance && (
            <p className="text-xs text-warn-ink">
              มากกว่ายอดค้าง ({c.balance} ใบ) — บันทึกได้ แต่ยอดจะเป็น 0 และส่วนเกินไม่นับเป็นเครดิต
            </p>
          )}
          <button type="button" className="btn btn-primary btn-sm self-start" disabled={!valid || busy} onClick={() => void save()}>
            {mode === 'return' ? 'บันทึกรับคืน' : 'บันทึกยอด'}
          </button>
        </div>
      )}

      {mode === 'history' && (
        <ul className="flex flex-col gap-1 border-t border-line pt-3 text-xs text-ink-soft">
          {c.events.length === 0 && <li>ยังไม่มีประวัติ</li>}
          {[...c.events].reverse().map((e, i) => (
            <li key={i}>
              {formatDateTH(e.at.slice(0, 10))} · {KIND_TH[e.kind]} {e.qty} ใบ
              {e.label ? ` · ${e.label}` : ''}
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}
```

In `src/lib/roles.ts`: add `Package,` to the `@phosphor-icons/react` import list, and add this NAV entry right after the `/pier` entry:

```ts
    { path: '/foam', label: 'ลังโฟม', roles: ['pier', 'manager'], icon: Package, accent: 'amber' },
```

In `src/App.tsx`: add `const FoamBoxes = lazyPage(() => import('./routes/team/FoamBoxes'))` with the other lazy pages, and a route next to `/pier` in the same shape:

```tsx
            <Route
              path="/foam"
              element={
                <RequireRole path="/foam">
                  <FoamBoxes />
                </RequireRole>
              }
            />
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/routes/team/FoamBoxes.test.tsx src/components/AppShell.test.tsx src/App.test.tsx && npx tsc --noEmit -p .`
Expected: PASS. (If `formatDateTH` is not exported from `src/lib/format`, use the date formatter that file does export — check with `grep -n "export" src/lib/format.ts`.)

- [ ] **Step 5: Commit**

```bash
git add src/routes/team/FoamBoxes.tsx src/routes/team/FoamBoxes.test.tsx src/lib/roles.ts src/App.tsx
git commit -m "feat: ลังโฟม page -- balances, returns, set-balance, history"
```

---

### Task 5: Pier reminder line

**Files:**
- Create: `src/components/FoamOwedNote.tsx`
- Create: `src/components/FoamOwedNote.test.tsx`
- Modify: `src/routes/team/PierLoad.tsx` (selected-order view, under the `<h1>` / island badge)
- Modify: `src/routes/team/PierGroup.tsx` (under the `<h1>` / island badges)
- Modify: `src/routes/team/PierLoad.test.tsx`, `src/routes/team/PierGroup.test.tsx` (mock the component)

**Interfaces:**
- Consumes: `getCustomerFoamBalance(ref: CustomerRef): Promise<number>` (Task 3).
- Produces: `FoamOwedNote({ customer }: { customer: CustomerRef })`.

- [ ] **Step 1: Write the failing test** — `src/components/FoamOwedNote.test.tsx`

```tsx
import { render, screen } from '@testing-library/react'
import { FoamOwedNote } from './FoamOwedNote'

const getCustomerFoamBalance = vi.fn()
vi.mock('../lib/api/foamBoxes', () => ({
  getCustomerFoamBalance: (...a: unknown[]) => getCustomerFoamBalance(...a),
}))
const customer = { customer_phone: '0826289533', customer_name_en: 'JJ Payam' }

test('shows the reminder when the customer holds boxes', async () => {
  getCustomerFoamBalance.mockResolvedValue(4)
  render(<FoamOwedNote customer={customer} />)
  expect(await screen.findByText('ลูกค้ารายนี้ค้างลังโฟม 4 ใบ — ฝากคนเรือทวงคืน')).toBeInTheDocument()
  expect(getCustomerFoamBalance).toHaveBeenCalledWith(customer)
})

test('renders nothing at 0 (also what a not-yet-enabled system returns)', async () => {
  getCustomerFoamBalance.mockResolvedValue(0)
  const { container } = render(<FoamOwedNote customer={customer} />)
  await new Promise((r) => setTimeout(r, 0))
  expect(container).toBeEmptyDOMElement()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/FoamOwedNote.test.tsx`
Expected: FAIL — cannot resolve `./FoamOwedNote`.

- [ ] **Step 3: Implement** — `src/components/FoamOwedNote.tsx`

```tsx
import { useEffect, useState } from 'react'
import { getCustomerFoamBalance } from '../lib/api/foamBoxes'
import type { CustomerRef } from '../lib/api/customerAliases'

/** Pier pages: "this customer holds N foam boxes -- ask the boat crew to collect". */
export function FoamOwedNote({ customer }: { customer: CustomerRef }) {
  const [n, setN] = useState(0)
  const { customer_phone, customer_name_en } = customer
  useEffect(() => {
    let live = true
    getCustomerFoamBalance({ customer_phone, customer_name_en }).then((v) => live && setN(v))
    return () => {
      live = false
    }
  }, [customer_phone, customer_name_en])
  if (n <= 0) return null
  return <p className="alert alert-info">ลูกค้ารายนี้ค้างลังโฟม {n} ใบ — ฝากคนเรือทวงคืน</p>
}
```

In `src/routes/team/PierLoad.tsx`: import `{ FoamOwedNote } from '../../components/FoamOwedNote'` and render, right after `<IslandBadge island={sel.island} className="self-start" />`:

```tsx
      <FoamOwedNote customer={sel} />
```

(`PierOrder` already has `customer_name_en` and optional `customer_phone`.)

In `src/routes/team/PierGroup.tsx`: import the same and render, right after the island-badges `<div className="flex flex-wrap gap-1.5">…</div>` under the `<h1>`:

```tsx
      {ready[0] && <FoamOwedNote customer={ready[0]} />}
```

In both `PierLoad.test.tsx` and `PierGroup.test.tsx` add near the other mocks:

```tsx
vi.mock('../../components/FoamOwedNote', () => ({ FoamOwedNote: () => null }))
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/components/FoamOwedNote.test.tsx src/routes/team/PierLoad.test.tsx src/routes/team/PierGroup.test.tsx && npx tsc --noEmit -p .`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/FoamOwedNote.tsx src/components/FoamOwedNote.test.tsx src/routes/team/PierLoad.tsx src/routes/team/PierGroup.tsx src/routes/team/PierLoad.test.tsx src/routes/team/PierGroup.test.tsx
git commit -m "feat: pier pages remind the crew of a customer's outstanding foam boxes"
```

---

### Task 6: Customer page box (order-view + CustomerOrderView)

**Files:**
- Modify: `supabase/functions/order-view/index.ts`
- Modify: `src/routes/customer/CustomerOrderView.tsx`
- Modify: `src/routes/customer/i18n.ts`
- Modify: `src/routes/customer/CustomerOrderView.test.tsx`

**Interfaces:**
- Consumes: `customerKey` (Task 1, `../_shared/customerKey.ts`), `foamBalance`, `sentEvents` (`../_shared/foamBalance.ts`).
- Produces: `order-view` response field `foamBoxesOutstanding: number` (0 when unknown / not enabled).

- [ ] **Step 1: Write the failing test** — append to `src/routes/customer/CustomerOrderView.test.tsx`

```tsx
test('a customer holding foam boxes is asked to return them (TH/EN); nothing at 0', async () => {
  fetchMock.mockResolvedValue(ok({ ...payload, foamBoxesOutstanding: 3 }))
  const { unmount } = renderAt()
  expect(
    await screen.findByText('You have 3 of our foam boxes — please return them with the boat'),
  ).toBeInTheDocument()
  unmount()

  fetchMock.mockResolvedValue(ok({ ...payload, foamBoxesOutstanding: 0 }))
  renderAt()
  await screen.findByText(/PO-1001/)
  expect(screen.queryByText(/foam boxes/)).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/routes/customer/CustomerOrderView.test.tsx`
Expected: FAIL — text not found.

- [ ] **Step 3: Implement**

`src/routes/customer/i18n.ts` — add to `en`:

```ts
    foam_owed: 'You have {n} of our foam boxes — please return them with the boat',
```

and to `th`:

```ts
    foam_owed: 'คุณมีลังโฟมของร้านค้างอยู่ {n} ใบ กรุณาคืนกับเรือ',
```

`src/routes/customer/CustomerOrderView.tsx` — add `foamBoxesOutstanding?: number` to `type OrderView`, and render as the first child of the `<section … aria-label={t(lang, 'boxes')}>` block:

```tsx
        {(data.foamBoxesOutstanding ?? 0) > 0 && (
          <p className="alert alert-warn">
            {t(lang, 'foam_owed', { n: data.foamBoxesOutstanding! })}
          </p>
        )}
```

`supabase/functions/order-view/index.ts`:
- add imports:

```ts
import { customerKey } from '../_shared/customerKey.ts'
import { foamBalance, sentEvents, type FoamEvent } from '../_shared/foamBalance.ts'
```

- before `const body = {`, compute (fail soft — any error leaves 0):

```ts
  // Foam boxes this customer still holds (feature/foam-boxes). Best effort:
  // before migration 0031 the tables don't exist and this stays 0.
  let foamBoxesOutstanding = 0
  try {
    const { data: settings } = await admin.from('app_settings').select('foam_tracking_start').maybeSingle()
    const start = (settings as { foam_tracking_start?: string } | null)?.foam_tracking_start
    if (start) {
      const key = customerKey(o)
      let q = admin
        .from('orders')
        .select('customer_name_en,customer_phone,status,shipped_at,foam_box_count')
        .eq('status', 'shipped')
        .gte('shipped_at', start)
      q = o.customer_phone ? q.eq('customer_phone', o.customer_phone) : q.eq('customer_name_en', o.customer_name_en)
      const [{ data: mine }, { data: moves }] = await Promise.all([
        q,
        admin.from('foam_box_moves').select('kind,qty,created_at').eq('customer_key', key),
      ])
      const ships = ((mine ?? []) as Array<{ customer_name_en: string; customer_phone: string | null; status: string; shipped_at: string | null; foam_box_count: number | null }>)
        .filter((r) => customerKey(r) === key)
      const events: FoamEvent[] = [
        ...sentEvents(ships, start),
        ...((moves ?? []) as Array<{ kind: 'return' | 'set'; qty: number; created_at: string }>).map((m) => ({
          at: m.created_at,
          kind: m.kind,
          qty: m.qty,
        })),
      ]
      foamBoxesOutstanding = foamBalance(events).balance
    }
  } catch (e) {
    console.error('order-view foam balance', e)
  }
```

- add `foamBoxesOutstanding,` to the `body` object (next to `outstandingAmount`).

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/routes/customer/CustomerOrderView.test.tsx && npx tsc --noEmit -p .`
Expected: PASS. (The Deno function has no local type checker here; `supabase functions deploy` type-checks it at deploy.)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/order-view/index.ts src/routes/customer/CustomerOrderView.tsx src/routes/customer/i18n.ts src/routes/customer/CustomerOrderView.test.tsx
git commit -m "feat: customer order page asks for outstanding foam boxes back"
```

---

### Task 7: Guide + full verification

**Files:**
- Modify: `docs/user-guide-th.md`

- [ ] **Step 1: Add a guide section** after section "## 8. หน้าท่าเรือ …" (before "## 9."):

```markdown
## 8.1 ลังโฟม (คนท่าเรือ / หัวหน้า)

เมนู **"ลังโฟม"** — ดูว่าลูกค้ารายไหนถือลังโฟมของร้านค้างอยู่กี่ใบ เพื่อทวงคืน

- **ยอดค้าง** = ลังโฟมในออเดอร์ที่**ส่งขึ้นเรือแล้ว** (นับตั้งแต่วันเปิดใช้ระบบ) − ลังที่รับคืน · ลูกค้านับตามเบอร์ + ชื่อร้าน (ร้านต่างชื่อของเจ้าของคนเดียวกันแยกกัน)
- ค่าเริ่มต้นแสดงเฉพาะลูกค้าที่ค้างลัง เรียงจากมากไปน้อย · ค้นชื่อ/เบอร์ได้ · ติ๊ก **"แสดงลูกค้าทั้งหมด"** เพื่อดูทุกราย
- **รับคืน** (คนท่าเรือ + หัวหน้า): กรอกจำนวนลังเปล่าที่เรือขนกลับมา — ถ้ามากกว่ายอดค้าง ระบบเตือน ยอดจะเป็น 0 และส่วนเกินไม่นับเป็นเครดิต
- **ตั้งยอด** (เฉพาะหัวหน้า): "ตอนนี้ลูกค้าถือลังอยู่ N ใบ" — ใช้ตั้งยอดลังที่ลูกค้าถือไว้ก่อนเปิดระบบ และใช้แก้ยอดที่บันทึกผิด (ไม่มีปุ่มลบ)
- กดชื่อลูกค้าเพื่อดูประวัติ ส่งไป / รับคืน / ตั้งยอด · ทุกการบันทึกลงประวัติการใช้งาน
- **หน้าท่าเรือ** ขึ้น "ลูกค้ารายนี้ค้างลังโฟม N ใบ — ฝากคนเรือทวงคืน" ตอนเลือกออเดอร์
- **หน้าลิงก์ลูกค้า** ขึ้น "คุณมีลังโฟมของร้านค้างอยู่ N ใบ กรุณาคืนกับเรือ" เมื่อค้างมากกว่า 0
```

- [ ] **Step 2: Full verification**

Run: `npx tsc --noEmit -p . && npx vitest run && npm run build`
Expected: no type errors; all tests pass; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add ../docs/user-guide-th.md
git commit -m "docs: user guide -- foam box tracking"
```

Rollout (after merge, each step only on the user's word): run 0031 on "รันได้" → push on "push" → `npx supabase functions deploy order-view --project-ref kprlqjxwolljkgqyzygf`.
