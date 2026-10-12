# Payment lock — design

Date: 2026-10-12 · Status: approved in conversation (grill-me), awaiting spec review

## Problem

Cash-on-delivery customers keep ordering while earlier bills are unpaid, so
debt piles up across several bills. The team wants the app to show, before
packing or shipping, whether a customer still owes an earlier bill and for
how many days, and to stop that customer's goods going out.

**Success:** no cash-on-delivery customer is packed or shipped while a bill
from an earlier delivery is unpaid, unless a manager deliberately releases
them for that delivery. Managers can see everyone's outstanding money in
one place.

**Out of scope:** credit-sales customers and payment type "Other", partial
payments, reminders sent to customers, any change to Makro.

## Decisions (from the grill)

| # | Decision |
|---|---|
| Q1 | Paid status comes from the Makro file **and** a manager can mark a bill paid in the app. |
| Q2 | Locked = any unpaid bill from an **earlier delivery** (ship date before the one being worked on). The current delivery's own bill may be unpaid. Days shown. |
| Q3 | Locked customers can't be packed. The dashboard lists them in their own section with a red warning; a release button lets them be packed. |
| Q4 | Only **Pay On Delivery** bills count. Credit Sales and Other are never locked. |
| Q5 | Warnings follow Q3: dashboard section, pack pages, pier pages. |
| Q6 | Release = **manager only**, for **this delivery only** (the customer's orders on that ship date), with a short reason, audited. Next delivery locks again if still owing. |
| Q7 | "รับเงินแล้ว" (mark paid) = **manager only**, on the order page and the new menu, audited. |
| Q8 | **Makro wins.** A later import that still says the bill is unpaid clears the manager's mark, so the customer locks again. |
| Q9 | Before go-live, import Makro OrderExport files back to 2026-09-12 so the 111 stale "Unpaid" bills become accurate. |
| Q10 | Shipping is locked too (orders packed before the lock appeared). Same release. |
| Q11 | New menu **"ยอดค้างชำระ"**, managers only. |
| Q12 | It lists every customer with an unpaid bill, oldest first: bills, total, oldest days, red "ล็อกแพ็ค" when locked; expandable per bill with รับเงินแล้ว / ปลดให้แพ็ค; search; overall total on top. |
| Q13 | Days owed = today − the bill's ship date. |
| Q14 | Menu badge (red) = customers locked **and** with orders today, not yet released. |
| ⚙ | Canceled / returned (Makro) and store-pickup orders are never bills and never locked. |
| ⚙ | A customer = phone + shop name (`customerKey`), as for stickers and foam boxes. |

## Definitions

**Unpaid bill**: an order where all of these hold:
- `payment_method` is Pay On Delivery (case-insensitive match on "pay on delivery")
- `outstanding_amount > 0`
- `payment_status` is not `Paid`
- `paid_marked_at` is null (no manager mark)
- not store pickup (`is_pickup = false`) and `makro_order_status` is not returned / canceled

**Locked for ship date D**: the customer has an unpaid bill with `ship_date < D`,
and there is no release for (customer, D).

## Data (migration 0034)

- `orders.paid_marked_at timestamptz`, `orders.paid_marked_by uuid → profiles`
- New table `public.payment_releases`: `customer_key text`, `ship_date date`,
  `reason text not null`, `created_by uuid default auth.uid()`, `created_at`;
  unique `(customer_key, ship_date)`. RLS: read `is_team_member()`; insert
  `is_manager()`; no update/delete.
- Audit actions: `payment_marked` (order), `payment_released` (customer).

Marking paid / releasing are manager actions in the UI; marking paid writes
to `orders`, whose existing update policy allows any team member, so the
manager-only rule for marking is UI-level (as for island and reopen).
Releases are manager-only in the database.

## Import change

`commitImport` today skips a PO that exists on a **different** ship date.
It must now refresh that PO's payment facts — `payment_method`,
`payment_status`, `outstanding_amount`, `makro_order_status` — without
re-creating it or touching anything else. On every refresh (same day or
other day), if Makro does **not** say Paid and outstanding > 0, clear
`paid_marked_at` / `paid_marked_by` (Q8). The preview still says those POs
were "already imported on another day"; the result also counts how many
had their payment refreshed.

### Payment-refresh-only import (added after spec review)

The normal import assigns every PO in the file to the one ship date picked
on the page, so feeding it a multi-day back-catalogue (Q9) would create
never-imported POs on the wrong date. The import page gets a second mode,
**"อัปเดตสถานะการจ่ายเงินอย่างเดียว"**: only the OrderExport file is needed;
for every PO in it that already exists (any ship date) it refreshes the
payment facts above (same Q8 rule); it never creates or deletes an order and
never touches items. The result says how many POs were refreshed and how many
in the file aren't in the app (ignored).

## Logic (pure, tested)

`src/lib/payments.ts`:
- `isUnpaidBill(order)` per the definition
- `customerDebts(bills, today)` → per customer: bills, total, oldest ship date, oldest days
- `lockFor(customerKey, shipDate, bills, releases)` → `{ locked, priorBills, oldestDays, released }`

## Screens

1. **งานวันนี้** — customers locked for the selected date move to a top section
   "ค้างชำระ — ห้ามแพ็ค (N)" with a red line "ค้างชำระ N บิล · X วัน" per row.
   Manager sees "ปลดให้แพ็ค" (reason prompt). Released customers return to the
   normal sections with a small "ปลดแล้ว" badge.
2. **Pack pages** (`PackOrder`, `PackGroup`) — red alert at the top; "บันทึก +
   แพ็คเสร็จ" disabled while locked (plain "บันทึก" of counts still allowed).
3. **Pier pages** (`PierLoad`, `PierGroup`) — red alert; ship disabled while locked.
4. **Order page** — for an unpaid Pay-On-Delivery bill: "รับเงินแล้ว" (manager).
   Shows "ทีมบันทึกรับเงินแล้ว" when marked.
5. **ยอดค้างชำระ** (`/debts`, manager) — as Q12, with mark-paid and release.
6. **Menu badge** — red count per Q14 (via `useNavCounts`).

## Rollout

1. Migration 0034 on "รันได้".
2. Push (the app works without the old files imported — it just locks too much,
   so step 3 should follow quickly).
3. Import OrderExport files from 2026-09-12 onward with the payment-refresh-only
   mode (Q9), check the
   ยอดค้างชำระ page, then announce to the team.

## Testing

- Pure: bill definition (each exclusion), lock (earlier vs same date, release),
  days, grouping by customer.
- Import: other-day PO gets payment refreshed and nothing else; Unpaid clears
  the manager mark; Paid keeps it irrelevant.
- UI: dashboard section + release (manager only), pack/pier disabled while
  locked, order-page mark paid (manager only), debts page list/search/total,
  menu badge.
