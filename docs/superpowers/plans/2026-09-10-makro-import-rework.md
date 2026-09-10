# แผนแก้ — ปรับให้เข้ากับไฟล์ export แม็คโครจริง (Rework)

> **For agentic workers:** implement task-by-task; each task = failing test → code → green → commit. Base branch `main`, work branch `rework/makro-import`.

**Goal:** ปรับแอปให้ทำงานกับไฟล์ export จริงของแม็คโคร 2 ไฟล์ (OrderDetailExport + OrderExport), ตัดฟีเจอร์ราคา/มูลค่าออกทั้งหมด, ของขาดมาจากตัวเลขของแม็คโครไม่ใช่ติ๊กมือ

**สรุปการเปลี่ยน** (จากรอบ grilling ที่ผู้ใช้ยืนยันแล้ว):
- นำเข้า 2 ไฟล์: A=`OrderDetailExport` (รายการ), B=`OrderExport` (ที่อยู่/ระดับออเดอร์) จับคู่ด้วย `Order Number`
- กรองเฉพาะพยาม: `Sub District == "เกาะพยาม"` OR `Shipping Address` มี `ไต๋แขก`/`tai kak`/`taikak` (case-insensitive, ยุบช่องว่าง)
- ตัดราคา/มูลค่าออกหมด: ลบ `order_items.unit_price`, `orders.total_value_cached`; แดชบอร์ดไม่มีคอลัมน์มูลค่า; หน้าลูกค้าไม่มี "สรุปยอดชำระ"
- ของขาด = `shipped_qty < ordered_qty` (ทศนิยม/กก. ได้) มาจากไฟล์ ไม่ใช่ติ๊ก
- import ซ้ำ = sync (อัปเดตรายการ, เก็บ boxes/photos/boat/status/claims)
- สถานะ: ตัด `packing` → `imported → packed → at_pier → shipped`
- หน้าแพ็ค: รายการ read-only + "ส่ง X / สั่ง Y" + remark; ทีมกรอกแค่จำนวนลัง + "แพ็คเสร็จ"
- "ชื่อลูกค้า (อังกฤษ)" → "ชื่อลูกค้า" (ใช้ตามไฟล์)
- claim: ช่อง "ยอดที่จะคืน (บาท)" = โน้ตภายในทีม (มีอยู่แล้ว, แค่ไม่มีการคำนวณ auto)

**Spec:** สรุปในไฟล์นี้ + `docs/superpowers/specs/2026-09-06-koh-payam-delivery-app-design.md` (ของเดิม — ส่วนที่ขัดกับที่นี่ ให้ยึดที่นี่)

## Global Constraints
- Supabase project `kprlqjxwolljkgqyzygf` linked, migrations 0001–0007 applied. ต่อยอดด้วย `0008_...`, `0009_...`
- ไม่มี Docker/Deno → migration ผ่าน `supabase db push`; edge fn เขียนแล้ว controller deploy + smoke
- `.env.local` (gitignored) — subagent `set -a && source .env.local && set +a` ก่อนคำสั่ง supabase/pg
- team UI ไทย hardcoded; customer UI ผ่าน `t()` (EN default) — ไม่มี i18n system ฝั่งทีม
- `tsconfig` `noUnusedLocals`/`noUnusedParameters: true`
- `npx vitest run` ต้อง pristine + เขียว; `npm run build` เขียว
- Router test `MemoryRouter` ใส่ `future={{ v7_startTransition: true, v7_relativeSplatPath: true }}`
- commit ขึ้นต้น `feat:`/`fix:`/`chore:` + ปิดท้าย body ด้วย:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- ไฟล์ตัวอย่างจริงอยู่ที่ repo root: `OrderDetailExport_10-Sep-2026_17_34_11.xlsx`, `OrderExport_10-Sep-2026_20_58_25.xlsx` — ใช้ทำ fixture ได้ (แต่ **อย่า commit ไฟล์จริง** — มีเบอร์โทร/อีเมลลูกค้า; สร้าง fixture ปลอมที่มีโครงคอลัมน์เดียวกันแทน)

---

## Task 1 — migration 0008: ตัดราคา + เพิ่มฟิลด์ที่ต้องใช้

**Files:** Create `koh-payam-delivery/supabase/migrations/0008_makro_import_rework.sql`

**SQL:**
```sql
-- 1. ตัดราคา/มูลค่า
alter table public.order_items drop column if exists unit_price;
alter table public.orders drop column if exists total_value_cached;

-- 2. ฟิลด์ใหม่บน order_items
alter table public.order_items add column if not exists makro_item_id text;
alter table public.order_items add column if not exists item_remark text;
alter table public.order_items add column if not exists shortage_qty numeric(12,3) not null default 0;
-- qty_ordered, qty_shipped, status(ok/short), line_no มีอยู่แล้ว

-- 3. ฟิลด์ใหม่บน orders
alter table public.orders add column if not exists sub_district text;
alter table public.orders add column if not exists makro_order_status text;
-- customer_name_en เดิม -> เก็บชื่อไว้เหมือนเดิม (ไม่ rename column เพื่อลดความเสี่ยง; UI เปลี่ยน label แทน)

-- 4. state machine: ลบ 'packing' ออกจาก flow ที่โค้ดใช้ (enum เก็บ 'packing' ไว้ได้ ไม่ต้องแก้ enum)
--    (โค้ด status.ts จะไม่ให้ transition ไป 'packing' อีก; migration ไม่ต้องแตะ enum)
```

**Verify:** `supabase db push` (controller) — subagent เขียนไฟล์ + note ว่า controller ต้อง push.

**Steps:**
- [ ] เขียน `0008_makro_import_rework.sql` ตามข้างบน
- [ ] commit `feat: migration 0008 — drop price columns, add makro item/shortage/subdistrict fields`

---

## Task 2 — parseMakroFile รองรับ 2 ไฟล์ + fixtures

**Files:**
- Modify `koh-payam-delivery/src/lib/import/parseMakroFile.ts`
- Create fixtures `koh-payam-delivery/src/test/fixtures/order-detail-sample.csv`, `koh-payam-delivery/src/test/fixtures/order-export-sample.csv`
- Test `koh-payam-delivery/src/lib/import/parseMakroFile.test.ts`

**fixtures** — โครงคอลัมน์ตรงกับไฟล์จริง (ข้อมูลปลอม):
- `order-detail-sample.csv` headers: `Order Number,Item Id,Product Name,Order Quantity,Shipped Quantity,Shortage Quantity,Cancelled Quantity,Order Status,Order Date,Item Remark,Customer Name`
  3–4 orders, ~8 rows รวม 1 บรรทัดที่ shipped<order (ของขาดบางส่วน, ใช้ทศนิยม เช่น order 6 shipped 5.43 shortage 0.57), 1 บรรทัด cancelled>0 shipped=0
- `order-export-sample.csv` headers (subset ของ 56 คอลัมน์จริง): `Order Number,Customer Name,Sub District,District,Province,Shipping Address,Original Expected Date,Order Status,Customer Phone,Customer Email`
  ครอบ: 2 order `Sub District=เกาะพยาม`, 1 order address มี "Tai kak" (Sub District อื่น), 1 order ที่อยู่อื่น (ไม่ใช่พยาม), 1 order ที่มีใน B แต่ไม่มีใน A

**parseMakroFile:** คงฟังก์ชันเดิม `parseMakroFile(file): Promise<RawRow[]>` (อ่าน sheet แรกเป็น array of {header: value}) — ไม่ต้องแก้มาก แค่ export helper `detectFileKind(headers: string[]): 'detail' | 'order' | 'unknown'` (detail มี `Item Id`+`Product Name`; order มี `Sub District`+`Shipping Address`)

**Steps:**
- [ ] เขียน fixtures
- [ ] เพิ่ม `detectFileKind` + test (detail/order/unknown)
- [ ] test: parse ทั้ง 2 fixture ได้ rows ถูกจำนวน, key = header
- [ ] commit `feat: 2-file makro parse + detectFileKind + realistic fixtures`

---

## Task 3 — mapColumns: รวม 2 ไฟล์, กรองพยาม, จับคู่คอลัมน์

**Files:**
- Rewrite `koh-payam-delivery/src/lib/import/mapColumns.ts`
- Test `koh-payam-delivery/src/lib/import/mapColumns.test.ts`

**Interfaces (ใหม่):**
```ts
export type DetailMapping = { orderNo: string; product: string; orderedQty: string; shippedQty: string; shortageQty: string; cancelledQty: string; itemRemark: string; itemId: string }
export type OrderMapping  = { orderNo: string; customer: string; subDistrict: string; shippingAddress: string; expectedDate: string }
export const DEFAULT_DETAIL_MAPPING: DetailMapping // Order Number / Product Name / Order Quantity / Shipped Quantity / Shortage Quantity / Cancelled Quantity / Item Remark / Item Id
export const DEFAULT_ORDER_MAPPING: OrderMapping   // Order Number / Customer Name / Sub District / Shipping Address / Original Expected Date

export type ParsedItem = { productName: string; orderedQty: number; shippedQty: number; shortageQty: number; itemId: string; itemRemark: string; lineNo: number; isShort: boolean }
export type ParsedOrder = { makroOrderNo: string; customerName: string; subDistrict: string; shippingAddress: string; expectedDate: string | null; items: ParsedItem[] }
export type BuildResult = {
  orders: ParsedOrder[]           // เฉพาะพยาม + มีรายการ
  skippedNoItems: string[]        // พยามใน B แต่ไม่มีใน A
  skippedNotPayam: number         // นับ order ที่ไม่ใช่พยาม
  cancelledLinesDropped: number
  shippedAllZero: boolean         // true ถ้าทุกบรรทัด shippedQty==0 -> UI เตือน
}

export function isPayam(o: { subDistrict: string; shippingAddress: string }): boolean
  // subDistrict.trim() === 'เกาะพยาม'  ||  /ไต๋แขก|tai\s*kak|taikak/i.test(shippingAddress)

export function validateMapping(kind, headers, mapping): string[]   // Thai problems, ว่าง = ผ่าน

export function buildImport(detailRows: RawRow[], orderRows: RawRow[], dm: DetailMapping, om: OrderMapping): BuildResult
  // 1. index orderRows by orderNo -> keep only isPayam(...)
  // 2. group detailRows by orderNo; for each detail row: parse qty via Number(String(v).replace(/,/g,'')); NaN -> 0
  //    drop a line if cancelledQty>0 && shippedQty===0
  //    isShort = shippedQty < orderedQty  (strict; shippedQty>=orderedQty => not short even if >)
  //    shortageQty from file column (fallback: max(0, orderedQty - shippedQty) if column absent/0 and isShort)
  // 3. join: for each payam order in B, attach its items from A. ไม่มี items -> push orderNo to skippedNoItems, ไม่รวมใน orders
  // 4. shippedAllZero = orders.every(o => o.items.every(i => i.shippedQty === 0))
  // 5. expectedDate: parse "11-Sep-2026 - 11-Sep-2026" -> take first date -> ISO "2026-09-11"; ถ้า parse ไม่ได้ -> null
```

**Tests (ครอบ):**
- `isPayam`: subDistrict เกาะพยาม -> true; address "Tai kak Khao Niwet" -> true; ที่อยู่อื่น -> false
- `buildImport`: fixture 2 ไฟล์ -> orders มีเฉพาะพยาม, `skippedNoItems` มี orderNo ที่ B มี-A ไม่มี, `cancelledLinesDropped` นับถูก, บรรทัด shipped<order -> `isShort:true` + shortageQty ถูก, `shippedAllZero` true เมื่อทุก shipped=0
- `validateMapping`: header ขาด -> คืน problem ภาษาไทย

**Steps:**
- [ ] เขียน types + `isPayam` + `validateMapping` + `buildImport`
- [ ] tests ทั้งหมด
- [ ] commit `feat: buildImport — 2-file join, payam filter, cancelled/no-item skip`

---

## Task 4 — orders API: commitImport แบบ 2 ไฟล์ + sync (ไม่ทำลาย)

**Files:**
- Modify `koh-payam-delivery/src/lib/api/orders.ts`
- Modify `koh-payam-delivery/src/lib/api/orders.test.ts`

**เปลี่ยน `commitImport`:**
```ts
export async function commitImport(shipDate: string, orders: ParsedOrder[]): Promise<{ created: number; synced: number }>
```
- ไม่มี `{force}` แล้ว — ทุกครั้ง = upsert แบบ sync:
  - หา order เดิมด้วย (ship_day_id, makro_order_no)
  - **ไม่มี** -> insert order (status `imported`, `link_token`, `customer_name_en` = customerName, `sub_district`, `makro_order_status`) + insert order_items
  - **มีแล้ว** -> update order (customer_name_en, sub_district, makro_order_status; **ไม่แตะ** status, boat_id, paper/foam counts, shipped_at, link_token) + **replace order_items ทั้งชุด** (delete + re-insert จากไฟล์ใหม่) — boxes/evidence_photos/claims ผูกกับ order ไม่ใช่ order_items จึงไม่กระทบ; claims.order_item_id อาจ dangling -> set null ผ่าน FK `on delete set null` ที่มีอยู่แล้ว
  - นับ created / synced
- `linkBackordersToDay` ยังเรียกท้าย (คงไว้)
- order_items insert: `product_name, qty_ordered=orderedQty, qty_shipped=shippedQty, shortage_qty, status = isShort ? 'short' : 'ok', makro_item_id, item_remark, line_no`
- ลบการอ้าง `unit_price` / `total_value_cached` ทุกที่ใน orders.ts (getOrder select, ฯลฯ)
- `updateOrderStatus`: ลบ `packing` ออกจาก transition ที่ยอม (ดู Task 6)

**Tests:** fresh import -> created=N; re-import order เดิม -> synced, boxes/status/claims เดิมคงอยู่ (mock), order_items ถูก replace

**Steps:**
- [ ] แก้ commitImport + getOrder (เอา price ออก) + tests
- [ ] commit `feat: commitImport 2-file sync (non-destructive re-import), drop price`

---

## Task 5 — ImportOrders.tsx: อัปโหลด 2 ไฟล์ + พรีวิวกรองพยาม

**Files:**
- Rewrite `koh-payam-delivery/src/routes/team/ImportOrders.tsx`
- Modify `koh-payam-delivery/src/routes/team/ImportOrders.test.tsx`

**UI:**
- 2 ช่องเลือกไฟล์: "ไฟล์รายการสินค้า (OrderDetailExport)" + "ไฟล์ที่อยู่ (OrderExport)" — ตรวจ `detectFileKind`; ถ้าสลับไฟล์ เตือน
- จับคู่คอลัมน์: 2 fieldset (รายการ / ที่อยู่), default จาก DEFAULT_*_MAPPING, จำใน `localStorage['makro_detail_mapping']` / `['makro_order_mapping']`
- ปุ่ม "ดูตัวอย่าง" -> `buildImport` -> แสดง:
  - "เจอออเดอร์เกาะพยาม **N** เจ้า" (เขียว)
  - ถ้า `shippedAllZero` -> กล่องเหลือง "⚠️ ไฟล์นี้ยังไม่มีข้อมูลจัดส่งจากแม็คโคร (ส่งจริง = 0 ทั้งหมด) — นำเข้าได้แต่ควร export ใหม่หลังจัดของเสร็จแล้ว sync"
  - `skippedNoItems.length` -> "ข้าม M ออเดอร์ (มีที่อยู่แต่ไม่มีรายการสินค้า): <เลข>"
  - `cancelledLinesDropped` -> "ข้ามรายการที่ยกเลิก K รายการ"
  - ตารางพรีวิว: เลขออเดอร์ / ลูกค้า / #รายการ / #ของขาด
- "วันจัดส่ง": default = `orders[0].expectedDate ?? todayLocalISO()` (แก้ได้)
- ปุ่ม "นำเข้า N ออเดอร์" -> `commitImport(shipDate, result.orders)` -> ข้อความ "นำเข้า X ใหม่ · sync Y"
- ไม่มี ConfirmDialog / overwrite guard แล้ว (sync ไม่ทำลาย)

**Steps:**
- [ ] เขียน UI + test (mock buildImport + commitImport; 2-file upload; พรีวิวโชว์ N พยาม + คำเตือน shippedAllZero)
- [ ] commit `feat: 2-file import screen with payam preview + sync`

---

## Task 6 — status.ts: ตัด packing

**Files:** Modify `koh-payam-delivery/src/lib/status.ts` + `status.test.ts`

- `ORDER_STATUS = ['imported','packed','at_pier','shipped']` (ลบ `'packing'`)
- `FORWARD`: `imported:['packed'], packed:['at_pier'], at_pier:['shipped'], shipped:[]`
- `nextStatus` ปรับตาม
- แก้ test cases (ลบที่อ้าง packing) + ที่อื่นที่ import `OrderStatus` (`StatusBadge` LABEL map — ลบ 'กำลังแพ็ค', เก็บที่เหลือ)
- **หมายเหตุ:** DB enum ยังมี 'packing' (ไม่แตะ) — แค่โค้ดไม่ใช้

**Steps:**
- [ ] แก้ status.ts + StatusBadge + tests
- [ ] commit `feat: drop packing status from the flow`

---

## Task 7 — pack.ts + PackOrder.tsx: read-only items + box counts

**Files:**
- Rewrite `koh-payam-delivery/src/lib/api/pack.ts`
- Rewrite `koh-payam-delivery/src/routes/team/PackOrder.tsx`
- Tests ทั้งสอง

**pack.ts:**
- ลบ `computeShortageValue` (ไม่มีราคาแล้ว)
- `savePack({ orderId, paperCount, foamCount }): Promise<void>` — update orders paper_box_count/foam_box_count (ไม่ status-gate ตามที่แก้ไปแล้ว); **ไม่แตะ order_items** (ของขาดมาจาก import แล้ว); เรียก `syncShortageBackorders(orderId)` (ยังต้องสร้าง backorder จากบรรทัด status='short')
- ลบ `PackInput.items`

**PackOrder.tsx:**
- ตารางรายการ: read-only — คอลัมน์ สินค้า / สั่ง / ส่งจริง / (badge "ขาด" ถ้า status='short') / remark
- กล่องของค้างส่งจากออเดอร์ก่อนหน้า (คงไว้)
- input จำนวนลังกระดาษ + โฟม
- ปุ่ม "บันทึก" + "บันทึก + แพ็คเสร็จ" (อันหลัง: savePack แล้ว `updateOrderStatus(id,'packed')` — no-op ถ้าเป็น packed อยู่แล้ว ตามที่แก้ไปแล้ว)
- `.catch` -> ข้อความไทย (คงไว้)

**Steps:**
- [ ] แก้ pack.ts + PackOrder.tsx + tests
- [ ] commit `feat: pack screen — read-only makro items + box counts only`

---

## Task 8 — backorders.ts: syncShortageBackorders คีย์จาก status='short'

**Files:** Modify `koh-payam-delivery/src/lib/api/backorders.ts` + test

- `syncShortageBackorders(orderId)`: เดิมอ่าน order_items ที่ `status='short'` -> ยังใช้ได้ (import ตั้ง status='short' เมื่อ shippedQty<orderedQty) แค่เปลี่ยน `qty` ที่ใส่ backorder จาก `qty_ordered` -> `shortage_qty` (จำนวนที่ขาดจริง) ; fallback `qty_ordered - qty_shipped`
- ที่เหลือคงเดิม

**Steps:**
- [ ] แก้ + test (short line -> backorder qty = shortage_qty)
- [ ] commit `fix: backorder qty from shortage_qty not full ordered`

---

## Task 9 — order-view edge fn + customer view: เอาเงินออก, ส่ง/สั่ง

**Files:**
- Modify `koh-payam-delivery/supabase/functions/order-view/index.ts`
- Modify `koh-payam-delivery/src/routes/customer/CustomerOrderView.tsx`
- Modify `koh-payam-delivery/src/routes/customer/i18n.ts`
- Modify `koh-payam-delivery/src/components/CreditSummaryTable.tsx` -> **ลบไฟล์** (+ test) — ไม่มีสรุปยอดแล้ว
- Modify `koh-payam-delivery/src/lib/credit.ts` -> **ลบไฟล์** (+ test) — ไม่มีการคำนวณเครดิต
- Tests

**order-view/index.ts:**
- ลบ `computeCreditSummary` copy + `credit` จาก response
- `items`: `{ productName, orderedQty, shippedQty, isShort }` (ลบ unitPrice); ยังเรียงตาม line_no
- `shortages`: `{ productName, orderedQty, shippedQty }` (บรรทัด isShort)
- ลบ `credit` key
- คง: orderNo, customerName (จาก customer_name_en), shipDate, status, boatName, paper/foamBoxCount, evidencePhotos, claimDeadlineAt, canClaim, claims (คง strip `[ทีม]`), link expiry 48h (คง)
- **หมายเหตุ controller:** re-deploy `order-view` หลัง task นี้

**CustomerOrderView.tsx:**
- ลบ `<CreditSummaryTable>` + import
- ตารางรายการ: "สินค้า / สั่ง / ส่งจริง" (EN: Item / Ordered / Shipped) — บรรทัด isShort เน้นสี + badge
- ส่วน "ของขาด" (Shortages): list "<สินค้า> — ส่ง X / สั่ง Y"
- i18n: ลบ key `credit_*`; เพิ่ม `col_ordered`, `col_shipped`, `shortages_short_line` ทั้ง en/th

**Steps:**
- [ ] แก้ edge fn + customer view + i18n; ลบ credit.ts + CreditSummaryTable + tests
- [ ] full `npx vitest run` + build
- [ ] commit `feat: remove money from order-view + customer page; show ordered/shipped`

---

## Task 10 — dashboard + order detail + label: เก็บกวาดที่เหลือ

**Files:**
- Modify `koh-payam-delivery/src/routes/team/DailyDashboard.tsx` — ลบคอลัมน์ "มูลค่า" + `total_value_cached` จาก `listOrdersForDay` select
- Modify `koh-payam-delivery/src/lib/api/shipDays.ts` — `listOrdersForDay` select ไม่มี `total_value_cached`
- Modify `koh-payam-delivery/src/routes/team/OrderDetail.tsx` — ลบ `<CreditSummaryTable>`/credit; ตารางรายการโชว์ สั่ง/ส่งจริง/ขาด/remark; ป้าย "ส่งที่: <sub_district>"
- Modify `koh-payam-delivery/src/routes/team/LabelSheet.tsx` — เปลี่ยน label "ชื่ออังกฤษ" -> "ชื่อลูกค้า" (โค้ด/คอมเมนต์), พิมพ์ `customer_name_en` ตามเดิม (ค่าคือชื่อจริง)
- Modify mapping label ใน ImportOrders (Task 5 ทำแล้ว) + `mapColumns.ts` `FIELD_LABELS` — "ชื่อลูกค้า (อังกฤษ)" -> "ชื่อลูกค้า"
- Tests ที่เกี่ยวข้อง

**Steps:**
- [ ] แก้ทั้งหมด + tests
- [ ] full `npx vitest run` + `npm run build`
- [ ] commit `feat: drop value column, ordered/shipped in detail, customer-name label`

---

## Self-review checklist (controller หลังทุก task)
- [ ] ไม่มี `unit_price` / `total_value_cached` / `computeCreditSummary` / `CreditSummaryTable` / `credit.ts` เหลือใน `src/` หรือ `supabase/functions/`
- [ ] `grep -rn "packing" src/` — เหลือแค่ที่ควร (StatusBadge อาจ map เก่า — เอาออก)
- [ ] `isPayam` ทดสอบกับ 3 รูป: `เกาะพยาม`, `Tai kak`, ที่อยู่อื่น
- [ ] re-import order เดิม ไม่ลบ boxes/photos/boat/claims
- [ ] migration 0008 push แล้ว + `order-view` re-deploy แล้ว + smoke (นำเข้าไฟล์ปลอม 2 ไฟล์ผ่าน UI, เปิดหน้าลูกค้า ไม่มีตัวเงิน)
