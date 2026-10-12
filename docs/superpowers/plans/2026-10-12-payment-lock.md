# Payment Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop packing/shipping a cash-on-delivery customer who still owes a bill from an earlier delivery (unless a manager releases them for that delivery), and give managers one page of everyone's outstanding bills.

**Architecture:** Pure rules in `src/lib/payments.ts` (what is an unpaid bill, who is locked, per-customer debts) feed every screen. Data: two new `orders` columns for a manager's "paid" mark and a `payment_releases` table (0034). The Makro import refreshes payment facts on POs from other days, and a new refresh-only import card updates a multi-day back-catalogue without creating orders. A Makro "not paid" always clears a manager mark (Makro wins).

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind 3, Vitest + Testing Library, Supabase (Postgres + RLS + PostgREST).

**Spec:** `docs/superpowers/specs/2026-10-12-payment-lock-design.md`

All paths are relative to `koh-payam-delivery/` unless they start with `docs/`. Run from `koh-payam-delivery/`: tests `npx vitest run <file>`, types `npx tsc --noEmit -p .`.

## Global Constraints

- Unpaid bill = Pay On Delivery (`/pay on delivery/i` on `payment_method`) AND `outstanding_amount > 0` AND `payment_status` ≠ `Paid` AND `paid_marked_at` is null AND not `is_pickup` AND Makro status not returned/canceled (`makroVoid`).
- Locked for ship date D = an unpaid bill with `ship_date < D` for the same `customerKey`, and no release for (customer, D).
- Days owed = today − bill `ship_date` (calendar days).
- Makro wins: any import row that is not Paid with outstanding > 0 sets `paid_marked_at = null, paid_marked_by = null`.
- Mark paid and release are manager-only in the UI; release is manager-only in RLS.
- Release needs a non-empty reason; one release per (customer_key, ship_date).
- Store pickups and Makro returned/canceled orders are never bills and never locked.
- Thai team copy (exact): section `ค้างชำระ — ห้ามแพ็ค (N)`; row line `ค้างชำระ N บิล · X วัน`; buttons `ปลดให้แพ็ค`, `รับเงินแล้ว`; badge `ปลดแล้ว`; menu `ยอดค้างชำระ` at `/debts`.
- Reads that can pass 1000 rows use `fetchAll`.

## Review Focus

1. A bill dated the **same** ship date as the delivery being packed must not lock it (only earlier ones). Test in Task 1.
2. A customer whose phone is formatted differently on the old bill vs today's order is the same customer. Test in Task 1 (`lockFor` via `customerKey`).
3. Refresh-only import must never create an order for a PO not in the app. Test in Task 3.
4. A manager mark followed by an import still saying Unpaid re-locks the customer. Test in Task 3.
5. Release is per delivery: releasing for D does not release D+1. Test in Task 1.

---

### Task 1: Pure payment rules

**Files:**
- Create: `src/lib/payments.ts`, `src/lib/payments.test.ts`

**Interfaces:**
- Produces:
  - `type Bill = { id: string; makro_order_no: string; customer_name_en: string; customer_phone: string | null; ship_date: string; outstanding_amount: number | null; payment_method: string | null; payment_status: string | null; paid_marked_at?: string | null; is_pickup?: boolean | null; makro_order_status?: string | null }`
  - `isUnpaidBill(b: Bill): boolean`
  - `daysOwed(shipDate: string, today: string): number`
  - `type Lock = { locked: boolean; released: boolean; priorBills: Bill[]; total: number; oldestDays: number }`
  - `lockFor(ref: { customer_phone?: string | null; customer_name_en?: string | null }, shipDate: string, bills: Bill[], releasedKeys: Set<string>, today: string): Lock`
  - `type CustomerDebt = { key: string; name: string; phone: string | null; bills: Bill[]; total: number; oldestDays: number; lockedToday: boolean }`
  - `customerDebts(bills: Bill[], today: string): CustomerDebt[]` (unpaid only, oldest first)
  - `paymentPatch(p: { paymentMethod: string | null; paymentStatus: string | null; outstandingAmount: number; makroOrderStatus: string | null }): Record<string, unknown>`

- [ ] **Step 1: Failing test** — `src/lib/payments.test.ts`

```ts
import { customerDebts, daysOwed, isUnpaidBill, lockFor, paymentPatch, type Bill } from './payments'

const bill = (o: Partial<Bill>): Bill => ({
  id: 'b', makro_order_no: 'PO', customer_name_en: 'JJ Payam', customer_phone: '0826289533',
  ship_date: '2026-10-08', outstanding_amount: 500, payment_method: 'Pay On Delivery',
  payment_status: 'Unpaid', paid_marked_at: null, is_pickup: false, makro_order_status: 'Delivered', ...o,
})
const JJ = { customer_phone: '082-628-9533', customer_name_en: 'jj payam' }

test('isUnpaidBill: only unpaid cash-on-delivery bills with money owing', () => {
  expect(isUnpaidBill(bill({}))).toBe(true)
  expect(isUnpaidBill(bill({ payment_status: 'Paid' }))).toBe(false)
  expect(isUnpaidBill(bill({ outstanding_amount: 0 }))).toBe(false)
  expect(isUnpaidBill(bill({ payment_method: 'Credit Sales' }))).toBe(false)
  expect(isUnpaidBill(bill({ paid_marked_at: '2026-10-09T00:00:00Z' }))).toBe(false)
  expect(isUnpaidBill(bill({ is_pickup: true }))).toBe(false)
  expect(isUnpaidBill(bill({ makro_order_status: 'Canceled' }))).toBe(false)
})

test('daysOwed counts calendar days from the delivery', () => {
  expect(daysOwed('2026-10-08', '2026-10-12')).toBe(4)
  expect(daysOwed('2026-10-12', '2026-10-12')).toBe(0)
})

test('locked only by a bill from an EARLIER delivery; the same delivery’s bill is fine', () => {
  const today = '2026-10-12'
  expect(lockFor(JJ, '2026-10-12', [bill({ ship_date: '2026-10-12' })], new Set(), today).locked).toBe(false)
  const l = lockFor(JJ, '2026-10-12', [bill({ ship_date: '2026-10-08' }), bill({ id: 'c', ship_date: '2026-10-10', outstanding_amount: 300 })], new Set(), today)
  expect(l).toMatchObject({ locked: true, released: false, total: 800, oldestDays: 4 })
  expect(l.priorBills).toHaveLength(2)
})

test('a release lifts the lock for that delivery only', () => {
  const key = 'phone:0826289533|name:JJ PAYAM'
  const bills = [bill({ ship_date: '2026-10-08' })]
  expect(lockFor(JJ, '2026-10-12', bills, new Set([key]), '2026-10-12')).toMatchObject({ locked: false, released: true })
  // releasedKeys are per ship date -- the caller passes the releases for D; another date has none
  expect(lockFor(JJ, '2026-10-13', bills, new Set(), '2026-10-13').locked).toBe(true)
})

test('another customer’s bill never locks this one', () => {
  expect(lockFor(JJ, '2026-10-12', [bill({ customer_name_en: 'Other Shop' })], new Set(), '2026-10-12').locked).toBe(false)
})

test('customerDebts: per customer, oldest first, flags who is locked today', () => {
  const debts = customerDebts(
    [
      bill({ id: '1', ship_date: '2026-10-11', outstanding_amount: 100 }),
      bill({ id: '2', customer_name_en: 'Sunset', customer_phone: null, ship_date: '2026-10-05', outstanding_amount: 50 }),
      bill({ id: '3', ship_date: '2026-10-12', outstanding_amount: 70 }),
      bill({ id: '4', payment_status: 'Paid' }),
    ],
    '2026-10-12',
  )
  expect(debts.map((d) => [d.name, d.total, d.oldestDays, d.lockedToday])).toEqual([
    ['Sunset', 50, 7, true],
    ['JJ Payam', 170, 1, true],
  ])
})

test('paymentPatch: Makro facts, and Makro "not paid" clears a manager mark', () => {
  expect(paymentPatch({ paymentMethod: 'Pay On Delivery', paymentStatus: 'Unpaid', outstandingAmount: 500, makroOrderStatus: 'Delivered' })).toEqual({
    payment_method: 'Pay On Delivery', payment_status: 'Unpaid', outstanding_amount: 500, makro_order_status: 'Delivered',
    paid_marked_at: null, paid_marked_by: null,
  })
  expect(paymentPatch({ paymentMethod: 'Pay On Delivery', paymentStatus: 'Paid', outstandingAmount: 0, makroOrderStatus: 'Delivered' })).toEqual({
    payment_method: 'Pay On Delivery', payment_status: 'Paid', outstanding_amount: 0, makro_order_status: 'Delivered',
  })
})
```

- [ ] **Step 2:** `npx vitest run src/lib/payments.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `src/lib/payments.ts`

```ts
import { customerKey } from '../../supabase/functions/_shared/customerKey'
import { makroVoid } from './makroStatus'

// Payment lock (spec docs/superpowers/specs/2026-10-12-payment-lock-design.md).
// A cash-on-delivery customer who still owes a bill from an EARLIER delivery
// is locked: not packed, not shipped, unless a manager releases that delivery.

export type Bill = {
  id: string
  makro_order_no: string
  customer_name_en: string
  customer_phone: string | null
  ship_date: string
  outstanding_amount: number | null
  payment_method: string | null
  payment_status: string | null
  paid_marked_at?: string | null
  is_pickup?: boolean | null
  makro_order_status?: string | null
}

const isCod = (m: string | null | undefined) => /pay on delivery/i.test(m ?? '')
const isPaid = (s: string | null | undefined) => (s ?? '').trim().toLowerCase() === 'paid'

export function isUnpaidBill(b: Bill): boolean {
  return (
    isCod(b.payment_method) &&
    Number(b.outstanding_amount) > 0 &&
    !isPaid(b.payment_status) &&
    !b.paid_marked_at &&
    !b.is_pickup &&
    !makroVoid(b.makro_order_status)
  )
}

/** Whole calendar days from a delivery date to today (both YYYY-MM-DD). */
export function daysOwed(shipDate: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(shipDate)) / 86_400_000))
}

export type Lock = { locked: boolean; released: boolean; priorBills: Bill[]; total: number; oldestDays: number }

/** `releasedKeys`: customer keys released for `shipDate` (payment_releases). */
export function lockFor(
  ref: { customer_phone?: string | null; customer_name_en?: string | null },
  shipDate: string,
  bills: Bill[],
  releasedKeys: Set<string>,
  today: string,
): Lock {
  const key = customerKey(ref)
  const priorBills = bills
    .filter((b) => isUnpaidBill(b) && b.ship_date < shipDate && customerKey(b) === key)
    .sort((a, b) => a.ship_date.localeCompare(b.ship_date))
  const owing = priorBills.length > 0
  const released = owing && releasedKeys.has(key)
  return {
    locked: owing && !released,
    released,
    priorBills,
    total: priorBills.reduce((n, b) => n + Number(b.outstanding_amount || 0), 0),
    oldestDays: owing ? daysOwed(priorBills[0].ship_date, today) : 0,
  }
}

export type CustomerDebt = {
  key: string
  name: string
  phone: string | null
  bills: Bill[]
  total: number
  oldestDays: number
  // has a bill from before today -> locked for a delivery today
  lockedToday: boolean
}

export function customerDebts(bills: Bill[], today: string): CustomerDebt[] {
  const byKey = new Map<string, CustomerDebt>()
  for (const b of bills) {
    if (!isUnpaidBill(b)) continue
    const key = customerKey(b)
    const d =
      byKey.get(key) ??
      ({ key, name: b.customer_name_en, phone: b.customer_phone, bills: [], total: 0, oldestDays: 0, lockedToday: false } as CustomerDebt)
    d.bills.push(b)
    d.total += Number(b.outstanding_amount || 0)
    byKey.set(key, d)
  }
  for (const d of byKey.values()) {
    d.bills.sort((a, b) => a.ship_date.localeCompare(b.ship_date))
    d.oldestDays = daysOwed(d.bills[0].ship_date, today)
    d.lockedToday = d.bills.some((b) => b.ship_date < today)
  }
  return [...byKey.values()].sort((a, b) => b.oldestDays - a.oldestDays || a.name.localeCompare(b.name))
}

/** Makro's payment facts for an order row; Makro "not paid" clears a manager mark. */
export function paymentPatch(p: {
  paymentMethod: string | null
  paymentStatus: string | null
  outstandingAmount: number
  makroOrderStatus: string | null
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    payment_method: p.paymentMethod,
    payment_status: p.paymentStatus,
    outstanding_amount: p.outstandingAmount,
    makro_order_status: p.makroOrderStatus,
  }
  if (!isPaid(p.paymentStatus) && p.outstandingAmount > 0) {
    patch.paid_marked_at = null
    patch.paid_marked_by = null
  }
  return patch
}
```

- [ ] **Step 4:** `npx vitest run src/lib/payments.test.ts && npx tsc --noEmit -p .` → PASS.
- [ ] **Step 5:** commit `feat: payment lock rules`.

---

### Task 2: Migration 0034

**Files:** Create `supabase/migrations/0034_payment_lock.sql`

- [ ] **Step 1:** write

```sql
-- 0034_payment_lock.sql
-- Payment lock (feature/payment-lock, spec 2026-10-12): a manager can mark a
-- cash-on-delivery bill paid (until a Makro import says otherwise), and can
-- release a locked customer for one delivery.
alter table public.orders
  add column if not exists paid_marked_at timestamptz,
  add column if not exists paid_marked_by uuid references public.profiles(id);

create table if not exists public.payment_releases (
  id uuid primary key default gen_random_uuid(),
  customer_key text not null,
  customer_name text not null,
  ship_date date not null,
  reason text not null check (length(btrim(reason)) > 0),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (customer_key, ship_date)
);
alter table public.payment_releases enable row level security;
drop policy if exists team_read on public.payment_releases;
create policy team_read on public.payment_releases
  for select to authenticated using (public.is_team_member());
drop policy if exists manager_insert on public.payment_releases;
create policy manager_insert on public.payment_releases
  for insert to authenticated with check (public.is_manager() and created_by = auth.uid());
```

- [ ] **Step 2:** `grep -c "create policy" supabase/migrations/0034_payment_lock.sql` → `2`.
- [ ] **Step 3:** commit `feat: payment lock columns + payment_releases (0034)`.

---

### Task 3: Import keeps payment facts current

**Files:**
- Modify: `src/lib/import/buildImport.ts` (add `buildPaymentRefresh`), `src/lib/import/buildImport.test.ts`
- Create: `src/lib/api/paymentRefresh.ts`, `src/lib/api/paymentRefresh.test.ts`
- Modify: `src/lib/api/orders.ts` (`commitImport`: same-day sync uses `paymentPatch`; other-day POs refreshed via `refreshPayments`; result gains `refreshed: number`), `src/lib/api/orders.test.ts`
- Create: `src/components/PaymentRefreshCard.tsx`, `src/components/PaymentRefreshCard.test.tsx`
- Modify: `src/routes/team/ImportOrders.tsx` (render `<PaymentRefreshCard orderMapping={om} />` above the normal file card)

**Interfaces:**
- Consumes: `paymentPatch` (Task 1); `parseMakroFile(buf: ArrayBuffer): Promise<RawRow[]>`; `OrderMapping`, `DEFAULT_ORDER_MAPPING`.
- Produces:
  - `type PaymentRow = { makroOrderNo: string; paymentMethod: string | null; paymentStatus: string | null; outstandingAmount: number; makroOrderStatus: string | null }`
  - `buildPaymentRefresh(orderRows: RawRow[], om: OrderMapping): PaymentRow[]` — every row with an order number, no island/status filtering.
  - `refreshPayments(rows: PaymentRow[]): Promise<{ refreshed: number; notInApp: string[] }>` — never inserts.
  - `commitImport(...)` result `{ created, synced, skipped, refreshed }`.

- [ ] **Step 1: Failing tests**

`buildImport.test.ts` (append):

```ts
test('buildPaymentRefresh reads every order row’s payment facts', () => {
  const O = DEFAULT_ORDER_MAPPING
  const rows = buildPaymentRefresh(
    [
      { [O.orderNo]: 'P-1', [O.paymentMethod]: 'Pay On Delivery', [O.paymentStatus]: 'Paid', [O.outstandingAmount]: '0', [O.orderStatus]: 'Delivered' },
      { [O.orderNo]: ' ', [O.paymentStatus]: 'Unpaid' },
      { [O.orderNo]: 'P-2', [O.paymentMethod]: 'Pay On Delivery', [O.paymentStatus]: 'Unpaid', [O.outstandingAmount]: '1,250.50', [O.orderStatus]: 'Delivered' },
    ],
    O,
  )
  expect(rows).toEqual([
    { makroOrderNo: 'P-1', paymentMethod: 'Pay On Delivery', paymentStatus: 'Paid', outstandingAmount: 0, makroOrderStatus: 'Delivered' },
    { makroOrderNo: 'P-2', paymentMethod: 'Pay On Delivery', paymentStatus: 'Unpaid', outstandingAmount: 1250.5, makroOrderStatus: 'Delivered' },
  ])
})
```

`paymentRefresh.test.ts`:

```ts
import { refreshPayments } from './paymentRefresh'

const existing = [{ makro_order_no: 'P-1' }, { makro_order_no: 'P-2' }]
const updates: { patch: any; no: string }[] = []
const inserts: unknown[] = []
vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ data: existing, error: null }) }),
      update: (patch: any) => ({ eq: (_c: string, no: string) => (updates.push({ patch, no }), Promise.resolve({ error: null })) }),
      insert: (r: unknown) => (inserts.push(r), Promise.resolve({ error: null })),
    }),
  },
}))
beforeEach(() => { updates.length = 0; inserts.length = 0 })

const row = (no: string, status: string, owe: number) => ({ makroOrderNo: no, paymentMethod: 'Pay On Delivery', paymentStatus: status, outstandingAmount: owe, makroOrderStatus: 'Delivered' })

test('updates only POs already in the app, never creates one', async () => {
  const r = await refreshPayments([row('P-1', 'Paid', 0), row('P-9', 'Unpaid', 100)])
  expect(r).toEqual({ refreshed: 1, notInApp: ['P-9'] })
  expect(updates.map((u) => u.no)).toEqual(['P-1'])
  expect(inserts).toEqual([])
})

test('Makro still unpaid -> the manager’s paid mark is cleared', async () => {
  await refreshPayments([row('P-2', 'Unpaid', 300)])
  expect(updates[0].patch).toMatchObject({ payment_status: 'Unpaid', paid_marked_at: null, paid_marked_by: null })
})
```

`orders.test.ts` (append; `state.elsewhere` is the other-day list):

```ts
test('commitImport refreshes payment facts of POs that live on another day, without re-creating them', async () => {
  state.elsewhere = [{ makro_order_no: 'PO-1', ship_date: '2026-09-20', status: 'shipped' }]
  const r = await commitImport('2026-10-01', [{ ...parsedOrders[0], paymentStatus: 'Paid', outstandingAmount: 0 }] as any)
  expect(state.inserted.filter((i) => i.table === 'orders')).toEqual([])
  expect(r.refreshed).toBe(1)
})
```

`PaymentRefreshCard.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PaymentRefreshCard } from './PaymentRefreshCard'
import { DEFAULT_ORDER_MAPPING } from '../lib/import/buildImport'

const parseMakroFile = vi.fn()
const refreshPayments = vi.fn()
vi.mock('../lib/import/parseMakroFile', () => ({ parseMakroFile: (...a: unknown[]) => parseMakroFile(...a) }))
vi.mock('../lib/api/paymentRefresh', () => ({ refreshPayments: (...a: unknown[]) => refreshPayments(...a) }))

test('uploads only an OrderExport and reports what was refreshed', async () => {
  const O = DEFAULT_ORDER_MAPPING
  parseMakroFile.mockResolvedValue([{ [O.orderNo]: 'P-1', [O.paymentStatus]: 'Paid', [O.outstandingAmount]: '0' }])
  refreshPayments.mockResolvedValue({ refreshed: 1, notInApp: ['P-9'] })
  render(<PaymentRefreshCard orderMapping={O} />)
  const file = new File(['x'], 'OrderExport.xlsx')
  await userEvent.upload(screen.getByLabelText('ไฟล์ OrderExport (ย้อนหลังหลายวันได้)'), file)
  await userEvent.click(screen.getByRole('button', { name: 'อัปเดตสถานะการจ่ายเงิน' }))
  expect(await screen.findByText('อัปเดตสถานะการจ่ายเงิน 1 ออเดอร์ · ไม่พบในแอป 1 ออเดอร์ (ข้าม)')).toBeInTheDocument()
})
```

- [ ] **Step 2:** run the four test files → FAIL.

- [ ] **Step 3: Implement**

`buildImport.ts` (append; uses existing `toNum` and `RawRow`):

```ts
export type PaymentRow = {
  makroOrderNo: string
  paymentMethod: string | null
  paymentStatus: string | null
  outstandingAmount: number
  makroOrderStatus: string | null
}

/** Payment facts of every order row -- for the refresh-only import (no filtering). */
export function buildPaymentRefresh(orderRows: RawRow[], om: OrderMapping): PaymentRow[] {
  const cell = (r: RawRow, col: string) => (col ? String(r[col] ?? '').trim() : '')
  const out: PaymentRow[] = []
  for (const r of orderRows) {
    const no = cell(r, om.orderNo)
    if (!no) continue
    out.push({
      makroOrderNo: no,
      paymentMethod: cell(r, om.paymentMethod) || null,
      paymentStatus: cell(r, om.paymentStatus) || null,
      outstandingAmount: om.outstandingAmount ? toNum(r[om.outstandingAmount]) : 0,
      makroOrderStatus: cell(r, om.orderStatus) || null,
    })
  }
  return out
}
```

(`toNum` must already strip thousands separators; if it does not, extend it to `Number(String(v).replace(/,/g, ''))`.)

`src/lib/api/paymentRefresh.ts`:

```ts
import { supabase } from '../supabase'
import { paymentPatch } from '../payments'
import type { PaymentRow } from '../import/buildImport'

const CHUNK = 200 // keep each .in() under PostgREST's URL limit

/**
 * Refresh payment facts of POs already in the app (any ship date) from a
 * Makro OrderExport. Never creates or deletes an order.
 */
export async function refreshPayments(rows: PaymentRow[]): Promise<{ refreshed: number; notInApp: string[] }> {
  const nos = [...new Set(rows.map((r) => r.makroOrderNo))]
  const have = new Set<string>()
  for (let i = 0; i < nos.length; i += CHUNK) {
    const { data, error } = await supabase.from('orders').select('makro_order_no').in('makro_order_no', nos.slice(i, i + CHUNK))
    if (error) throw new Error('โหลดออเดอร์ไม่สำเร็จ: ' + error.message)
    for (const d of (data ?? []) as { makro_order_no: string }[]) have.add(d.makro_order_no)
  }
  let refreshed = 0
  for (const r of rows) {
    if (!have.has(r.makroOrderNo)) continue
    const { error } = await supabase.from('orders').update(paymentPatch(r)).eq('makro_order_no', r.makroOrderNo)
    if (error) throw new Error(`อัปเดตการจ่ายเงินของ ${r.makroOrderNo} ไม่สำเร็จ: ${error.message}`)
    refreshed++
  }
  return { refreshed, notInApp: nos.filter((n) => !have.has(n)) }
}
```

`orders.ts` `commitImport`:
- in the same-day sync `update({...})`, replace the four fields `makro_order_status`, `payment_method`, `payment_status`, `outstanding_amount` with `...paymentPatch(o)` (ParsedOrder has `paymentMethod`, `paymentStatus`, `outstandingAmount`, `makroOrderStatus`).
- after computing `orders`/`skipped`, refresh the other-day POs:

```ts
  const { refreshed } = await refreshPayments(incoming.filter((o) => elsewhere.has(o.makroOrderNo)))
```

- return `{ created, synced, skipped, refreshed }` and add `refreshed: number` to the return type.
- In `ImportOrders.tsx` the result message adds `` (r.refreshed ? ` · อัปเดตการจ่ายเงิน ${r.refreshed}` : '') ``.

`src/components/PaymentRefreshCard.tsx`:

```tsx
import { useState, type ChangeEvent } from 'react'
import { parseMakroFile } from '../lib/import/parseMakroFile'
import { buildPaymentRefresh, type OrderMapping } from '../lib/import/buildImport'
import { refreshPayments } from '../lib/api/paymentRefresh'

/**
 * "อัปเดตสถานะการจ่ายเงินอย่างเดียว": feed a multi-day OrderExport back-catalogue
 * safely -- only POs already in the app are touched; nothing is created.
 */
export function PaymentRefreshCard({ orderMapping }: { orderMapping: OrderMapping }) {
  const [rows, setRows] = useState<ReturnType<typeof buildPaymentRefresh>>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string>()
  const [err, setErr] = useState<string>()

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    setMsg(undefined)
    setErr(undefined)
    const f = e.target.files?.[0]
    if (!f) return
    try {
      setRows(buildPaymentRefresh(await parseMakroFile(await f.arrayBuffer()), orderMapping))
    } catch {
      setErr('อ่านไฟล์ไม่สำเร็จ')
    }
  }

  async function run() {
    setBusy(true)
    setErr(undefined)
    try {
      const r = await refreshPayments(rows)
      setMsg(`อัปเดตสถานะการจ่ายเงิน ${r.refreshed} ออเดอร์ · ไม่พบในแอป ${r.notInApp.length} ออเดอร์ (ข้าม)`)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card flex flex-col gap-3">
      <p className="section-title">อัปเดตสถานะการจ่ายเงินอย่างเดียว</p>
      <p className="text-sm text-ink-soft">
        ใช้ไฟล์ OrderExport ย้อนหลังหลายวันได้ — อัปเดตเฉพาะออเดอร์ที่มีในแอปแล้ว ไม่สร้างออเดอร์ใหม่
      </p>
      <label className="field">
        <span className="field-label">ไฟล์ OrderExport (ย้อนหลังหลายวันได้)</span>
        <input type="file" accept=".csv,.xlsx,.xls" aria-label="ไฟล์ OrderExport (ย้อนหลังหลายวันได้)" onChange={onFile} />
      </label>
      <button type="button" className="btn btn-secondary self-start" disabled={busy || rows.length === 0} onClick={() => void run()}>
        {busy ? 'กำลังอัปเดต…' : 'อัปเดตสถานะการจ่ายเงิน'}
      </button>
      {msg && <p className="alert alert-ok">{msg}</p>}
      {err && <p className="alert alert-danger">{err}</p>}
    </section>
  )
}
```

(If `parseMakroFile` takes a `File` rather than an `ArrayBuffer`, match its real signature: `grep -n "export async function parseMakroFile" src/lib/import/parseMakroFile.ts`.)

- [ ] **Step 4:** run the four files + `src/routes/team/ImportOrders.test.tsx` + tsc → PASS.
- [ ] **Step 5:** commit `feat: imports keep payment facts current; refresh-only import card`.

---

### Task 4: Payments API

**Files:** Create `src/lib/api/payments.ts`, `src/lib/api/payments.test.ts`; modify `src/lib/api/auditLogs.ts` (+ test).

**Interfaces:**
- Consumes: `Bill`, `lockFor`, `Lock`, `customerDebts`, `CustomerDebt` (Task 1); `fetchAll`; `logAction`; `customerKey`; `todayLocalISO`.
- Produces:
  - `listUnpaidBills(): Promise<Bill[]>` (DB pre-filter: Pay On Delivery, outstanding > 0, not marked, not pickup; JS applies `isUnpaidBill`)
  - `listReleasedKeys(shipDate: string): Promise<Set<string>>`
  - `getDayLocks(shipDate: string, customers: CustomerRef[]): Promise<Map<string, Lock>>` (key = customerKey)
  - `getCustomerLock(ref: CustomerRef, shipDate: string): Promise<Lock>` (fails soft to unlocked)
  - `releaseCustomer(ref: CustomerRef, shipDate: string, reason: string): Promise<void>`
  - `markBillPaid(orderId: string): Promise<void>`
  - `listCustomerDebts(): Promise<CustomerDebt[]>`
  - `countLockedToday(today: string): Promise<number>`
  - audit messages: `payment_marked` → `บันทึกรับเงินบิล ${PO}${by}`; `payment_released` → `ปลดให้แพ็ค ${meta.name} (รอบส่ง ${meta.shipDate}) — ${meta.reason}${by}`

Write tests first in the style of `src/lib/api/foamBoxes.test.ts` (table-backed supabase stand-in with eq/gte/lt/in/is/ilike/or/range/insert/update). Cover: `getDayLocks` locks a customer with an earlier bill and not one with only a same-day bill; a release for D unlocks; `releaseCustomer` rejects an empty reason before writing and writes `{customer_key, customer_name, ship_date, reason}` + audit; `markBillPaid` writes `paid_marked_at` + audit; `getCustomerLock` returns unlocked when the table read errors; `countLockedToday` counts locked, unreleased customers that have an order today.

Implementation notes (exact queries):

```ts
// bills: cash-on-delivery, owing, not marked, not pickup (JS finishes with isUnpaidBill)
fetchAll<Bill>((from, to) =>
  supabase
    .from('orders')
    .select('id,makro_order_no,customer_name_en,customer_phone,ship_date,outstanding_amount,payment_method,payment_status,paid_marked_at,is_pickup,makro_order_status')
    .ilike('payment_method', '%pay on delivery%')
    .gt('outstanding_amount', 0)
    .is('paid_marked_at', null)
    .eq('is_pickup', false)
    .order('id')
    .range(from, to),
)
// releases for a date
supabase.from('payment_releases').select('customer_key').eq('ship_date', shipDate)
// release
supabase.from('payment_releases').insert({ customer_key: customerKey(ref), customer_name: ref.customer_name_en ?? '', ship_date: shipDate, reason: reason.trim() })
// mark paid
supabase.from('orders').update({ paid_marked_at: new Date().toISOString(), paid_marked_by: (await supabase.auth.getUser()).data.user?.id ?? null }).eq('id', orderId)
```

`countLockedToday(today)`: today's non-pickup orders (`select customer_name_en,customer_phone .eq('ship_date', today).eq('is_pickup', false)`), unpaid bills, releases for today → number of distinct customer keys with `lockFor(...).locked`. Errors → 0.

- [ ] Steps: failing tests → FAIL → implement → PASS + tsc → commit `feat: payments API -- locks, releases, mark paid, debts`.

---

### Task 5: Dashboard section + menu badge

**Files:** Modify `src/routes/team/DailyDashboard.tsx` (+ test), `src/lib/api/navCounts.ts` (+ test), `src/lib/api/navCounts.ts` `URGENT_NAV_PATHS` add `'/debts'`.

- Dashboard loads `getDayLocks(date, rows)` whenever rows/date change (fail soft: empty map).
- Entries whose customer is locked go to a new **first** table section `ค้างชำระ — ห้ามแพ็ค (N)` (before `ยังไม่แพ็ค`), excluded from the other sections; each such row shows a red line `ค้างชำระ N บิล · X วัน`; managers see `ปลดให้แพ็ค` → inline reason input + confirm → `releaseCustomer(...)` → reload locks. Released customers stay in normal sections with a `ปลดแล้ว` badge.
- `getNavCounts` manager branch adds `['/debts', countLockedToday(today)]`.

Tests (DailyDashboard.test): mock `../../lib/api/payments` (`getDayLocks`, `releaseCustomer`); a locked customer appears under the new section with the red line; a packer sees no release button; a manager releases with a reason → `releaseCustomer` called with `(ref, date, reason)`. navCounts.test: manager result includes `/debts`.

- [ ] Steps: tests → FAIL → implement → PASS → commit `feat: dashboard locks unpaid customers; release per delivery`.

---

### Task 6: Pack + pier blocking

**Files:** Create `src/components/PaymentLockNote.tsx` (+ test); modify `PackOrder.tsx`, `PackGroup.tsx`, `PierLoad.tsx`, `PierGroup.tsx` (+ their tests' mocks).

- `usePaymentLock(ref, shipDate)` hook in `PaymentLockNote.tsx` → `Lock | null` via `getCustomerLock`; `<PaymentLockNote lock={lock} />` renders a red alert `ค้างชำระ N บิล · X วัน — ห้ามแพ็ค/ส่ง จนกว่าจะจ่าย หรือหัวหน้าปลดให้` when `lock.locked`.
- PackOrder/PackGroup: `packGateBlocked` also true while `lock?.locked` (plain "บันทึก" unaffected).
- PierLoad/PierGroup: ship disabled while locked; note shown.
- Existing tests mock `../../components/PaymentLockNote` → `{ usePaymentLock: () => null, PaymentLockNote: () => null }`.
- New tests: PaymentLockNote shows the text when locked and nothing when unlocked/released; PackOrder with `usePaymentLock` mocked to locked → "บันทึก + แพ็คเสร็จ" disabled; PierLoad locked → ship disabled.

- [ ] Steps → commit `feat: pack and pier refuse a customer with an unpaid earlier bill`.

---

### Task 7: Order page "รับเงินแล้ว"

**Files:** Modify `src/routes/team/OrderDetail.tsx` (+ test).

- For a manager, when `isUnpaidBill(order)` → button `รับเงินแล้ว` (confirm inline) → `markBillPaid(id)` → reload. When `order.paid_marked_at` → muted note `ทีมบันทึกรับเงินแล้ว — รอแม็คโครอัปเดต`.
- Tests: manager sees and uses it; packer doesn't; marked order shows the note.

- [ ] Steps → commit `feat: managers mark a cash-on-delivery bill paid`.

---

### Task 8: "ยอดค้างชำระ" page

**Files:** Create `src/routes/team/Debts.tsx` (+ test); modify `src/lib/roles.ts` (NAV `{ path: '/debts', label: 'ยอดค้างชำระ', roles: ['manager'], icon: Money, accent: 'rose' }`), `src/App.tsx` (lazy route under `RequireRole path="/debts"`).

- Loads `listCustomerDebts()` and `listReleasedKeys(today)`; top total; search name/phone; rows: name, phone, bill count, total (`formatTHB`), `ค้าง X วัน`, red `ล็อกแพ็ค` when `lockedToday` and not released (else `ปลดแล้ววันนี้`); expand → bills (PO link `/order/:id`, ship date, amount, days, `รับเงินแล้ว`) + `ปลดให้แพ็ค` (reason).
- Tests: list order/total/search; mark paid calls `markBillPaid`; release calls `releaseCustomer(ref, today, reason)`.

- [ ] Steps → commit `feat: ยอดค้างชำระ page for managers`.

---

### Task 9: Guide + full verification

- Add a guide section "ยอดค้างชำระ / ล็อกลูกค้าค้างจ่าย" to `docs/user-guide-th.md` (rules, release, mark paid, refresh-only import, go-live steps).
- `npx tsc --noEmit -p . && npx vitest run && npm run build` → all green.
- Commit `docs: payment lock guide`.

Rollout after merge (each on the user's word): 0034 on "รันได้" → push → refresh-only import of OrderExport files from 2026-09-12.
