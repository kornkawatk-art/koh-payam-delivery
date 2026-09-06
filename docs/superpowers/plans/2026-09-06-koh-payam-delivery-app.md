# แผนลงมือทำ — แอปจัดการส่งสินค้าเกาะพยาม (Koh Payam Delivery App)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เว็บแอปที่แทนการประสานงานผ่าน LINE สำหรับการส่งสินค้าไปเกาะพยามรายวัน — นำเข้าออเดอร์แม็คโคร, แพ็ค+ของขาด, จัดเรือ+รูปหลักฐานที่ท่าเรือ, ลิงก์สถานะให้ลูกค้า, เคลม 48 ชม., สรุปเครดิตต่อออเดอร์

**Architecture:** SPA (Vite + React + TypeScript) คุยกับ Supabase (Postgres + Auth + RLS) โดยตรงสำหรับฝั่งทีม; ฝั่งลูกค้าไม่มี auth เข้าผ่านลิงก์ token อย่างเดียว ผ่าน Supabase Edge Functions (Deno) ที่ใช้ service role อ่าน/เขียนเฉพาะออเดอร์ของ token นั้น; รูปเก็บบน Cloudflare R2 อัปโหลดผ่าน presigned URL ที่ Edge Function ออกให้; งานลบข้อมูล 30 วันทำด้วย pg_cron + function กวาด R2

**Tech Stack:** Vite, React 18, TypeScript, React Router 6, Tailwind CSS 3, @supabase/supabase-js 2, Supabase CLI (local dev + migrations + Edge Functions), Deno (Edge Functions), xlsx (SheetJS) สำหรับอ่าน CSV/Excel, Vitest + @testing-library/react + jsdom สำหรับเทสต์, Vercel สำหรับ deploy หน้าเว็บ

**Spec:** `docs/superpowers/specs/2026-09-06-koh-payam-delivery-app-design.md` — อ่านคู่กับแผนนี้เสมอ

## Global Constraints

- **ต้นทุน = 0 บาท** — ใช้เฉพาะ free tier: Supabase Free (region `Southeast Asia (Singapore)`), Cloudflare R2 Free (10 GB), Vercel Hobby (ซับโดเมน `*.vercel.app`), GitHub Free
- **ไม่เก็บข้อมูลอ่อนไหวของลูกค้า** — ห้ามมีคอลัมน์/ฟิลด์สำหรับ ที่อยู่ / เบอร์โทร / อีเมล ของลูกค้าในทุกตาราง ทุก payload ทุก log
- **ฝั่งลูกค้าห้ามแตะตารางตรง** — ลูกค้าเข้าถึงข้อมูลผ่าน Edge Function (`order-view`, `submit-claim`, `photo-upload-url`) เท่านั้น; ตารางทุกตัวเปิด RLS และไม่มี policy ให้ role `anon`
- **หน้าทีม = ภาษาไทย** (ข้อความ UI ฝั่งทีมเป็นไทยตายตัว ไม่ต้องมีระบบ i18n), **หน้าลูกค้า = อังกฤษเป็นค่าเริ่มต้น + ปุ่มสลับเป็นไทย**
- **เดดไลน์เคลม = 48 ชั่วโมง** นับจาก `orders.shipped_at`
- **ลบข้อมูลอัตโนมัติเมื่ออายุเกิน 30 วัน** นับจาก `orders.ship_date`
- **รูป:** บีบในเบราว์เซอร์ให้ด้านยาวสุด ≤ 1600 px และไฟล์ ≤ 200 KB (JPEG quality ปรับลงจนผ่าน), สูงสุด 3 รูปต่อออเดอร์ และ 3 รูปต่อเคลม
- **สถานะออเดอร์ (state machine):** `imported → packing → packed → at_pier → shipped` เดินหน้าอย่างเดียว ห้ามข้ามขั้น ยกเว้น `packing → packed` ที่ย้อนกลับได้ถ้ายังไม่ `at_pier`
- **บทบาทผู้ใช้ทีม:** `packer` / `pier` / `manager` — `manager` ทำได้ทุกอย่าง; `packer` เข้าถึง import/dashboard/pack/label; `pier` เข้าถึง dashboard/boat-setup/pier/photo; การอนุมัติเคลมทำได้เฉพาะ `manager`
- **คอมมิตบ่อย** — จบทุก Task ต้องมีคอมมิตอย่างน้อย 1 ครั้ง; ข้อความคอมมิตขึ้นต้นด้วย `feat:` / `test:` / `chore:` / `fix:`
- **ทุกไฟล์ที่เขียน SQL migration** ตั้งชื่อ `supabase/migrations/NNNN_<slug>.sql` (NNNN รันเลข 4 หลัก) และต้องรันผ่าน `supabase db reset` โดยไม่ error

---

## โครงไฟล์

```
koh-payam-delivery/
  package.json
  vite.config.ts                 # + ตั้งค่า Vitest (test.environment = jsdom)
  tailwind.config.js
  postcss.config.js
  index.html
  .env.local                     # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (ไม่ commit)
  .env.example                   # ตัวอย่างคีย์ทั้งหมด (commit)
  src/
    main.tsx                     # bootstrap + Router
    App.tsx                      # นิยาม route ทั้งหมด + guard ตามบทบาท
    index.css                    # @tailwind base/components/utilities
    lib/
      supabase.ts                # สร้าง supabase client จาก env
      auth.tsx                   # AuthProvider + useAuth() (session, profile/role, signIn, signOut, MFA)
      roles.ts                   # ROLE, canAccess(route, role) — ตารางสิทธิ์
      format.ts                  # formatTHB(n), formatDateTH(iso), formatDateTimeTH(iso)
      credit.ts                  # computeCreditSummary(order, items, claims) — ใช้ร่วมทีม+ลูกค้า
      status.ts                  # ORDER_STATUS, nextStatus(), canTransition(from,to)
      image.ts                   # compressImage(file): Promise<Blob> ตาม Global Constraints
      import/
        parseMakroFile.ts        # อ่าน CSV/Excel → RawRow[]
        mapColumns.ts            # applyMapping(rows, mapping) → ParsedOrder[]; validateMapping()
      api/
        shipDays.ts              # getOrCreateShipDay, listOrdersForDay, setBoats
        orders.ts                # commitImport, getOrder, updateOrderStatus, regenTokenLink
        pack.ts                  # savePack(orderId, {items, paperCount, foamCount})
        claims.ts                # listClaims, getClaim, resolveClaim
        backorders.ts            # listBackordersForDay, markBackorderFulfilled
        photos.ts                # requestUploadUrl, attachEvidencePhoto
        audit.ts                 # logAction(action, entityType, entityId, meta?)
    components/
      ui/Button.tsx  Card.tsx  StatusBadge.tsx  Field.tsx  Spinner.tsx  ConfirmDialog.tsx
      AppShell.tsx               # sidebar/topbar + เมนูตามบทบาท
      PhotoCapture.tsx           # <input capture> + preview + compress + upload
      OrderStatusTimeline.tsx    # แสดง imported..shipped (ใช้ทั้งทีม+ลูกค้า)
      CreditSummaryTable.tsx     # แสดงผล computeCreditSummary (props เป็นตัวเลขล้วน)
    routes/
      team/
        Login.tsx
        DailyDashboard.tsx
        ImportOrders.tsx
        PackOrder.tsx
        BoatSetup.tsx
        PierLoad.tsx
        OrderDetail.tsx
        ClaimsQueue.tsx
        ClaimDetail.tsx
        LabelSheet.tsx           # หน้า print ใบเขียนหน้าลัง
      customer/
        i18n.ts                  # STRINGS.en / STRINGS.th
        CustomerOrderView.tsx    # /o/:token
        CustomerClaimForm.tsx    # ฟอร์มเคลมในหน้าเดียวกัน
    test/
      fixtures/makro-sample.csv  # ไฟล์ตัวอย่าง (ใส่หลังผู้ใช้ส่งไฟล์จริง; เริ่มด้วย mock)
      setup.ts                   # import '@testing-library/jest-dom'
  supabase/
    config.toml
    migrations/
      0001_core_tables.sql
      0002_rls.sql
      0003_helpers_triggers.sql
      0004_cron_cleanup.sql
    functions/
      _shared/cors.ts            # CORS header helper
      _shared/r2.ts              # presign PUT URL (S3 v4) สำหรับ R2
      order-view/index.ts        # token → JSON ออเดอร์ (sanitized)
      submit-claim/index.ts      # token + payload → สร้างเคลม (เช็คเดดไลน์)
      photo-upload-url/index.ts  # token|session → presigned R2 PUT URL
      cleanup/index.ts           # กวาดไฟล์ R2 ที่คิวไว้ว่าให้ลบ
  docs/
    superpowers/specs/2026-09-06-koh-payam-delivery-app-design.md
    superpowers/plans/2026-09-06-koh-payam-delivery-app.md
    user-guide-th.md             # คู่มือใช้งาน (Task 27)
    ops-runbook-th.md            # backup รายสัปดาห์ + แก้ปัญหา (Task 27)
  scripts/
    weekly-backup.sh             # pg_dump + คัดลอก R2 manifest (Task 27)
```

---

## ไมล์สโตน 0 — ตั้งโปรเจกต์และฐานข้อมูล

### Task 1: Scaffold โปรเจกต์ Vite + React + TS + Tailwind + Vitest

**Files:**
- Create: `koh-payam-delivery/package.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test/setup.ts`, `.env.example`, `.gitignore`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: —
- Produces: `App` (default export, React component) render `<div>` ที่มีข้อความ "Koh Payam Delivery"; สคริปต์ `npm test` (Vitest), `npm run dev`, `npm run build`

- [ ] **Step 1: สร้างโปรเจกต์**

```bash
cd "C:/Users/Peace/OneDrive/Desktop/Koh Payam"
npm create vite@latest koh-payam-delivery -- --template react-ts
cd koh-payam-delivery
npm install
npm install -D tailwindcss@3 postcss autoprefixer vitest@2 jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
npm install react-router-dom@6 @supabase/supabase-js@2 xlsx
npx tailwindcss init -p
```

- [ ] **Step 2: ตั้งค่า Tailwind**

`tailwind.config.js`:
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

`src/index.css` (แทนที่ทั้งไฟล์):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: ตั้งค่า Vitest ใน `vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
```

`src/test/setup.ts`:
```ts
import '@testing-library/jest-dom'
```

เพิ่มใน `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest"`

- [ ] **Step 4: เขียนเทสต์ที่ต้องล้มเหลวก่อน**

`src/App.test.tsx`:
```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

test('renders app name', () => {
  render(<App />)
  expect(screen.getByText(/Koh Payam Delivery/i)).toBeInTheDocument()
})
```

- [ ] **Step 5: รันเทสต์ ยืนยันว่าล้มเหลว**

Run: `npm test`
Expected: FAIL — `App` ยังเป็นเทมเพลตเดิม ไม่มีข้อความนี้

- [ ] **Step 6: เขียน `src/App.tsx` ให้ผ่าน**

```tsx
export default function App() {
  return <div className="p-6 text-lg font-semibold">Koh Payam Delivery</div>
}
```

`src/main.tsx`:
```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 7: รันเทสต์ ยืนยันผ่าน + build ผ่าน**

Run: `npm test && npm run build`
Expected: PASS ทั้งคู่

- [ ] **Step 8: `.gitignore` + `.env.example`**

`.gitignore` เพิ่ม: `node_modules`, `dist`, `.env.local`, `*.log`, `supabase/.branches`, `supabase/.temp`
`.env.example`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite react ts app with tailwind and vitest"
```

---

### Task 2: Supabase local + migration แรก (ตารางหลัก)

**Files:**
- Create: `supabase/config.toml` (จาก `supabase init`), `supabase/migrations/0001_core_tables.sql`
- Test: `supabase/tests/0001_schema.test.sql` (pgTAP) — ถ้า pgTAP ใช้ยาก ให้ใช้ Step ตรวจด้วย `psql` แทน (ระบุไว้ด้านล่าง)

**Interfaces:**
- Consumes: —
- Produces: ตาราง `profiles, ship_days, orders, order_items, boxes, evidence_photos, claims, claim_photos, backorders, audit_logs, r2_delete_queue` ใน schema `public`; enum `order_status, user_role, item_status, claim_type, claim_status, claim_resolution, backorder_reason, backorder_status`

- [ ] **Step 1: init Supabase**

```bash
cd koh-payam-delivery
npx supabase init
npx supabase start
```
(`supabase start` ต้องมี Docker; ถ้าเครื่องไม่มี Docker ให้ข้ามไปใช้ระบบ cloud project แล้วรัน migration ผ่าน `supabase db push` — บันทึกไว้ใน ops-runbook)

- [ ] **Step 2: เขียน `supabase/migrations/0001_core_tables.sql`**

```sql
-- enums
create type user_role as enum ('packer', 'pier', 'manager');
create type order_status as enum ('imported', 'packing', 'packed', 'at_pier', 'shipped');
create type item_status as enum ('ok', 'short');
create type claim_type as enum ('missing_in_box', 'damaged', 'box_lost');
create type claim_status as enum ('open', 'approved', 'rejected', 'closed');
create type claim_resolution as enum ('refund', 'resend_next_day');
create type backorder_reason as enum ('shortage', 'claim_resend');
create type backorder_status as enum ('pending', 'fulfilled');

-- team profiles (1:1 กับ auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role user_role not null default 'packer',
  created_at timestamptz not null default now()
);

create table ship_days (
  id uuid primary key default gen_random_uuid(),
  ship_date date not null unique,
  boats jsonb not null default '[{"id":"1","name":"เรือ 1"},{"id":"2","name":"เรือ 2"},{"id":"3","name":"เรือ 3"}]'::jsonb,
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  ship_day_id uuid not null references ship_days(id) on delete cascade,
  makro_order_no text not null,
  customer_name_en text not null,
  ship_date date not null,
  status order_status not null default 'imported',
  link_token text not null unique,
  boat_id text,
  paper_box_count int not null default 0 check (paper_box_count >= 0),
  foam_box_count int not null default 0 check (foam_box_count >= 0),
  total_value_cached numeric(12,2) not null default 0,
  packed_at timestamptz,
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  unique (ship_day_id, makro_order_no)
);
create index on orders (ship_date);
create index on orders (status);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_name text not null,
  qty_ordered numeric(12,3) not null,
  unit_price numeric(12,2) not null,
  status item_status not null default 'ok',
  qty_shipped numeric(12,3) not null default 0,
  line_no int not null
);
create index on order_items (order_id);

create table boxes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  box_type text not null check (box_type in ('paper','foam')),
  seq int not null,
  total int not null,
  unique (order_id, box_type, seq)
);

create table evidence_photos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  r2_key text not null,
  note text,
  taken_by uuid references profiles(id),
  taken_at timestamptz not null default now()
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  order_item_id uuid references order_items(id) on delete set null,
  box_seq int,
  type claim_type not null,
  qty numeric(12,3) not null default 1,
  description text not null default '',
  status claim_status not null default 'open',
  resolution claim_resolution,
  refund_amount numeric(12,2) not null default 0,
  deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_by uuid references profiles(id),
  resolved_at timestamptz
);
create index on claims (status);
create index on claims (order_id);

create table claim_photos (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  r2_key text not null,
  created_at timestamptz not null default now()
);

create table backorders (
  id uuid primary key default gen_random_uuid(),
  source_order_id uuid not null references orders(id) on delete cascade,
  reason backorder_reason not null,
  product_name text not null,
  qty numeric(12,3) not null,
  target_ship_date date,
  target_order_id uuid references orders(id) on delete set null,
  status backorder_status not null default 'pending',
  fulfilled_by uuid references profiles(id),
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);
create index on backorders (target_ship_date) where status = 'pending';
create index on backorders (source_order_id);

create table audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index on audit_logs (created_at);

create table r2_delete_queue (
  id bigint generated always as identity primary key,
  r2_key text not null,
  queued_at timestamptz not null default now()
);
```

- [ ] **Step 3: รัน reset ยืนยันว่า migration ผ่าน**

Run: `npx supabase db reset`
Expected: จบด้วย `Finished supabase db reset` ไม่มี ERROR

- [ ] **Step 4: ตรวจว่าตารางครบด้วย psql**

Run:
```bash
npx supabase db reset
psql "$(npx supabase status -o json | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).DB_URL))')" -c "\dt public.*"
```
Expected: เห็นตารางทั้ง 11 ตัว

(ทางเลือกถ้า psql ไม่สะดวก: `npx supabase db reset` แล้วเปิด Studio ที่ `http://localhost:54323` ตรวจด้วยตา — บันทึกผลใน commit message)

- [ ] **Step 5: Commit**

```bash
git add supabase
git commit -m "feat: add core database schema (migration 0001)"
```

---

### Task 3: RLS + helper (บทบาท, ทริกเกอร์เดดไลน์เคลม, สร้างกล่อง)

**Files:**
- Create: `supabase/migrations/0002_rls.sql`, `supabase/migrations/0003_helpers_triggers.sql`

**Interfaces:**
- Consumes: ตารางจาก Task 2
- Produces:
  - ฟังก์ชัน `public.current_role() returns user_role` (อ่านจาก `profiles` ของ `auth.uid()`)
  - ฟังก์ชัน `public.is_manager() returns boolean`
  - ทริกเกอร์ `orders_set_shipped_at` — เมื่อ `status` เปลี่ยนเป็น `shipped` และ `shipped_at is null` ให้เซ็ต `shipped_at = now()`
  - ทริกเกอร์ `orders_regen_boxes` — เมื่อ `paper_box_count`/`foam_box_count` เปลี่ยน ให้ลบแถว `boxes` เดิมของออเดอร์แล้วสร้างใหม่ 1..N ต่อชนิด
  - RLS: ทุกตารางเปิด `enable row level security`; policy `authenticated` select ได้ทุกแถว; insert/update/delete ตามบทบาท (ดูโค้ด); ไม่มี policy สำหรับ `anon`

- [ ] **Step 1: เขียน `0002_rls.sql`**

```sql
alter table profiles           enable row level security;
alter table ship_days          enable row level security;
alter table orders             enable row level security;
alter table order_items        enable row level security;
alter table boxes              enable row level security;
alter table evidence_photos    enable row level security;
alter table claims             enable row level security;
alter table claim_photos       enable row level security;
alter table backorders         enable row level security;
alter table audit_logs         enable row level security;
alter table r2_delete_queue    enable row level security;

create or replace function public.current_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_manager() returns boolean
language sql stable as $$ select public.current_role() = 'manager' $$;

-- ทุกคนที่ล็อกอินอ่านได้ทั้งหมด (ทีมสาขาเล็ก ไม่ต้องแยกข้อมูลรายคน)
create policy team_read_profiles on profiles for select to authenticated using (true);
create policy self_update_profile on profiles for update to authenticated using (id = auth.uid());

create policy team_read on ship_days       for select to authenticated using (true);
create policy team_read on orders          for select to authenticated using (true);
create policy team_read on order_items     for select to authenticated using (true);
create policy team_read on boxes           for select to authenticated using (true);
create policy team_read on evidence_photos for select to authenticated using (true);
create policy team_read on claims          for select to authenticated using (true);
create policy team_read on claim_photos    for select to authenticated using (true);
create policy team_read on backorders      for select to authenticated using (true);
create policy team_read on audit_logs      for select to authenticated using (true);

-- เขียน: ทุก authenticated เขียนงานประจำวันได้ (import/pack/pier)
create policy team_write on ship_days       for all to authenticated using (true) with check (true);
create policy team_write on orders          for all to authenticated using (true) with check (true);
create policy team_write on order_items     for all to authenticated using (true) with check (true);
create policy team_write on boxes           for all to authenticated using (true) with check (true);
create policy team_write on evidence_photos for all to authenticated using (true) with check (true);
create policy team_write on backorders      for all to authenticated using (true) with check (true);
create policy team_write on audit_logs      for insert to authenticated with check (true);

-- เคลม: ทีมสร้าง/อ่านได้; อนุมัติ (เปลี่ยน status เป็น approved/rejected/closed) เฉพาะ manager
create policy claims_insert on claims for insert to authenticated with check (true);
create policy claims_update_manager on claims for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- r2_delete_queue: เขียนโดย authenticated, อ่าน/ลบโดย service role เท่านั้น (ไม่มี policy select)
create policy queue_insert on r2_delete_queue for insert to authenticated with check (true);
```

> หมายเหตุบทบาทละเอียด (packer เข้าไม่ถึง pier ฯลฯ) บังคับที่ชั้น UI ผ่าน `src/lib/roles.ts` (Task 6); ชั้น DB ให้ทุก authenticated เขียนงานประจำวันได้เพื่อความเรียบง่ายและกันงานสะดุดหน้างาน — บันทึกการตัดสินใจนี้ไว้ใน commit message

- [ ] **Step 2: เขียน `0003_helpers_triggers.sql`**

```sql
create or replace function public.tg_orders_set_shipped_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'shipped' and old.status is distinct from 'shipped' and new.shipped_at is null then
    new.shipped_at := now();
  end if;
  if new.status = 'packed' and old.status is distinct from 'packed' and new.packed_at is null then
    new.packed_at := now();
  end if;
  return new;
end $$;

create trigger orders_set_shipped_at before update on orders
for each row execute function public.tg_orders_set_shipped_at();

create or replace function public.tg_orders_regen_boxes() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.paper_box_count = old.paper_box_count
     and new.foam_box_count = old.foam_box_count then
    return new;
  end if;
  delete from boxes where order_id = new.id;
  insert into boxes (order_id, box_type, seq, total)
    select new.id, 'paper', g, new.paper_box_count
    from generate_series(1, new.paper_box_count) g
  union all
    select new.id, 'foam', g, new.foam_box_count
    from generate_series(1, new.foam_box_count) g;
  return new;
end $$;

create trigger orders_regen_boxes after insert or update of paper_box_count, foam_box_count on orders
for each row execute function public.tg_orders_regen_boxes();
```

- [ ] **Step 3: รัน reset**

Run: `npx supabase db reset`
Expected: ไม่มี ERROR

- [ ] **Step 4: ทดสอบทริกเกอร์กล่องด้วย SQL**

Run:
```bash
psql "<DB_URL>" <<'SQL'
insert into ship_days (ship_date) values ('2026-10-01');
insert into orders (ship_day_id, makro_order_no, customer_name_en, ship_date, link_token, paper_box_count, foam_box_count)
  select id, 'PO-1', 'TEST RESORT', '2026-10-01', 'tok_test_1', 3, 2 from ship_days where ship_date='2026-10-01';
select box_type, count(*) from boxes group by box_type order by box_type;
SQL
```
Expected: `foam | 2` และ `paper | 3`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat: add RLS policies and helper triggers (migrations 0002-0003)"
```

---

## ไมล์สโตน 1 — Auth, บทบาท, โครงหน้าจอ

### Task 4: Supabase client + AuthProvider + หน้า Login

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/auth.tsx`, `src/routes/team/Login.tsx`
- Modify: `src/App.tsx` (เพิ่ม Router + route `/login`)
- Test: `src/lib/auth.test.tsx`

**Interfaces:**
- Consumes: env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Produces:
  - `supabase` (ค่า client จาก `createClient`)
  - `AuthProvider` (React component, ครอบทั้งแอป)
  - `useAuth(): { session: Session|null, profile: {id,name,role}|null, loading: boolean, signIn(email,password): Promise<{error?:string}>, signOut(): Promise<void> }`

- [ ] **Step 1: `src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string
if (!url || !anon) throw new Error('ยังไม่ได้ตั้งค่า VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')

export const supabase = createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true },
})
```

- [ ] **Step 2: เขียนเทสต์ที่ต้องล้มเหลวก่อน**

`src/lib/auth.test.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { AuthProvider, useAuth } from './auth'

vi.mock('./supabase', () => {
  const listeners: any[] = []
  return {
    supabase: {
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn((cb) => {
          listeners.push(cb)
          return { data: { subscription: { unsubscribe: vi.fn() } } }
        }),
        signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    },
  }
})

function Probe() {
  const { loading, session } = useAuth()
  return <div>{loading ? 'loading' : session ? 'in' : 'out'}</div>
}

test('resolves to logged-out state when no session', async () => {
  render(<AuthProvider><Probe /></AuthProvider>)
  await waitFor(() => expect(screen.getByText('out')).toBeInTheDocument())
})
```

- [ ] **Step 3: รันเทสต์ ยืนยันล้มเหลว**

Run: `npm test -- auth`
Expected: FAIL — ยังไม่มี `./auth`

- [ ] **Step 4: เขียน `src/lib/auth.tsx`**

```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

type Profile = { id: string; name: string; role: 'packer' | 'pier' | 'manager' }
type AuthValue = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<{ error?: string }>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId: string) {
    const { data } = await supabase.from('profiles').select('id,name,role').eq('id', userId).single()
    setProfile((data as Profile) ?? null)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) loadProfile(data.session.user.id).finally(() => setLoading(false))
      else setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) loadProfile(s.user.id)
      else setProfile(null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signIn: AuthValue['signIn'] = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error ? { error: error.message } : {}
  }
  const signOut = async () => { await supabase.auth.signOut() }

  return <Ctx.Provider value={{ session, profile, loading, signIn, signOut }}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth ต้องอยู่ใน <AuthProvider>')
  return v
}
```

- [ ] **Step 5: เขียน `src/routes/team/Login.tsx`**

```tsx
import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'

export default function Login() {
  const { signIn } = useAuth()
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState<string>()
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setErr(undefined)
    const { error } = await signIn(email, password)
    setBusy(false)
    if (error) setErr('เข้าสู่ระบบไม่สำเร็จ: ' + error)
    else nav('/')
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto mt-24 flex w-80 flex-col gap-3">
      <h1 className="text-xl font-semibold">เข้าสู่ระบบทีมงาน</h1>
      <input className="rounded border p-2" placeholder="อีเมล" value={email}
             onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
      <input className="rounded border p-2" placeholder="รหัสผ่าน" type="password" value={password}
             onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="rounded bg-black p-2 text-white disabled:opacity-50" disabled={busy}>
        {busy ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
      </button>
    </form>
  )
}
```

- [ ] **Step 6: ต่อ Router ใน `src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import Login from './routes/team/Login'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
```

> เทสต์ `App.test.tsx` จาก Task 1 จะพังเพราะข้อความเปลี่ยน — แก้ให้เช็ก `/เข้าสู่ระบบทีมงาน/` แทน และ mock `./lib/supabase` แบบเดียวกับ Step 2

- [ ] **Step 7: รันเทสต์ทั้งหมด**

Run: `npm test`
Expected: PASS ทุกไฟล์

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add supabase client, auth provider, and team login"
```

---

### Task 5: เปิด 2FA (TOTP) — สมัครและยืนยันตอนล็อกอิน

**Files:**
- Create: `src/routes/team/TwoFactorSetup.tsx`, `src/routes/team/TwoFactorChallenge.tsx`, `src/lib/mfa.ts`
- Modify: `src/lib/auth.tsx` (เพิ่ม `aal: 'aal1'|'aal2'|null` ใน context), `src/App.tsx` (route `/2fa/setup`, `/2fa`)
- Test: `src/lib/mfa.test.ts`

**Interfaces:**
- Consumes: `supabase.auth.mfa.*`
- Produces:
  - `src/lib/mfa.ts`: `enrollTotp(): Promise<{ factorId: string; qrSvg: string; secret: string }>`, `verifyEnroll(factorId, code): Promise<{error?:string}>`, `challengeAndVerify(factorId, code): Promise<{error?:string}>`, `listFactors(): Promise<{ totp: {id:string,status:string}[] }>`
  - `useAuth()` เพิ่มฟิลด์ `needsMfaSetup: boolean` (ล็อกอินแล้วแต่ยังไม่มี factor verified) และ `needsMfaChallenge: boolean` (มี factor แต่ session ยัง `aal1`)

- [ ] **Step 1: เขียนเทสต์ `src/lib/mfa.test.ts` (ต้องล้มเหลว)**

```ts
import { enrollTotp } from './mfa'

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      mfa: {
        enroll: vi.fn().mockResolvedValue({
          data: { id: 'f1', totp: { qr_code: '<svg/>', secret: 'ABC123' } }, error: null,
        }),
      },
    },
  },
}))

test('enrollTotp returns factor id, qr, secret', async () => {
  const r = await enrollTotp()
  expect(r).toEqual({ factorId: 'f1', qrSvg: '<svg/>', secret: 'ABC123' })
})
```

- [ ] **Step 2: รัน ยืนยันล้มเหลว**

Run: `npm test -- mfa`
Expected: FAIL — ไม่มี `./mfa`

- [ ] **Step 3: เขียน `src/lib/mfa.ts`**

```ts
import { supabase } from './supabase'

export async function enrollTotp() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (error || !data) throw new Error(error?.message ?? 'สมัคร 2FA ไม่สำเร็จ')
  return { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret }
}

export async function verifyEnroll(factorId: string, code: string) {
  const ch = await supabase.auth.mfa.challenge({ factorId })
  if (ch.error) return { error: ch.error.message }
  const v = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code })
  return v.error ? { error: v.error.message } : {}
}

export const challengeAndVerify = verifyEnroll

export async function listFactors() {
  const { data } = await supabase.auth.mfa.listFactors()
  return { totp: (data?.totp ?? []).map((f) => ({ id: f.id, status: f.status })) }
}
```

- [ ] **Step 4: เพิ่ม aal ใน `auth.tsx`**

ใน `AuthProvider` เพิ่ม:
```tsx
const [aal, setAal] = useState<'aal1' | 'aal2' | null>(null)
// หลัง setSession ทุกครั้ง:
supabase.auth.mfa.getAuthenticatorAssuranceLevel().then(({ data }) => setAal(data?.currentLevel ?? null))
```
และคำนวณ:
```tsx
const verifiedTotp = /* เรียก listFactors() ใน effect, เก็บใน state factors */
const needsMfaSetup = !!session && factors.length === 0
const needsMfaChallenge = !!session && factors.length > 0 && aal === 'aal1'
```
เพิ่มทั้งสองค่าเข้า context value

- [ ] **Step 5: เขียนหน้า Setup + Challenge**

`TwoFactorSetup.tsx` — เรียก `enrollTotp()` แสดง `qrSvg` (ผ่าน `dangerouslySetInnerHTML`) + ช่องกรอกรหัส 6 หลัก → `verifyEnroll` → สำเร็จ `nav('/')`
`TwoFactorChallenge.tsx` — `listFactors()` เอา `totp[0].id` → ช่องกรอกรหัส → `challengeAndVerify` → สำเร็จ `nav('/')`
(ทั้งสองหน้าใช้ layout เดียวกับ `Login.tsx` — ปุ่ม/อินพุตคลาส Tailwind เดียวกัน; ข้อความไทย)

- [ ] **Step 6: ต่อ guard ใน `App.tsx`**

เพิ่มคอมโพเนนต์ `RequireAuth`:
```tsx
function RequireAuth({ children }: { children: JSX.Element }) {
  const { loading, session, needsMfaSetup, needsMfaChallenge } = useAuth()
  if (loading) return <div className="p-6">กำลังโหลด…</div>
  if (!session) return <Navigate to="/login" replace />
  if (needsMfaSetup) return <Navigate to="/2fa/setup" replace />
  if (needsMfaChallenge) return <Navigate to="/2fa" replace />
  return children
}
```
route `*` เดิมเปลี่ยนเป็น `<RequireAuth><AppShell /></RequireAuth>` (AppShell มาใน Task 6 — ชั่วคราวใส่ `<div>ok</div>`)

- [ ] **Step 7: รันเทสต์**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add TOTP two-factor enrollment and login challenge"
```

---

### Task 6: AppShell + เมนูตามบทบาท + ตารางสิทธิ์

**Files:**
- Create: `src/lib/roles.ts`, `src/components/AppShell.tsx`, `src/components/ui/Button.tsx`, `src/components/ui/Card.tsx`, `src/components/ui/StatusBadge.tsx`, `src/components/ui/Spinner.tsx`
- Modify: `src/App.tsx` (route ย่อยของทีมทั้งหมด, ใส่ placeholder หน้าแต่ละอัน)
- Test: `src/lib/roles.test.ts`, `src/components/AppShell.test.tsx`

**Interfaces:**
- Consumes: `useAuth().profile.role`
- Produces:
  - `src/lib/roles.ts`: `type Role = 'packer'|'pier'|'manager'`; `NAV: { path: string; label: string; roles: Role[] }[]`; `canAccess(path: string, role: Role): boolean`
  - `AppShell` (React component) — แสดง topbar (ชื่อผู้ใช้ + ปุ่มออกจากระบบ) + เมนูซ้ายจาก `NAV` กรองด้วย `canAccess` + `<Outlet/>`

- [ ] **Step 1: เขียนเทสต์ `src/lib/roles.test.ts`**

```ts
import { canAccess } from './roles'

test('packer cannot access pier', () => {
  expect(canAccess('/pier', 'packer')).toBe(false)
})
test('pier can access pier and dashboard', () => {
  expect(canAccess('/pier', 'pier')).toBe(true)
  expect(canAccess('/', 'pier')).toBe(true)
})
test('manager can access everything in NAV', () => {
  expect(canAccess('/claims', 'manager')).toBe(true)
  expect(canAccess('/import', 'manager')).toBe(true)
})
```

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- roles` — Expected: FAIL

- [ ] **Step 3: เขียน `src/lib/roles.ts`**

```ts
export type Role = 'packer' | 'pier' | 'manager'

export const NAV: { path: string; label: string; roles: Role[] }[] = [
  { path: '/',        label: 'งานวันนี้',        roles: ['packer', 'pier', 'manager'] },
  { path: '/import',  label: 'นำเข้าออเดอร์',     roles: ['packer', 'manager'] },
  { path: '/boats',   label: 'ตั้งค่าเรือวันนี้', roles: ['pier', 'manager'] },
  { path: '/pier',    label: 'ที่ท่าเรือ',        roles: ['pier', 'manager'] },
  { path: '/claims',  label: 'คิวเคลม',          roles: ['manager'] },
]

export function canAccess(path: string, role: Role): boolean {
  const item = NAV.find((n) => n.path === path)
  if (!item) return true // หน้ารายละเอียด (เช่น /order/:id) เปิดให้ทุกบทบาทที่ล็อกอิน
  return item.roles.includes(role)
}
```

- [ ] **Step 4: เขียน `src/components/ui/*`** — คอมโพเนนต์เล็ก ๆ:

```tsx
// Button.tsx
export function Button(p: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={'rounded bg-black px-3 py-2 text-white disabled:opacity-50 ' + (p.className ?? '')} />
}
// Card.tsx
export function Card(p: React.PropsWithChildren<{ className?: string }>) {
  return <div className={'rounded-lg border bg-white p-4 shadow-sm ' + (p.className ?? '')}>{p.children}</div>
}
// StatusBadge.tsx
const LABEL: Record<string, string> = {
  imported: 'นำเข้าแล้ว', packing: 'กำลังแพ็ค', packed: 'แพ็คเสร็จ', at_pier: 'ถึงท่าเรือ', shipped: 'ส่งแล้ว',
}
export function StatusBadge({ status }: { status: string }) {
  return <span className="rounded-full border px-2 py-0.5 text-xs">{LABEL[status] ?? status}</span>
}
// Spinner.tsx
export function Spinner() { return <div className="animate-pulse text-sm text-gray-500">กำลังโหลด…</div> }
```

- [ ] **Step 5: เขียน `src/components/AppShell.tsx`**

```tsx
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { NAV, canAccess } from '../lib/roles'

export default function AppShell() {
  const { profile, signOut } = useAuth()
  const role = profile?.role ?? 'packer'
  return (
    <div className="flex min-h-screen">
      <aside className="w-48 border-r bg-gray-50 p-3">
        <nav className="flex flex-col gap-1">
          {NAV.filter((n) => canAccess(n.path, role)).map((n) => (
            <NavLink key={n.path} to={n.path} end
              className={({ isActive }) => 'rounded px-2 py-1 text-sm ' + (isActive ? 'bg-black text-white' : 'hover:bg-gray-200')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b px-4 py-2">
          <span className="text-sm text-gray-600">{profile?.name} · {role}</span>
          <button className="text-sm underline" onClick={signOut}>ออกจากระบบ</button>
        </header>
        <main className="p-4"><Outlet /></main>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: เขียนเทสต์ `AppShell.test.tsx`** — mock `useAuth` ให้ role `packer` แล้ว assert ว่าไม่เห็นลิงก์ "คิวเคลม" แต่เห็น "งานวันนี้"

```tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppShell from './AppShell'

vi.mock('../lib/auth', () => ({
  useAuth: () => ({ profile: { name: 'ก', role: 'packer' }, signOut: vi.fn() }),
}))

test('packer sees dashboard but not claims queue', () => {
  render(<MemoryRouter><AppShell /></MemoryRouter>)
  expect(screen.getByText('งานวันนี้')).toBeInTheDocument()
  expect(screen.queryByText('คิวเคลม')).not.toBeInTheDocument()
})
```

- [ ] **Step 7: ต่อ route ทีมใน `App.tsx`** — ภายใต้ `<RequireAuth>` ใช้ `<AppShell/>` เป็น layout, route ลูก: `/` `DailyDashboard`, `/import` `ImportOrders`, `/boats` `BoatSetup`, `/pier` `PierLoad`, `/claims` `ClaimsQueue`, `/claims/:id` `ClaimDetail`, `/order/:id` `OrderDetail`, `/order/:id/pack` `PackOrder`, `/order/:id/label` `LabelSheet`. ตอนนี้ทุกหน้าทำเป็น placeholder `export default function X(){return <div>X</div>}` — จะเติมใน Task ถัด ๆ ไป. เพิ่ม guard ต่อบทบาทในแต่ละ route ลูกด้วย wrapper `<RequireRole path="/import">`:

```tsx
function RequireRole({ path, children }: { path: string; children: JSX.Element }) {
  const { profile } = useAuth()
  if (profile && !canAccess(path, profile.role)) return <Navigate to="/" replace />
  return children
}
```

- [ ] **Step 8: รันเทสต์ + build**

Run: `npm test && npm run build`
Expected: PASS + build สำเร็จ

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add app shell, role-based nav, and ui primitives"
```

---

## ไมล์สโตน 2 — นำเข้าออเดอร์จากไฟล์แม็คโคร

> **หมายเหตุก่อนเริ่ม:** โครงคอลัมน์จริงของไฟล์แม็คโครยังไม่ทราบ (spec หัวข้อ 15) — ทำ Task 7–8 ให้ยืดหยุ่นด้วยระบบ "จับคู่คอลัมน์" ที่ผู้ใช้เลือกเองครั้งแรกแล้วจำไว้ ใช้ไฟล์ fixture สมมติไปก่อน เมื่อผู้ใช้ส่งไฟล์จริงให้แทนที่ `src/test/fixtures/makro-sample.csv` และปรับ default mapping

### Task 7: `parseMakroFile` — อ่าน CSV/Excel เป็นแถวดิบ

**Files:**
- Create: `src/lib/import/parseMakroFile.ts`, `src/test/fixtures/makro-sample.csv`
- Test: `src/lib/import/parseMakroFile.test.ts`

**Interfaces:**
- Consumes: `xlsx` (SheetJS)
- Produces: `parseMakroFile(file: File | ArrayBuffer): Promise<RawRow[]>` โดย `type RawRow = Record<string, string>` (key = header ตามไฟล์, value = string trim แล้ว); export `type RawRow`

- [ ] **Step 1: สร้าง fixture `src/test/fixtures/makro-sample.csv`**

```csv
Order No,Customer,Product,Qty,Unit Price
PO-1001,BLUE VIEW RESORT,ข้าวหอมมะลิ 5kg,10,255.00
PO-1001,BLUE VIEW RESORT,น้ำมันพืช 1L,24,52.50
PO-1002,PAYAM BEACH CAFE,นมข้นหวาน,48,21.00
```

- [ ] **Step 2: เขียนเทสต์ (ต้องล้มเหลว)**

```ts
import { readFileSync } from 'node:fs'
import { parseMakroFile } from './parseMakroFile'

test('parses csv rows keyed by header', async () => {
  const buf = readFileSync('src/test/fixtures/makro-sample.csv')
  const rows = await parseMakroFile(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  expect(rows).toHaveLength(3)
  expect(rows[0]).toMatchObject({ 'Order No': 'PO-1001', Customer: 'BLUE VIEW RESORT', Qty: '10' })
})
```

- [ ] **Step 3: รัน ยืนยันล้มเหลว** — Run: `npm test -- parseMakroFile` — Expected: FAIL

- [ ] **Step 4: เขียน `parseMakroFile.ts`**

```ts
import * as XLSX from 'xlsx'

export type RawRow = Record<string, string>

export async function parseMakroFile(input: File | ArrayBuffer): Promise<RawRow[]> {
  const buf = input instanceof File ? await input.arrayBuffer() : input
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
  return json.map((r) => {
    const out: RawRow = {}
    for (const [k, v] of Object.entries(r)) out[String(k).trim()] = String(v ?? '').trim()
    return out
  })
}
```

- [ ] **Step 5: รันเทสต์ ยืนยันผ่าน** — Run: `npm test -- parseMakroFile` — Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add makro file parser (csv/xlsx to raw rows)"
```

---

### Task 8: `mapColumns` — จับคู่คอลัมน์เป็น ParsedOrder[]

**Files:**
- Create: `src/lib/import/mapColumns.ts`
- Test: `src/lib/import/mapColumns.test.ts`

**Interfaces:**
- Consumes: `RawRow` จาก Task 7
- Produces:
  - `type ColumnMapping = { orderNo: string; customer: string; product: string; qty: string; unitPrice: string }` (ค่าคือชื่อ header ในไฟล์)
  - `type ParsedItem = { productName: string; qtyOrdered: number; unitPrice: number; lineNo: number }`
  - `type ParsedOrder = { makroOrderNo: string; customerNameEn: string; items: ParsedItem[]; totalValue: number }`
  - `DEFAULT_MAPPING: ColumnMapping` (เดาจาก fixture: `{orderNo:'Order No',customer:'Customer',product:'Product',qty:'Qty',unitPrice:'Unit Price'}`)
  - `validateMapping(headers: string[], m: ColumnMapping): string[]` — คืน list ปัญหา (ภาษาไทย); ว่าง = ผ่าน
  - `applyMapping(rows: RawRow[], m: ColumnMapping): ParsedOrder[]` — จัดกลุ่มตาม orderNo, รวม items, คำนวณ `totalValue = Σ qtyOrdered*unitPrice` (ปัดทศนิยม 2), เรียง lineNo ตามลำดับที่เจอ

- [ ] **Step 1: เขียนเทสต์ (ต้องล้มเหลว)**

```ts
import { applyMapping, validateMapping, DEFAULT_MAPPING } from './mapColumns'

const rows = [
  { 'Order No': 'PO-1', Customer: 'A RESORT', Product: 'rice', Qty: '2', 'Unit Price': '100' },
  { 'Order No': 'PO-1', Customer: 'A RESORT', Product: 'oil', Qty: '3', 'Unit Price': '50.5' },
  { 'Order No': 'PO-2', Customer: 'B CAFE', Product: 'milk', Qty: '1', 'Unit Price': '20' },
]

test('validateMapping flags missing header', () => {
  const problems = validateMapping(['Order No', 'Customer'], DEFAULT_MAPPING)
  expect(problems.length).toBeGreaterThan(0)
})

test('applyMapping groups by order and sums totals', () => {
  const orders = applyMapping(rows, DEFAULT_MAPPING)
  expect(orders).toHaveLength(2)
  const po1 = orders.find((o) => o.makroOrderNo === 'PO-1')!
  expect(po1.items).toHaveLength(2)
  expect(po1.totalValue).toBe(351.5) // 2*100 + 3*50.5
  expect(po1.customerNameEn).toBe('A RESORT')
})

test('applyMapping rejects rows with non-numeric qty', () => {
  const bad = [{ 'Order No': 'PO-3', Customer: 'C', Product: 'x', Qty: 'abc', 'Unit Price': '1' }]
  expect(() => applyMapping(bad, DEFAULT_MAPPING)).toThrow(/PO-3/)
})
```

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- mapColumns` — Expected: FAIL

- [ ] **Step 3: เขียน `mapColumns.ts`**

```ts
import type { RawRow } from './parseMakroFile'

export type ColumnMapping = {
  orderNo: string; customer: string; product: string; qty: string; unitPrice: string
}
export type ParsedItem = { productName: string; qtyOrdered: number; unitPrice: number; lineNo: number }
export type ParsedOrder = {
  makroOrderNo: string; customerNameEn: string; items: ParsedItem[]; totalValue: number
}

export const DEFAULT_MAPPING: ColumnMapping = {
  orderNo: 'Order No', customer: 'Customer', product: 'Product', qty: 'Qty', unitPrice: 'Unit Price',
}

const FIELD_LABELS: Record<keyof ColumnMapping, string> = {
  orderNo: 'เลขที่คำสั่งซื้อ', customer: 'ชื่อลูกค้า (อังกฤษ)', product: 'ชื่อสินค้า',
  qty: 'จำนวน', unitPrice: 'ราคาต่อหน่วย',
}

export function validateMapping(headers: string[], m: ColumnMapping): string[] {
  const set = new Set(headers)
  const problems: string[] = []
  for (const key of Object.keys(m) as (keyof ColumnMapping)[]) {
    if (!m[key]) problems.push(`ยังไม่ได้เลือกคอลัมน์สำหรับ "${FIELD_LABELS[key]}"`)
    else if (!set.has(m[key])) problems.push(`ไม่พบคอลัมน์ "${m[key]}" ในไฟล์ (สำหรับ ${FIELD_LABELS[key]})`)
  }
  return problems
}

function num(v: string, ctx: string): number {
  const n = Number(String(v).replace(/,/g, ''))
  if (!Number.isFinite(n)) throw new Error(`ค่าตัวเลขไม่ถูกต้องที่ ${ctx}: "${v}"`)
  return n
}
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function applyMapping(rows: RawRow[], m: ColumnMapping): ParsedOrder[] {
  const byOrder = new Map<string, ParsedOrder>()
  rows.forEach((r, i) => {
    const orderNo = r[m.orderNo]?.trim()
    if (!orderNo) return // ข้ามแถวว่าง
    const customer = r[m.customer]?.trim() ?? ''
    const qty = num(r[m.qty], `ออเดอร์ ${orderNo} แถว ${i + 1} (จำนวน)`)
    const price = num(r[m.unitPrice], `ออเดอร์ ${orderNo} แถว ${i + 1} (ราคา)`)
    let o = byOrder.get(orderNo)
    if (!o) { o = { makroOrderNo: orderNo, customerNameEn: customer, items: [], totalValue: 0 }; byOrder.set(orderNo, o) }
    o.items.push({ productName: r[m.product]?.trim() ?? '', qtyOrdered: qty, unitPrice: price, lineNo: o.items.length + 1 })
  })
  const orders = [...byOrder.values()]
  for (const o of orders) o.totalValue = round2(o.items.reduce((s, it) => s + it.qtyOrdered * it.unitPrice, 0))
  return orders
}
```

- [ ] **Step 4: รันเทสต์ ยืนยันผ่าน** — Run: `npm test -- mapColumns` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add column mapping and order grouping for import"
```

---

### Task 9: หน้า ImportOrders — อัปโหลด, จับคู่คอลัมน์, พรีวิว, ตรวจซ้ำ

**Files:**
- Create: `src/routes/team/ImportOrders.tsx`
- Modify: `src/App.tsx` (แทน placeholder `/import`)
- Test: `src/routes/team/ImportOrders.test.tsx`

**Interfaces:**
- Consumes: `parseMakroFile`, `applyMapping`, `validateMapping`, `DEFAULT_MAPPING`, `commitImport` (Task 10)
- Produces: UI ที่: (1) เลือกไฟล์ → parse → เก็บ `headers` + `rows`; (2) ฟอร์ม `<select>` 5 อันให้จับคู่คอลัมน์ (ค่าเริ่ม `DEFAULT_MAPPING`, บันทึกลง `localStorage['makro_mapping']`); (3) ปุ่ม "ดูตัวอย่าง" → `applyMapping` แสดงตารางสรุป (เลขออเดอร์, ลูกค้า, #รายการ, มูลค่ารวม); (4) เรียก `commitImport(shipDate, orders)` ที่คืน `{ created, overwrites }`; ถ้ามี `overwrites` แสดง `ConfirmDialog` ก่อนเรียกซ้ำด้วย `{ force: true }`

- [ ] **Step 1: เขียนเทสต์ (mock api + parser)**

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImportOrders from './ImportOrders'

vi.mock('../../lib/import/parseMakroFile', () => ({
  parseMakroFile: vi.fn().mockResolvedValue([
    { 'Order No': 'PO-1', Customer: 'A', Product: 'x', Qty: '2', 'Unit Price': '100' },
  ]),
}))
const commitImport = vi.fn().mockResolvedValue({ created: 1, overwrites: [] })
vi.mock('../../lib/api/orders', () => ({ commitImport: (...a: unknown[]) => commitImport(...a) }))

test('shows preview after choosing a file and mapping defaults resolve', async () => {
  render(<ImportOrders />)
  const file = new File(['dummy'], 'makro.csv', { type: 'text/csv' })
  await userEvent.upload(screen.getByLabelText(/เลือกไฟล์/i), file)
  await userEvent.click(await screen.findByRole('button', { name: /ดูตัวอย่าง/i }))
  expect(await screen.findByText('PO-1')).toBeInTheDocument()
})
```

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- ImportOrders` — Expected: FAIL

- [ ] **Step 3: เขียน `ImportOrders.tsx`** (โครงหลัก)

```tsx
import { useMemo, useState } from 'react'
import { parseMakroFile, type RawRow } from '../../lib/import/parseMakroFile'
import { applyMapping, validateMapping, DEFAULT_MAPPING, type ColumnMapping, type ParsedOrder } from '../../lib/import/mapColumns'
import { commitImport } from '../../lib/api/orders'
import { Button } from '../../components/ui/Button'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { formatTHB } from '../../lib/format'

const todayISO = () => new Date().toISOString().slice(0, 10)
function loadMapping(): ColumnMapping {
  try { return { ...DEFAULT_MAPPING, ...JSON.parse(localStorage.getItem('makro_mapping') || '{}') } }
  catch { return DEFAULT_MAPPING }
}

export default function ImportOrders() {
  const [rows, setRows] = useState<RawRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>(loadMapping)
  const [shipDate, setShipDate] = useState(todayISO())
  const [preview, setPreview] = useState<ParsedOrder[] | null>(null)
  const [pendingForce, setPendingForce] = useState<ParsedOrder[] | null>(null)
  const [result, setResult] = useState<string>()
  const [error, setError] = useState<string>()

  const problems = useMemo(() => (headers.length ? validateMapping(headers, mapping) : []), [headers, mapping])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]; if (!f) return
    setError(undefined); setResult(undefined); setPreview(null)
    const parsed = await parseMakroFile(f)
    setRows(parsed)
    setHeaders(parsed.length ? Object.keys(parsed[0]) : [])
  }

  function doPreview() {
    setError(undefined)
    try { setPreview(applyMapping(rows, mapping)) }
    catch (e) { setError((e as Error).message) }
  }

  function saveMapping(next: ColumnMapping) {
    setMapping(next); localStorage.setItem('makro_mapping', JSON.stringify(next))
  }

  async function doImport(force: boolean) {
    if (!preview) return
    setError(undefined)
    try {
      const r = await commitImport(shipDate, preview, { force })
      if (r.overwrites.length && !force) { setPendingForce(preview); return }
      setResult(`นำเข้าสำเร็จ ${r.created} ออเดอร์` + (force ? ` (ทับของเดิม ${r.overwrites.length})` : ''))
      setPendingForce(null)
    } catch (e) { setError((e as Error).message) }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">นำเข้าออเดอร์</h1>
      <label className="text-sm">วันจัดส่ง <input type="date" className="rounded border p-1" value={shipDate} onChange={(e) => setShipDate(e.target.value)} /></label>
      <label className="text-sm">เลือกไฟล์จากแม็คโคร (CSV/Excel)
        <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} className="block" />
      </label>

      {headers.length > 0 && (
        <fieldset className="grid grid-cols-2 gap-2 rounded border p-3">
          <legend className="text-sm font-medium">จับคู่คอลัมน์</legend>
          {(Object.keys(DEFAULT_MAPPING) as (keyof ColumnMapping)[]).map((k) => (
            <label key={k} className="text-sm">{k}
              <select className="block w-full rounded border p-1" value={mapping[k]}
                onChange={(e) => saveMapping({ ...mapping, [k]: e.target.value })}>
                <option value="">— เลือก —</option>
                {headers.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          ))}
        </fieldset>
      )}

      {problems.length > 0 && <ul className="text-sm text-red-600">{problems.map((p) => <li key={p}>• {p}</li>)}</ul>}
      {headers.length > 0 && problems.length === 0 &&
        <Button onClick={doPreview}>ดูตัวอย่าง</Button>}

      {preview && (
        <>
          <table className="w-full text-sm">
            <thead><tr className="text-left"><th>เลขออเดอร์</th><th>ลูกค้า</th><th>#รายการ</th><th>มูลค่ารวม</th></tr></thead>
            <tbody>{preview.map((o) => (
              <tr key={o.makroOrderNo}><td>{o.makroOrderNo}</td><td>{o.customerNameEn}</td><td>{o.items.length}</td><td>{formatTHB(o.totalValue)}</td></tr>
            ))}</tbody>
          </table>
          <Button onClick={() => doImport(false)}>นำเข้า {preview.length} ออเดอร์</Button>
        </>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && <p className="text-sm text-green-700">{result}</p>}

      {pendingForce && (
        <ConfirmDialog
          title="มีออเดอร์ซ้ำกับที่นำเข้าแล้ว"
          body={`ออเดอร์ต่อไปนี้จะถูกเขียนทับ: ${/* รายการจาก commitImport */ ''}ยืนยันหรือไม่`}
          confirmLabel="ทับของเดิม"
          onConfirm={() => doImport(true)}
          onCancel={() => setPendingForce(null)}
        />
      )}
    </div>
  )
}
```

> `ConfirmDialog` (สร้างใน `src/components/ui/ConfirmDialog.tsx` ใน Task นี้): props `{ title, body, confirmLabel, onConfirm, onCancel }` — modal ง่าย ๆ ด้วย `fixed inset-0 bg-black/40` + กล่องขาวตรงกลาง 2 ปุ่ม
> รายชื่อออเดอร์ที่จะถูกทับ: เก็บจากผลลัพธ์ `commitImport(..., {force:false})` (`r.overwrites` เป็น `string[]` ของเลขออเดอร์) ใน state แล้วแสดงใน body

- [ ] **Step 4: รันเทสต์ ยืนยันผ่าน** — Run: `npm test -- ImportOrders` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add import screen with column mapping, preview, overwrite guard"
```

---

### Task 10: `commitImport` — เขียน ship_day + orders + order_items + สร้าง token

**Files:**
- Create: `src/lib/api/orders.ts` (ฟังก์ชัน `commitImport`, `getOrder`, `updateOrderStatus`, `regenTokenLink`), `src/lib/api/shipDays.ts` (`getOrCreateShipDay`), `src/lib/token.ts` (`makeLinkToken`)
- Test: `src/lib/api/orders.test.ts`, `src/lib/token.test.ts`

**Interfaces:**
- Consumes: `supabase`, `ParsedOrder`
- Produces:
  - `makeLinkToken(): string` — `'o_' + 32 hex` จาก `crypto.getRandomValues`
  - `getOrCreateShipDay(shipDate: string): Promise<{ id: string; boats: {id:string;name:string}[] }>`
  - `commitImport(shipDate: string, orders: ParsedOrder[], opts?: { force?: boolean }): Promise<{ created: number; overwrites: string[] }>`
    - หา orders ที่ `makro_order_no` ซ้ำใน ship_day เดียวกัน → ถ้ามีและ `!force` → คืน `{ created: 0, overwrites: [...เลข] }` โดยไม่เขียนอะไร
    - ถ้า `force` → ลบ orders เดิมที่ซ้ำ (cascade ลบ items/boxes) แล้วสร้างใหม่ทั้งชุด
    - แต่ละ order: insert `orders` (status `imported`, `link_token = makeLinkToken()`, `total_value_cached = o.totalValue`, `ship_date = shipDate`) + bulk insert `order_items`
  - `updateOrderStatus(orderId: string, next: OrderStatus): Promise<void>` — เช็ก `canTransition` ก่อน (Task 12 ใช้), throw ถ้าผิด
  - `regenTokenLink(orderId: string): Promise<string>` — สร้าง token ใหม่ คืนค่า (ปุ่ม "ส่งลิงก์ซ้ำ")

- [ ] **Step 1: เทสต์ `src/lib/token.test.ts`**

```ts
import { makeLinkToken } from './token'
test('token is prefixed and unique-ish', () => {
  const a = makeLinkToken(), b = makeLinkToken()
  expect(a).toMatch(/^o_[0-9a-f]{32}$/)
  expect(a).not.toBe(b)
})
```

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- token` — Expected: FAIL

- [ ] **Step 3: เขียน `src/lib/token.ts`**

```ts
export function makeLinkToken(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return 'o_' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}
```

- [ ] **Step 4: เทสต์ `src/lib/api/orders.test.ts`** — mock `supabase` แบบ query-builder ที่จำ state; อย่างน้อย 2 เคส:
  - `commitImport` เมื่อไม่มีของซ้ำ → `created === orders.length`, `overwrites === []`, และมีการเรียก insert `orders` + `order_items`
  - `commitImport` เมื่อมี makro_order_no ซ้ำและ `force` ไม่ตั้ง → `created === 0`, `overwrites` มีเลขนั้น, ไม่มีการเรียก insert

```ts
import { commitImport } from './orders'

const state = { existing: [] as any[], inserted: [] as any[], deleted: [] as any[] }
vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: state.existing, error: null }) }) }),
      insert: (rows: any) => { state.inserted.push({ table, rows }); return { select: () => ({ data: [].concat(rows), error: null }) } },
      delete: () => ({ in: (col: string, vals: any[]) => { state.deleted.push({ table, vals }); return Promise.resolve({ error: null }) } }),
      upsert: (rows: any) => { state.inserted.push({ table, rows }); return Promise.resolve({ data: rows, error: null }) },
    }),
  },
}))
vi.mock('./shipDays', () => ({ getOrCreateShipDay: vi.fn().mockResolvedValue({ id: 'sd1', boats: [] }) }))

const orders = [{ makroOrderNo: 'PO-1', customerNameEn: 'A', totalValue: 100, items: [{ productName: 'x', qtyOrdered: 1, unitPrice: 100, lineNo: 1 }] }]

beforeEach(() => { state.existing = []; state.inserted = []; state.deleted = [] })

test('fresh import creates orders', async () => {
  const r = await commitImport('2026-10-01', orders as any)
  expect(r).toEqual({ created: 1, overwrites: [] })
  expect(state.inserted.some((i) => i.table === 'orders')).toBe(true)
})

test('duplicate without force does not write', async () => {
  state.existing = [{ id: 'old1', makro_order_no: 'PO-1' }]
  const r = await commitImport('2026-10-01', orders as any)
  expect(r).toEqual({ created: 0, overwrites: ['PO-1'] })
  expect(state.inserted.length).toBe(0)
})
```

- [ ] **Step 5: รัน ยืนยันล้มเหลว** — Run: `npm test -- api/orders` — Expected: FAIL

- [ ] **Step 6: เขียน `src/lib/api/shipDays.ts` + `src/lib/api/orders.ts`**

`shipDays.ts`:
```ts
import { supabase } from '../supabase'

export async function getOrCreateShipDay(shipDate: string) {
  const { data: found } = await supabase.from('ship_days').select('id,boats').eq('ship_date', shipDate).maybeSingle()
  if (found) return found as { id: string; boats: { id: string; name: string }[] }
  const { data, error } = await supabase.from('ship_days').insert({ ship_date: shipDate }).select('id,boats').single()
  if (error) throw new Error('สร้างรอบจัดส่งไม่สำเร็จ: ' + error.message)
  return data as { id: string; boats: { id: string; name: string }[] }
}

export async function setBoats(shipDayId: string, boats: { id: string; name: string }[]) {
  const { error } = await supabase.from('ship_days').update({ boats }).eq('id', shipDayId)
  if (error) throw new Error('บันทึกรายการเรือไม่สำเร็จ: ' + error.message)
}
```

`orders.ts`:
```ts
import { supabase } from '../supabase'
import { getOrCreateShipDay } from './shipDays'
import { makeLinkToken } from '../token'
import type { ParsedOrder } from '../import/mapColumns'
import { canTransition, type OrderStatus } from '../status'

export async function commitImport(
  shipDate: string, orders: ParsedOrder[], opts: { force?: boolean } = {},
): Promise<{ created: number; overwrites: string[] }> {
  const day = await getOrCreateShipDay(shipDate)
  const nos = orders.map((o) => o.makroOrderNo)
  const { data: existing } = await supabase
    .from('orders').select('id,makro_order_no').eq('ship_day_id', day.id).in('makro_order_no', nos)
  const dupNos = (existing ?? []).map((r: any) => r.makro_order_no)

  if (dupNos.length && !opts.force) return { created: 0, overwrites: dupNos }
  if (dupNos.length && opts.force) {
    await supabase.from('orders').delete().in('id', (existing ?? []).map((r: any) => r.id))
  }

  let created = 0
  for (const o of orders) {
    const { data: ins, error } = await supabase.from('orders').insert({
      ship_day_id: day.id, makro_order_no: o.makroOrderNo, customer_name_en: o.customerNameEn,
      ship_date: shipDate, link_token: makeLinkToken(), total_value_cached: o.totalValue,
    }).select('id').single()
    if (error) throw new Error(`สร้างออเดอร์ ${o.makroOrderNo} ไม่สำเร็จ: ${error.message}`)
    const orderId = (ins as any).id
    const items = o.items.map((it) => ({
      order_id: orderId, product_name: it.productName, qty_ordered: it.qtyOrdered,
      unit_price: it.unitPrice, line_no: it.lineNo,
    }))
    const { error: e2 } = await supabase.from('order_items').insert(items)
    if (e2) throw new Error(`สร้างรายการของ ${o.makroOrderNo} ไม่สำเร็จ: ${e2.message}`)
    created++
  }
  return { created, overwrites: opts.force ? dupNos : [] }
}

export async function getOrder(orderId: string) {
  const { data, error } = await supabase.from('orders')
    .select('*, order_items(*), boxes(*), evidence_photos(*), claims(*)')
    .eq('id', orderId).single()
  if (error) throw new Error('โหลดออเดอร์ไม่สำเร็จ: ' + error.message)
  return data
}

export async function updateOrderStatus(orderId: string, next: OrderStatus) {
  const { data: cur, error } = await supabase.from('orders').select('status').eq('id', orderId).single()
  if (error) throw new Error(error.message)
  if (!canTransition((cur as any).status, next)) throw new Error(`เปลี่ยนสถานะจาก ${(cur as any).status} เป็น ${next} ไม่ได้`)
  const { error: e2 } = await supabase.from('orders').update({ status: next }).eq('id', orderId)
  if (e2) throw new Error(e2.message)
}

export async function regenTokenLink(orderId: string): Promise<string> {
  const token = makeLinkToken()
  const { error } = await supabase.from('orders').update({ link_token: token }).eq('id', orderId)
  if (error) throw new Error('สร้างลิงก์ใหม่ไม่สำเร็จ: ' + error.message)
  return token
}
```

`src/lib/status.ts`:
```ts
export const ORDER_STATUS = ['imported', 'packing', 'packed', 'at_pier', 'shipped'] as const
export type OrderStatus = (typeof ORDER_STATUS)[number]

const FORWARD: Record<OrderStatus, OrderStatus[]> = {
  imported: ['packing'],
  packing: ['packed'],
  packed: ['packing', 'at_pier'], // ย้อนกลับได้ถ้ายังไม่ at_pier
  at_pier: ['shipped'],
  shipped: [],
}
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return FORWARD[from]?.includes(to) ?? false
}
export function nextStatus(from: OrderStatus): OrderStatus | null {
  const fwd = FORWARD[from].filter((s) => ORDER_STATUS.indexOf(s) > ORDER_STATUS.indexOf(from))
  return fwd[0] ?? null
}
```

`src/lib/format.ts`:
```ts
export const formatTHB = (n: number) =>
  new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n)
export const formatDateTH = (iso: string) =>
  new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium' }).format(new Date(iso))
export const formatDateTimeTH = (iso: string) =>
  new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
```

- [ ] **Step 7: รันเทสต์ทั้งหมด** — Run: `npm test` — Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add commitImport, order status machine, ship day api, formatters"
```

---

## ไมล์สโตน 3 — แดชบอร์ดรายวัน

### Task 11: DailyDashboard — รายการออเดอร์ + ตัวนับสถานะ + ค้นหา + realtime

**Files:**
- Create: `src/routes/team/DailyDashboard.tsx`
- Modify: `src/lib/api/shipDays.ts` (เพิ่ม `listOrdersForDay`)
- Test: `src/routes/team/DailyDashboard.test.tsx`, `src/lib/api/shipDays.test.ts`

**Interfaces:**
- Consumes: `supabase`
- Produces:
  - `listOrdersForDay(shipDate: string): Promise<OrderRow[]>` โดย `type OrderRow = { id: string; makro_order_no: string; customer_name_en: string; status: OrderStatus; boat_id: string|null; paper_box_count: number; foam_box_count: number; total_value_cached: number }`
  - หน้า: ตัวเลือกวัน (ค่าเริ่ม = วันนี้), แถวสรุป `แพ็คแล้ว X/N · ถึงท่าเรือ Y · ส่งแล้ว Z`, ช่องค้นหา (กรองด้วยชื่อลูกค้า/เลขออเดอร์แบบ client-side), ตารางออเดอร์ลิงก์ไป `/order/:id`, subscribe realtime `postgres_changes` บนตาราง `orders` filter `ship_date=eq.<date>` แล้ว refetch

- [ ] **Step 1: เทสต์ `shipDays.test.ts` — `listOrdersForDay` ส่ง query ถูก table/filter**

```ts
import { listOrdersForDay } from './shipDays'
const eq = vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null })
const select = vi.fn().mockReturnValue({ eq })
vi.mock('../supabase', () => ({ supabase: { from: vi.fn().mockReturnValue({ select: (...a: any) => select(...a) }) } }))

test('queries orders by ship_date', async () => {
  const rows = await listOrdersForDay('2026-10-01')
  expect(select).toHaveBeenCalled()
  expect(eq).toHaveBeenCalledWith('ship_date', '2026-10-01')
  expect(rows).toEqual([{ id: '1' }])
})
```

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- shipDays` — Expected: FAIL

- [ ] **Step 3: เพิ่ม `listOrdersForDay` ใน `shipDays.ts`**

```ts
export async function listOrdersForDay(shipDate: string) {
  const { data, error } = await supabase.from('orders')
    .select('id,makro_order_no,customer_name_en,status,boat_id,paper_box_count,foam_box_count,total_value_cached')
    .eq('ship_date', shipDate)
  if (error) throw new Error('โหลดรายการออเดอร์ไม่สำเร็จ: ' + error.message)
  return (data ?? []) as any[]
}
```

- [ ] **Step 4: เทสต์หน้า `DailyDashboard.test.tsx`** — mock `listOrdersForDay` คืน 3 แถว (2 packed, 1 shipped) + mock `supabase.channel` เป็น no-op → assert แสดง "แพ็คแล้ว 2/3" และค้นหา "BLUE" กรองเหลือแถวที่ตรง

```tsx
vi.mock('../../lib/api/shipDays', () => ({
  listOrdersForDay: vi.fn().mockResolvedValue([
    { id: '1', makro_order_no: 'PO-1', customer_name_en: 'BLUE VIEW', status: 'packed', boat_id: null, paper_box_count: 2, foam_box_count: 0, total_value_cached: 100 },
    { id: '2', makro_order_no: 'PO-2', customer_name_en: 'PAYAM CAFE', status: 'packed', boat_id: null, paper_box_count: 1, foam_box_count: 1, total_value_cached: 50 },
    { id: '3', makro_order_no: 'PO-3', customer_name_en: 'SUNSET', status: 'shipped', boat_id: '1', paper_box_count: 3, foam_box_count: 0, total_value_cached: 80 },
  ]),
}))
vi.mock('../../lib/supabase', () => ({ supabase: { channel: () => ({ on: () => ({ subscribe: () => ({}) }), unsubscribe: vi.fn() }), removeChannel: vi.fn() } }))
```

- [ ] **Step 5: รัน ยืนยันล้มเหลว** — Run: `npm test -- DailyDashboard` — Expected: FAIL

- [ ] **Step 6: เขียน `DailyDashboard.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { listOrdersForDay } from '../../lib/api/shipDays'
import { supabase } from '../../lib/supabase'
import { StatusBadge } from '../../components/ui/StatusBadge'
import { Spinner } from '../../components/ui/Spinner'
import { formatTHB } from '../../lib/format'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function DailyDashboard() {
  const [date, setDate] = useState(todayISO())
  const [rows, setRows] = useState<any[] | null>(null)
  const [q, setQ] = useState('')

  async function load() { setRows(await listOrdersForDay(date)) }

  useEffect(() => {
    load()
    const ch = supabase.channel('orders-' + date)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `ship_date=eq.${date}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date])

  const counts = useMemo(() => {
    const r = rows ?? []
    return {
      total: r.length,
      packed: r.filter((o) => ['packed', 'at_pier', 'shipped'].includes(o.status)).length,
      atPier: r.filter((o) => ['at_pier', 'shipped'].includes(o.status)).length,
      shipped: r.filter((o) => o.status === 'shipped').length,
    }
  }, [rows])

  const filtered = useMemo(() => {
    const r = rows ?? []
    const s = q.trim().toLowerCase()
    return s ? r.filter((o) => o.customer_name_en.toLowerCase().includes(s) || o.makro_order_no.toLowerCase().includes(s)) : r
  }, [rows, q])

  if (!rows) return <Spinner />
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">งานวันนี้</h1>
        <input type="date" className="rounded border p-1" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <p className="text-sm text-gray-600">
        แพ็คแล้ว {counts.packed}/{counts.total} · ถึงท่าเรือ {counts.atPier} · ส่งแล้ว {counts.shipped}
      </p>
      <input placeholder="ค้นหาชื่อลูกค้า / เลขออเดอร์" className="rounded border p-2"
        value={q} onChange={(e) => setQ(e.target.value)} />
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th>เลขออเดอร์</th><th>ลูกค้า</th><th>สถานะ</th><th>ลัง</th><th>เรือ</th><th>มูลค่า</th></tr></thead>
        <tbody>
          {filtered.map((o) => (
            <tr key={o.id} className="border-t">
              <td><Link className="underline" to={`/order/${o.id}`}>{o.makro_order_no}</Link></td>
              <td>{o.customer_name_en}</td>
              <td><StatusBadge status={o.status} /></td>
              <td>{o.paper_box_count + o.foam_box_count}</td>
              <td>{o.boat_id ?? '—'}</td>
              <td>{formatTHB(o.total_value_cached)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 7: รันเทสต์ทั้งหมด + build** — Run: `npm test && npm run build` — Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add daily dashboard with status counts, search, realtime refresh"
```

---

## ไมล์สโตน 4 — หน้าแพ็ค, ของขาด → backorder, ใบเขียนหน้าลัง

### Task 12: `savePack` + หน้า PackOrder

**Files:**
- Create: `src/lib/api/pack.ts`, `src/routes/team/PackOrder.tsx`
- Modify: `src/App.tsx` (แทน placeholder `/order/:id/pack`)
- Test: `src/lib/api/pack.test.ts`, `src/routes/team/PackOrder.test.tsx`

**Interfaces:**
- Consumes: `supabase`, `updateOrderStatus`
- Produces:
  - `type PackInput = { orderId: string; items: { id: string; status: 'ok' | 'short'; qtyShipped: number }[]; paperCount: number; foamCount: number }`
  - `savePack(input: PackInput): Promise<{ shortageValue: number }>`:
    1. bulk update `order_items` (status, qty_shipped) ทีละแถว
    2. update `orders` set `paper_box_count`, `foam_box_count` (ทริกเกอร์สร้าง `boxes` เอง)
    3. คำนวณ `shortageValue = Σ (unit_price * qty_ordered)` เฉพาะ item ที่ `status='short'` — คืนค่า
    4. เรียก `syncShortageBackorders(orderId)` (Task 13)
    5. ถ้าออเดอร์ยัง `imported`/`packing` → `updateOrderStatus(orderId, 'packing')` แล้ว (เมื่อผู้ใช้กด "แพ็คเสร็จ" ในหน้า) หน้าจะเรียก `updateOrderStatus(orderId,'packed')` แยก
  - `computeShortageValue(items: {unit_price:number; qty_ordered:number; status:string}[]): number` (export, ใช้ในเทสต์และหน้า)

- [ ] **Step 1: เทสต์ `pack.test.ts`**

```ts
import { computeShortageValue } from './pack'
test('sums only short lines', () => {
  const v = computeShortageValue([
    { unit_price: 100, qty_ordered: 2, status: 'short' },
    { unit_price: 50, qty_ordered: 3, status: 'ok' },
    { unit_price: 10, qty_ordered: 5, status: 'short' },
  ])
  expect(v).toBe(250) // 100*2 + 10*5
})
```

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- api/pack` — Expected: FAIL

- [ ] **Step 3: เขียน `src/lib/api/pack.ts`**

```ts
import { supabase } from '../supabase'
import { syncShortageBackorders } from './backorders'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function computeShortageValue(
  items: { unit_price: number; qty_ordered: number; status: string }[],
): number {
  return round2(items.filter((i) => i.status === 'short').reduce((s, i) => s + i.unit_price * i.qty_ordered, 0))
}

export type PackInput = {
  orderId: string
  items: { id: string; status: 'ok' | 'short'; qtyShipped: number }[]
  paperCount: number
  foamCount: number
}

export async function savePack(input: PackInput): Promise<{ shortageValue: number }> {
  for (const it of input.items) {
    const { error } = await supabase.from('order_items')
      .update({ status: it.status, qty_shipped: it.qtyShipped }).eq('id', it.id)
    if (error) throw new Error('บันทึกรายการไม่สำเร็จ: ' + error.message)
  }
  const { error: e2 } = await supabase.from('orders')
    .update({ paper_box_count: input.paperCount, foam_box_count: input.foamCount, status: 'packing' })
    .eq('id', input.orderId).in('status', ['imported', 'packing'])
  if (e2) throw new Error('บันทึกจำนวนลังไม่สำเร็จ: ' + e2.message)

  const { data: rows } = await supabase.from('order_items')
    .select('unit_price,qty_ordered,status').eq('order_id', input.orderId)
  const shortageValue = computeShortageValue((rows ?? []) as any)
  await syncShortageBackorders(input.orderId)
  return { shortageValue }
}
```

- [ ] **Step 4: เทสต์หน้า `PackOrder.test.tsx`** — mock `getOrder` คืนออเดอร์ 2 รายการ + mock `savePack`; จำลองผู้ใช้ติ๊ก "ของขาด" รายการแรก, กรอกลังกระดาษ 3, กด "บันทึก" → assert `savePack` ถูกเรียกด้วย items ที่รายการแรก `status:'short'` และ `paperCount:3`

- [ ] **Step 5: รัน ยืนยันล้มเหลว** — Run: `npm test -- PackOrder` — Expected: FAIL

- [ ] **Step 6: เขียน `PackOrder.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getOrder, updateOrderStatus } from '../../lib/api/orders'
import { savePack, computeShortageValue } from '../../lib/api/pack'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'
import { formatTHB } from '../../lib/format'

type ItemState = { id: string; product_name: string; qty_ordered: number; unit_price: number; status: 'ok' | 'short' }

export default function PackOrder() {
  const { id } = useParams()
  const [order, setOrder] = useState<any>(null)
  const [items, setItems] = useState<ItemState[]>([])
  const [paper, setPaper] = useState(0)
  const [foam, setFoam] = useState(0)
  const [msg, setMsg] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getOrder(id!).then((o) => {
      setOrder(o)
      setItems(o.order_items.map((it: any) => ({ ...it, status: it.status })))
      setPaper(o.paper_box_count); setFoam(o.foam_box_count)
    })
  }, [id])

  if (!order) return <Spinner />
  const shortageValue = computeShortageValue(items.map((i) => ({ unit_price: i.unit_price, qty_ordered: i.qty_ordered, status: i.status })))

  async function save(markPacked: boolean) {
    setBusy(true); setMsg(undefined)
    try {
      await savePack({
        orderId: id!, paperCount: paper, foamCount: foam,
        items: items.map((i) => ({ id: i.id, status: i.status, qtyShipped: i.status === 'short' ? 0 : i.qty_ordered })),
      })
      if (markPacked) await updateOrderStatus(id!, 'packed')
      setMsg(markPacked ? 'บันทึกและทำเครื่องหมายแพ็คเสร็จแล้ว' : 'บันทึกแล้ว')
    } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">แพ็ค · {order.makro_order_no} · {order.customer_name_en}</h1>
      <table className="w-full text-sm">
        <thead><tr className="text-left"><th>สินค้า</th><th>สั่ง</th><th>ราคา/หน่วย</th><th>ของขาด</th></tr></thead>
        <tbody>
          {items.map((it, idx) => (
            <tr key={it.id} className="border-t">
              <td>{it.product_name}</td><td>{it.qty_ordered}</td><td>{formatTHB(it.unit_price)}</td>
              <td><input type="checkbox" checked={it.status === 'short'}
                onChange={(e) => setItems((s) => s.map((x, i) => i === idx ? { ...x, status: e.target.checked ? 'short' : 'ok' } : x))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-4 text-sm">
        <label>ลังกระดาษ <input type="number" min={0} className="w-16 rounded border p-1" value={paper} onChange={(e) => setPaper(+e.target.value)} /></label>
        <label>ลังโฟม <input type="number" min={0} className="w-16 rounded border p-1" value={foam} onChange={(e) => setFoam(+e.target.value)} /></label>
      </div>
      <p className="text-sm text-amber-700">มูลค่าของขาด: {formatTHB(shortageValue)}</p>
      <div className="flex gap-2">
        <Button onClick={() => save(false)} disabled={busy}>บันทึก</Button>
        <Button onClick={() => save(true)} disabled={busy}>บันทึก + แพ็คเสร็จ</Button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  )
}
```

- [ ] **Step 7: รันเทสต์ทั้งหมด** — Run: `npm test` — Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add pack screen with shortage marking and box counts"
```

---

### Task 13: Backorder อัตโนมัติจากของขาด + API รายการค้างส่ง

**Files:**
- Create: `src/lib/api/backorders.ts`
- Modify: `src/routes/team/PackOrder.tsx` (แสดงกล่อง "ของค้างส่งจากออเดอร์ก่อนหน้า" ถ้ามี), `src/routes/team/DailyDashboard.tsx` (แถบเตือน "มีของค้างส่ง N รายการรอวันนี้")
- Test: `src/lib/api/backorders.test.ts`

**Interfaces:**
- Consumes: `supabase`
- Produces:
  - `syncShortageBackorders(orderId: string): Promise<void>` — ลบ backorder เดิมของออเดอร์นี้ที่ `reason='shortage'` และ `status='pending'` ทั้งหมด แล้วสร้างใหม่ 1 แถวต่อ order_item ที่ `status='short'` โดย `target_ship_date = null` (ยังไม่ผูกวัน), `qty = qty_ordered`
  - `createResendBackorder(claimId: string): Promise<void>` — (Task 22 เรียก) สร้าง backorder `reason='claim_resend'` จาก claim (product จาก order_item ที่อ้าง, `qty = claim.qty`)
  - `linkBackordersToDay(shipDate: string): Promise<number>` — หา order ที่ ship_date = วันนั้น จับคู่ backorder ที่ `status='pending'` และ (`target_ship_date is null` หรือ `= shipDate`) ที่ลูกค้าตรงกัน (`source_order.customer_name_en == order.customer_name_en`) → เซ็ต `target_order_id`, `target_ship_date = shipDate`; คืนจำนวนที่ผูกได้ — **เรียกอัตโนมัติท้าย `commitImport`**
  - `listBackordersForDay(shipDate: string): Promise<BackorderRow[]>`
  - `markBackorderFulfilled(id: string): Promise<void>` — set `status='fulfilled'`, `fulfilled_at=now()`, `fulfilled_by=auth.uid()`

- [ ] **Step 1: เทสต์ `backorders.test.ts`** — mock supabase query-builder แบบจำ state; เคส:
  - `syncShortageBackorders` ลบของเดิมแล้ว insert 1 แถวต่อ short item
  - `linkBackordersToDay` ผูกเฉพาะ backorder ที่ลูกค้าตรงและยังไม่ผูกวัน

```ts
import { syncShortageBackorders } from './backorders'
const calls: any[] = []
vi.mock('../supabase', () => ({
  supabase: {
    from: (t: string) => ({
      select: () => ({ eq: () => Promise.resolve({ data: [
        { id: 'i1', product_name: 'rice', qty_ordered: 2, status: 'short' },
        { id: 'i2', product_name: 'oil', qty_ordered: 1, status: 'ok' },
      ], error: null }) }),
      delete: () => ({ eq: () => ({ eq: () => { calls.push(['delete', t]); return Promise.resolve({ error: null }) } }) }),
      insert: (rows: any) => { calls.push(['insert', t, rows]); return Promise.resolve({ error: null }) },
    }),
  },
}))
test('creates one backorder per short item', async () => {
  await syncShortageBackorders('ord1')
  const ins = calls.find((c) => c[0] === 'insert')
  expect(ins[2]).toHaveLength(1)
  expect(ins[2][0]).toMatchObject({ product_name: 'rice', qty: 2, reason: 'shortage', status: 'pending' })
})
```

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- api/backorders` — Expected: FAIL

- [ ] **Step 3: เขียน `src/lib/api/backorders.ts`**

```ts
import { supabase } from '../supabase'

export type BackorderRow = {
  id: string; source_order_id: string; reason: 'shortage' | 'claim_resend'
  product_name: string; qty: number; target_ship_date: string | null
  target_order_id: string | null; status: 'pending' | 'fulfilled'
}

export async function syncShortageBackorders(orderId: string): Promise<void> {
  const { data: items } = await supabase.from('order_items')
    .select('id,product_name,qty_ordered,status').eq('order_id', orderId)
  await supabase.from('backorders').delete().eq('source_order_id', orderId).eq('reason', 'shortage')
  const shorts = (items ?? []).filter((i: any) => i.status === 'short')
  if (!shorts.length) return
  const rows = shorts.map((i: any) => ({
    source_order_id: orderId, reason: 'shortage', product_name: i.product_name,
    qty: i.qty_ordered, status: 'pending', target_ship_date: null,
  }))
  const { error } = await supabase.from('backorders').insert(rows)
  if (error) throw new Error('สร้างรายการค้างส่งไม่สำเร็จ: ' + error.message)
}

export async function createResendBackorder(claimId: string): Promise<void> {
  const { data: c } = await supabase.from('claims')
    .select('order_id,qty,order_item_id, order_items(product_name)').eq('id', claimId).single()
  if (!c) throw new Error('ไม่พบเคลม')
  const product = (c as any).order_items?.product_name ?? 'ไม่ระบุสินค้า'
  const { error } = await supabase.from('backorders').insert({
    source_order_id: (c as any).order_id, reason: 'claim_resend', product_name: product,
    qty: (c as any).qty, status: 'pending', target_ship_date: null,
  })
  if (error) throw new Error('สร้างรายการส่งชดเชยไม่สำเร็จ: ' + error.message)
}

export async function linkBackordersToDay(shipDate: string): Promise<number> {
  const { data: orders } = await supabase.from('orders')
    .select('id,customer_name_en').eq('ship_date', shipDate)
  const { data: pend } = await supabase.from('backorders')
    .select('id,source_order_id,target_ship_date, orders!backorders_source_order_id_fkey(customer_name_en)')
    .eq('status', 'pending')
  let linked = 0
  for (const b of pend ?? []) {
    if ((b as any).target_ship_date && (b as any).target_ship_date !== shipDate) continue
    const cust = (b as any).orders?.customer_name_en
    const match = (orders ?? []).find((o: any) => o.customer_name_en === cust)
    if (!match) continue
    const { error } = await supabase.from('backorders')
      .update({ target_order_id: (match as any).id, target_ship_date: shipDate }).eq('id', (b as any).id)
    if (!error) linked++
  }
  return linked
}

export async function listBackordersForDay(shipDate: string): Promise<BackorderRow[]> {
  const { data, error } = await supabase.from('backorders')
    .select('id,source_order_id,reason,product_name,qty,target_ship_date,target_order_id,status')
    .eq('target_ship_date', shipDate).eq('status', 'pending')
  if (error) throw new Error('โหลดรายการค้างส่งไม่สำเร็จ: ' + error.message)
  return (data ?? []) as BackorderRow[]
}

export async function markBackorderFulfilled(id: string): Promise<void> {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('backorders')
    .update({ status: 'fulfilled', fulfilled_at: new Date().toISOString(), fulfilled_by: u.user?.id })
    .eq('id', id)
  if (error) throw new Error('อัปเดตรายการค้างส่งไม่สำเร็จ: ' + error.message)
}
```

- [ ] **Step 4: ต่อ `linkBackordersToDay` ท้าย `commitImport`** — ใน `orders.ts` หลัง loop สร้างออเดอร์ ก่อน `return`:

```ts
import { linkBackordersToDay } from './backorders'
// ...
await linkBackordersToDay(shipDate)
return { created, overwrites: opts.force ? dupNos : [] }
```
(อัปเดตเทสต์ `api/orders.test.ts` ให้ mock `./backorders` เพิ่ม `linkBackordersToDay: vi.fn().mockResolvedValue(0)`)

- [ ] **Step 5: แสดงผลในหน้า** — `DailyDashboard`: เรียก `listBackordersForDay(date)` แสดงแถบเหลือง "มีของค้างส่ง N รายการรอส่งวันนี้" ลิงก์ไปออเดอร์ปลายทาง. `PackOrder`: query `backorders` ที่ `target_order_id = id` และ `status='pending'` แสดงกล่อง "ของค้างส่งจากออเดอร์ก่อนหน้า: <product> x<qty>" พร้อมปุ่ม "ส่งแล้ว" → `markBackorderFulfilled`

- [ ] **Step 6: รันเทสต์ทั้งหมด** — Run: `npm test` — Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: auto-create and link backorders from shortages"
```

---

### Task 14: LabelSheet — หน้า print ใบเขียนหน้าลัง

**Files:**
- Create: `src/routes/team/LabelSheet.tsx`, `src/routes/team/LabelSheet.css`
- Modify: `src/App.tsx` (แทน placeholder `/order/:id/label`), `src/routes/team/OrderDetail.tsx` (ปุ่ม "ใบเขียนหน้าลัง")
- Test: `src/routes/team/LabelSheet.test.tsx`

**Interfaces:**
- Consumes: `getOrder`
- Produces: หน้า A4 แนวตั้งที่แสดง ต่อออเดอร์: ชื่ออังกฤษตัวใหญ่ (`text-4xl font-bold uppercase`), เลขออเดอร์, วันจัดส่ง, และรายการบรรทัด "เขียนหน้าลัง: 1/N ... N/N" แยกกระดาษ/โฟม; ปุ่ม "สั่งพิมพ์" เรียก `window.print()`; `@media print` ซ่อนทุกอย่างยกเว้น `.label-sheet`

- [ ] **Step 1: เทสต์ `LabelSheet.test.tsx`** — mock `getOrder` (paper 3, foam 2, customer "BLUE VIEW") → assert เห็น "BLUE VIEW", "1/3", "3/3", "1/2", "2/2"

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- LabelSheet` — Expected: FAIL

- [ ] **Step 3: เขียน `LabelSheet.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getOrder } from '../../lib/api/orders'
import { Spinner } from '../../components/ui/Spinner'
import { formatDateTH } from '../../lib/format'
import './LabelSheet.css'

const seqLines = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}/${n}`)

export default function LabelSheet() {
  const { id } = useParams()
  const [o, setO] = useState<any>(null)
  useEffect(() => { getOrder(id!).then(setO) }, [id])
  if (!o) return <Spinner />
  return (
    <div>
      <button className="no-print rounded bg-black px-3 py-2 text-white" onClick={() => window.print()}>สั่งพิมพ์</button>
      <div className="label-sheet">
        <p className="text-4xl font-bold uppercase">{o.customer_name_en}</p>
        <p className="mt-2 text-lg">ออเดอร์ {o.makro_order_no} · ส่ง {formatDateTH(o.ship_date)}</p>
        <div className="mt-4 text-xl">
          <p className="font-semibold">ลังกระดาษ ({o.paper_box_count})</p>
          <p>{seqLines(o.paper_box_count).join('   ')}</p>
          <p className="mt-2 font-semibold">ลังโฟม ({o.foam_box_count})</p>
          <p>{seqLines(o.foam_box_count).join('   ')}</p>
        </div>
      </div>
    </div>
  )
}
```

`LabelSheet.css`:
```css
@media print {
  body * { visibility: hidden; }
  .label-sheet, .label-sheet * { visibility: visible; }
  .label-sheet { position: absolute; inset: 0; padding: 2cm; }
  .no-print { display: none; }
}
```

- [ ] **Step 4: รันเทสต์ทั้งหมด + build** — Run: `npm test && npm run build` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add printable box-label worksheet per order"
```

---

## ไมล์สโตน 5 — ตั้งค่าเรือ, รูปหลักฐาน, หน้าท่าเรือ

### Task 15: BoatSetup — ตั้งรายการเรือประจำวัน

**Files:**
- Create: `src/routes/team/BoatSetup.tsx`
- Modify: `src/App.tsx` (แทน placeholder `/boats`)
- Test: `src/routes/team/BoatSetup.test.tsx`

**Interfaces:**
- Consumes: `getOrCreateShipDay`, `setBoats`
- Produces: หน้าเลือกวัน → โหลด `boats` (ค่าเริ่มจาก default ใน DB) → แก้ชื่อ/เพิ่ม/ลบแถวได้ (`id` ใหม่ = `String(Date.now())` หรือรันเลข) → ปุ่ม "บันทึก" → `setBoats(shipDayId, boats)`; กันลบเรือที่มีออเดอร์ผูกอยู่ (query `orders` count where `boat_id = <id>` and `ship_date = <date>`) — ถ้ามี แจ้งเตือนและไม่ลบ

- [ ] **Step 1: เทสต์** — mock api; เพิ่มเรือ 1 แถว, แก้ชื่อ, กดบันทึก → `setBoats` ถูกเรียกด้วย array ยาวขึ้น 1 และชื่อที่แก้

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- BoatSetup` — Expected: FAIL

- [ ] **Step 3: เขียน `BoatSetup.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { getOrCreateShipDay, setBoats } from '../../lib/api/shipDays'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'

type Boat = { id: string; name: string }
const todayISO = () => new Date().toISOString().slice(0, 10)

export default function BoatSetup() {
  const [date, setDate] = useState(todayISO())
  const [shipDayId, setShipDayId] = useState<string>()
  const [boats, setBoatsState] = useState<Boat[]>([])
  const [msg, setMsg] = useState<string>()

  useEffect(() => {
    getOrCreateShipDay(date).then((d) => { setShipDayId(d.id); setBoatsState(d.boats) })
  }, [date])

  async function removeBoat(id: string) {
    const { count } = await supabase.from('orders')
      .select('id', { count: 'exact', head: true }).eq('ship_date', date).eq('boat_id', id)
    if (count && count > 0) { setMsg(`ลบไม่ได้: มี ${count} ออเดอร์ผูกกับเรือนี้แล้ว`); return }
    setBoatsState((b) => b.filter((x) => x.id !== id))
  }

  async function save() {
    if (!shipDayId) return
    await setBoats(shipDayId, boats)
    setMsg('บันทึกรายการเรือแล้ว')
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">ตั้งค่าเรือประจำวัน</h1>
      <input type="date" className="rounded border p-1" value={date} onChange={(e) => setDate(e.target.value)} />
      {boats.map((b, i) => (
        <div key={b.id} className="flex items-center gap-2">
          <input className="rounded border p-1" value={b.name}
            onChange={(e) => setBoatsState((s) => s.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
          <button className="text-sm text-red-600" onClick={() => removeBoat(b.id)}>ลบ</button>
        </div>
      ))}
      <button className="w-fit text-sm underline"
        onClick={() => setBoatsState((s) => [...s, { id: String(Date.now()), name: `เรือ ${s.length + 1}` }])}>
        + เพิ่มเรือ
      </button>
      <Button onClick={save}>บันทึก</Button>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  )
}
```

- [ ] **Step 4: รันเทสต์ทั้งหมด** — Run: `npm test` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add per-day boat list setup"
```

---

### Task 16: Edge Function `photo-upload-url` + `compressImage` + `PhotoCapture`

**Files:**
- Create: `supabase/functions/_shared/cors.ts`, `supabase/functions/_shared/r2.ts`, `supabase/functions/photo-upload-url/index.ts`, `src/lib/image.ts`, `src/components/PhotoCapture.tsx`, `src/lib/api/photos.ts`
- Test: `src/lib/image.test.ts`, `supabase/functions/_shared/r2.test.ts` (Deno test)

**Interfaces:**
- Consumes: env ฝั่ง Edge (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`); env ฝั่ง client `VITE_SUPABASE_URL`
- Produces:
  - `_shared/r2.ts`: `presignPutUrl(key: string, contentType: string, expiresSec?: number): Promise<string>` — SigV4 presign สำหรับ R2 S3 endpoint `https://<account>.r2.cloudflarestorage.com/<bucket>/<key>`
  - Edge `photo-upload-url` (POST): body `{ scope: 'evidence'|'claim', token?: string, orderId?: string, contentType: string }` → ตรวจสิทธิ์ (evidence: ต้องมี Authorization Bearer = session ทีมที่ valid; claim: ต้องมี `token` ที่ map กับออเดอร์ และยังไม่พ้นเดดไลน์เคลม) → คืน `{ uploadUrl, key, publicUrl }` (key = `<scope>/<orderId|token>/<uuid>.jpg`)
  - `src/lib/image.ts`: `compressImage(file: File, maxDim?: number, maxBytes?: number): Promise<Blob>` — วาดลง `<canvas>`, ย่อ ≤ maxDim (default 1600), export JPEG ไล่ quality 0.85→0.5 จน ≤ maxBytes (default 200*1024)
  - `src/lib/api/photos.ts`: `requestUploadUrl(args): Promise<{uploadUrl,key,publicUrl}>` (fetch ไป Edge), `attachEvidencePhoto(orderId, key, note?): Promise<void>` (insert `evidence_photos`), `attachClaimPhoto(claimId, key): Promise<void>`
  - `src/components/PhotoCapture.tsx`: props `{ scope, orderId?, token?, claimId?, onUploaded(key: string): void, max?: number }` — `<input type="file" accept="image/*" capture="environment" multiple>` → ต่อรูป: `compressImage` → `requestUploadUrl` → `fetch(uploadUrl,{method:'PUT',body:blob})` → `onUploaded(key)`; แสดง preview + progress; บล็อกเมื่อถึง `max`

- [ ] **Step 1: เทสต์ `src/lib/image.test.ts`** — ใช้ `OffscreenCanvas` polyfill ผ่าน jsdom อาจไม่รองรับ canvas เต็ม; ให้เทสต์เฉพาะ logic เลือก quality ผ่านฟังก์ชันย่อย `pickQuality(sizeAt: (q:number)=>number, maxBytes)` ที่ export แยก:

```ts
import { pickQuality } from './image'
test('picks the highest quality within budget', () => {
  // ขนาดจำลอง: q สูง = ไฟล์ใหญ่
  const sizeAt = (q: number) => Math.round(q * 500_000)
  expect(pickQuality(sizeAt, 200_000)).toBeCloseTo(0.4, 1)
})
test('falls back to lowest quality if none fit', () => {
  const sizeAt = () => 999_999
  expect(pickQuality(sizeAt, 200_000)).toBe(0.5)
})
```

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- image` — Expected: FAIL

- [ ] **Step 3: เขียน `src/lib/image.ts`**

```ts
export function pickQuality(sizeAt: (q: number) => number, maxBytes: number): number {
  const steps = [0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5]
  for (const q of steps) if (sizeAt(q) <= maxBytes) return q
  return 0.5
}

export async function compressImage(file: File, maxDim = 1600, maxBytes = 200 * 1024): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  const blobAt = (q: number) => new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/jpeg', q))
  // ประมาณขนาดด้วยการ encode จริงทีละ step (ภาพเดียว ไม่กี่ครั้ง)
  const cache = new Map<number, Blob>()
  const sizeAt = (q: number) => { /* sync ไม่ได้ ใช้ async ด้านล่างแทน */ return cache.get(q)?.size ?? Infinity }
  for (const q of [0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5]) {
    const b = await blobAt(q); cache.set(q, b)
    if (b.size <= maxBytes) return b
  }
  return cache.get(0.5)!
  void sizeAt
}
```
> หมายเหตุ: `pickQuality` เป็นฟังก์ชันบริสุทธิ์สำหรับเทสต์ logic; `compressImage` ใช้ loop encode จริงเพราะต้องได้ขนาดจริง

- [ ] **Step 4: เขียน `_shared/cors.ts` + `_shared/r2.ts` + Edge `photo-upload-url/index.ts`**

`_shared/cors.ts`:
```ts
export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
```

`_shared/r2.ts` — SigV4 presign (ใช้ Web Crypto):
```ts
// presignPutUrl: สร้าง URL แบบ query-signed สำหรับ PUT ไป R2 (S3-compatible)
// อ้างอิงอัลกอริทึม AWS SigV4 (service 's3', region 'auto')
export async function presignPutUrl(key: string, contentType: string, expiresSec = 300): Promise<string> {
  const accountId = Deno.env.get('R2_ACCOUNT_ID')!
  const accessKey = Deno.env.get('R2_ACCESS_KEY_ID')!
  const secretKey = Deno.env.get('R2_SECRET_ACCESS_KEY')!
  const bucket = Deno.env.get('R2_BUCKET')!
  const host = `${accountId}.r2.cloudflarestorage.com`
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const region = 'auto', service = 's3'
  const scope = `${dateStamp}/${region}/${service}/aws4_request`
  const enc = (s: string) => encodeURIComponent(s).replace(/[!*'()]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
  const canonicalUri = `/${bucket}/${key.split('/').map(enc).join('/')}`
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresSec),
    'X-Amz-SignedHeaders': 'host',
  })
  const canonicalQuery = [...params.entries()].sort(([a], [b]) => a < b ? -1 : 1)
    .map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&')
  const canonicalHeaders = `host:${host}\n`
  const payloadHash = 'UNSIGNED-PAYLOAD'
  const canonicalRequest = ['PUT', canonicalUri, canonicalQuery, canonicalHeaders, 'host', payloadHash].join('\n')
  const hash = async (data: string) =>
    [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data)))]
      .map((b) => b.toString(16).padStart(2, '0')).join('')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await hash(canonicalRequest)].join('\n')
  const hmac = async (key: ArrayBuffer | Uint8Array, data: string) => {
    const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    return new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data)))
  }
  let sig = await hmac(new TextEncoder().encode('AWS4' + secretKey), dateStamp)
  sig = await hmac(sig, region); sig = await hmac(sig, service); sig = await hmac(sig, 'aws4_request')
  const signature = [...(await hmac(sig, stringToSign))].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
}
```

`photo-upload-url/index.ts`:
```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors } from '../_shared/cors.ts'
import { presignPutUrl } from '../_shared/r2.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const { scope, token, orderId, contentType } = await req.json()
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

    let folder: string
    if (scope === 'evidence') {
      const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
      const { data: u } = await admin.auth.getUser(jwt ?? '')
      if (!u.user) return new Response('unauthorized', { status: 401, headers: cors })
      if (!orderId) return new Response('orderId required', { status: 400, headers: cors })
      folder = `evidence/${orderId}`
    } else if (scope === 'claim') {
      if (!token) return new Response('token required', { status: 400, headers: cors })
      const { data: o } = await admin.from('orders').select('id,shipped_at').eq('link_token', token).single()
      if (!o) return new Response('not found', { status: 404, headers: cors })
      if (o.shipped_at && Date.now() - new Date(o.shipped_at).getTime() > 48 * 3600_000)
        return new Response('claim window closed', { status: 403, headers: cors })
      folder = `claim/${token}`
    } else {
      return new Response('bad scope', { status: 400, headers: cors })
    }

    const key = `${folder}/${crypto.randomUUID()}.jpg`
    const uploadUrl = await presignPutUrl(key, contentType || 'image/jpeg')
    const publicUrl = `${Deno.env.get('R2_PUBLIC_BASE_URL')}/${key}`
    return new Response(JSON.stringify({ uploadUrl, key, publicUrl }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors })
  }
})
```

- [ ] **Step 5: เขียน `src/lib/api/photos.ts` + `src/components/PhotoCapture.tsx`**

```ts
// photos.ts
import { supabase } from '../supabase'
const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

export async function requestUploadUrl(args:
  { scope: 'evidence'; orderId: string; contentType: string } |
  { scope: 'claim'; token: string; contentType: string }) {
  const { data: sess } = await supabase.auth.getSession()
  const res = await fetch(`${FN_BASE}/photo-upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(('orderId' in args) && sess.session ? { Authorization: `Bearer ${sess.session.access_token}` } : {}),
    },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error('ขอลิงก์อัปโหลดรูปไม่สำเร็จ (' + res.status + ')')
  return res.json() as Promise<{ uploadUrl: string; key: string; publicUrl: string }>
}

export async function attachEvidencePhoto(orderId: string, key: string, note?: string) {
  const { data: u } = await supabase.auth.getUser()
  const { error } = await supabase.from('evidence_photos')
    .insert({ order_id: orderId, r2_key: key, note: note ?? null, taken_by: u.user?.id })
  if (error) throw new Error('บันทึกรูปไม่สำเร็จ: ' + error.message)
}

export async function attachClaimPhoto(claimId: string, key: string) {
  const { error } = await supabase.from('claim_photos').insert({ claim_id: claimId, r2_key: key })
  if (error) throw new Error('บันทึกรูปเคลมไม่สำเร็จ: ' + error.message)
}
```

`PhotoCapture.tsx` — ตามสัญญาใน Interfaces; ใช้ `compressImage` + `requestUploadUrl` + `fetch PUT`; จำกัด `max` (default 3).

- [ ] **Step 6: รันเทสต์ frontend** — Run: `npm test` — Expected: PASS

- [ ] **Step 7: (ถ้ามี Deno) เทสต์ presign** — Run: `deno test supabase/functions/_shared/r2.test.ts` — เทสต์ว่า URL มี `X-Amz-Signature=` และ query เรียงตามตัวอักษร; ถ้าไม่มี Deno ให้ข้ามและบันทึกใน runbook ว่าต้องทดสอบ presign ตอน deploy จริง

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add r2 presigned upload edge function and photo capture component"
```

---

### Task 17: PierLoad — เลือกออเดอร์, เลือกเรือ, แนบรูป, ส่งขึ้นเรือ

**Files:**
- Create: `src/routes/team/PierLoad.tsx`
- Modify: `src/App.tsx` (แทน placeholder `/pier`)
- Test: `src/routes/team/PierLoad.test.tsx`

**Interfaces:**
- Consumes: `listOrdersForDay`, `getOrCreateShipDay`, `updateOrderStatus`, `supabase` (update `boat_id`), `PhotoCapture`, `attachEvidencePhoto`
- Produces: หน้าเน้นมือถือ: (1) ค้น/เลือกออเดอร์ที่สถานะ `packed` หรือ `at_pier` ของวันนี้; (2) เลือกเรือจาก `ship_day.boats` (ปุ่มใหญ่); กด → `supabase.from('orders').update({ boat_id, status: 'at_pier' })` (ผ่าน helper `setOrderBoat(orderId, boatId)`); (3) `PhotoCapture scope="evidence"` (max 3) → `attachEvidencePhoto`; (4) ปุ่มใหญ่ "ส่งขึ้นเรือแล้ว" → `updateOrderStatus(orderId,'shipped')` (ทริกเกอร์เซ็ต `shipped_at`); บล็อกปุ่มถ้ายังไม่มีเรือหรือยังไม่มีรูปอย่างน้อย 1

- [ ] **Step 1: เพิ่ม `setOrderBoat` ใน `orders.ts`**

```ts
export async function setOrderBoat(orderId: string, boatId: string) {
  const { error } = await supabase.from('orders')
    .update({ boat_id: boatId, status: 'at_pier' }).eq('id', orderId).in('status', ['packed', 'at_pier'])
  if (error) throw new Error('บันทึกเรือไม่สำเร็จ: ' + error.message)
}
```

- [ ] **Step 2: เทสต์ `PierLoad.test.tsx`** — mock ทุก api; เลือกออเดอร์ → เลือกเรือ "เรือ 2" → assert `setOrderBoat(orderId,'2')` ถูกเรียก; ปุ่ม "ส่งขึ้นเรือแล้ว" ถูก disabled จนกว่าจะ `onUploaded` อย่างน้อย 1 ครั้ง (จำลองด้วยการเรียก prop) แล้วจึงกดได้ → `updateOrderStatus(orderId,'shipped')`

- [ ] **Step 3: รัน ยืนยันล้มเหลว** — Run: `npm test -- PierLoad` — Expected: FAIL

- [ ] **Step 4: เขียน `PierLoad.tsx`** (โครง)

```tsx
import { useEffect, useState } from 'react'
import { getOrCreateShipDay, listOrdersForDay } from '../../lib/api/shipDays'
import { setOrderBoat, updateOrderStatus } from '../../lib/api/orders'
import { attachEvidencePhoto } from '../../lib/api/photos'
import PhotoCapture from '../../components/PhotoCapture'
import { Button } from '../../components/ui/Button'

const todayISO = () => new Date().toISOString().slice(0, 10)

export default function PierLoad() {
  const [date] = useState(todayISO())
  const [boats, setBoats] = useState<{ id: string; name: string }[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [sel, setSel] = useState<any>(null)
  const [photoCount, setPhotoCount] = useState(0)
  const [msg, setMsg] = useState<string>()

  async function load() {
    const d = await getOrCreateShipDay(date); setBoats(d.boats)
    const all = await listOrdersForDay(date)
    setOrders(all.filter((o) => ['packed', 'at_pier'].includes(o.status)))
  }
  useEffect(() => { load() }, []) // eslint-disable-line

  async function chooseBoat(boatId: string) {
    await setOrderBoat(sel.id, boatId)
    setSel({ ...sel, boat_id: boatId, status: 'at_pier' })
  }
  async function ship() {
    try { await updateOrderStatus(sel.id, 'shipped'); setMsg('ส่งขึ้นเรือแล้ว'); setSel(null); setPhotoCount(0); load() }
    catch (e) { setMsg((e as Error).message) }
  }

  if (!sel) return (
    <div className="flex flex-col gap-2">
      <h1 className="text-xl font-semibold">ที่ท่าเรือ</h1>
      {orders.map((o) => (
        <button key={o.id} className="rounded border p-3 text-left" onClick={() => setSel(o)}>
          {o.makro_order_no} · {o.customer_name_en} · {o.paper_box_count + o.foam_box_count} ลัง
        </button>
      ))}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <button className="text-sm underline" onClick={() => setSel(null)}>&larr; กลับ</button>
      <h1 className="text-lg font-semibold">{sel.makro_order_no} · {sel.customer_name_en}</h1>
      <div className="flex flex-wrap gap-2">
        {boats.map((b) => (
          <button key={b.id} onClick={() => chooseBoat(b.id)}
            className={'rounded-lg border px-4 py-3 text-lg ' + (sel.boat_id === b.id ? 'bg-black text-white' : '')}>
            {b.name}
          </button>
        ))}
      </div>
      <PhotoCapture scope="evidence" orderId={sel.id} max={3}
        onUploaded={async (key) => { await attachEvidencePhoto(sel.id, key); setPhotoCount((c) => c + 1) }} />
      <Button onClick={ship} disabled={!sel.boat_id || photoCount < 1} className="py-4 text-lg">ส่งขึ้นเรือแล้ว</Button>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  )
}
```

- [ ] **Step 5: รันเทสต์ทั้งหมด + build** — Run: `npm test && npm run build` — Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add pier loading screen with boat choice, evidence photos, ship-off"
```

---

## ไมล์สโตน 6 — หน้าลูกค้า (ลิงก์ token) + เคลม

### Task 18: `credit.ts` — โมดูลคำนวณสรุปเครดิต (ใช้ร่วมทีม + ลูกค้า)

**Files:**
- Create: `src/lib/credit.ts`
- Test: `src/lib/credit.test.ts`

**Interfaces:**
- Consumes: —
- Produces:
  - `type CreditInput = { totalValue: number; items: { unit_price: number; qty_ordered: number; status: string }[]; claims: { status: string; resolution: string | null; refund_amount: number }[] }`
  - `type CreditSummary = { orderValue: number; shortageValue: number; approvedRefund: number; netPayable: number }`
  - `computeCreditSummary(input: CreditInput): CreditSummary` โดย
    - `shortageValue = Σ unit_price*qty_ordered` เฉพาะ item `status='short'`
    - `approvedRefund = Σ refund_amount` เฉพาะ claim ที่ `status='approved'` และ `resolution='refund'`
    - `netPayable = round2(orderValue − shortageValue − approvedRefund)` (ไม่ต่ำกว่า 0)

- [ ] **Step 1: เทสต์ `credit.test.ts`**

```ts
import { computeCreditSummary } from './credit'
test('nets shortage and approved refunds off order value', () => {
  const r = computeCreditSummary({
    totalValue: 12000,
    items: [
      { unit_price: 425, qty_ordered: 2, status: 'short' }, // 850
      { unit_price: 100, qty_ordered: 5, status: 'ok' },
    ],
    claims: [
      { status: 'approved', resolution: 'refund', refund_amount: 300 },
      { status: 'approved', resolution: 'resend_next_day', refund_amount: 0 },
      { status: 'open', resolution: null, refund_amount: 999 },
    ],
  })
  expect(r).toEqual({ orderValue: 12000, shortageValue: 850, approvedRefund: 300, netPayable: 10850 })
})
test('never goes negative', () => {
  const r = computeCreditSummary({ totalValue: 100, items: [{ unit_price: 200, qty_ordered: 1, status: 'short' }], claims: [] })
  expect(r.netPayable).toBe(0)
})
```

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- credit` — Expected: FAIL

- [ ] **Step 3: เขียน `src/lib/credit.ts`**

```ts
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export type CreditInput = {
  totalValue: number
  items: { unit_price: number; qty_ordered: number; status: string }[]
  claims: { status: string; resolution: string | null; refund_amount: number }[]
}
export type CreditSummary = {
  orderValue: number; shortageValue: number; approvedRefund: number; netPayable: number
}

export function computeCreditSummary(input: CreditInput): CreditSummary {
  const shortageValue = round2(
    input.items.filter((i) => i.status === 'short').reduce((s, i) => s + i.unit_price * i.qty_ordered, 0),
  )
  const approvedRefund = round2(
    input.claims.filter((c) => c.status === 'approved' && c.resolution === 'refund')
      .reduce((s, c) => s + c.refund_amount, 0),
  )
  const netPayable = Math.max(0, round2(input.totalValue - shortageValue - approvedRefund))
  return { orderValue: round2(input.totalValue), shortageValue, approvedRefund, netPayable }
}
```

- [ ] **Step 4: รันเทสต์ ยืนยันผ่าน** — Run: `npm test -- credit` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add shared credit summary calculation"
```

---

### Task 19: Edge Function `order-view` — token → JSON ออเดอร์ (sanitized)

**Files:**
- Create: `supabase/functions/order-view/index.ts`
- Test: `supabase/functions/order-view/index.test.ts` (Deno; ถ้าไม่มี Deno ให้ทำ manual test ตาม Step 5)

**Interfaces:**
- Consumes: env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `R2_PUBLIC_BASE_URL`
- Produces: Edge `order-view` (GET `?token=` หรือ POST `{token}`) → คืน JSON:
  ```
  {
    orderNo, customerNameEn, shipDate, status, boatName,
    paperBoxCount, foamBoxCount,
    items: [{ productName, qtyOrdered, unitPrice, status }],
    shortages: [{ productName, qtyOrdered }],
    evidencePhotos: [url],
    claimDeadlineAt: string|null,
    canClaim: boolean,
    credit: CreditSummary,
    claims: [{ id, type, qty, description, status, resolution, createdAt }]
  }
  ```
  - หา order ด้วย `link_token`; ถ้าไม่เจอ → 404
  - `boatName` = หาใน `ship_days.boats` ด้วย `boat_id`
  - `canClaim` = `status==='shipped'` และ `now − shipped_at ≤ 48h`
  - `evidencePhotos` = `${R2_PUBLIC_BASE_URL}/${r2_key}`
  - `credit` = คำนวณด้วยสูตรเดียวกับ `computeCreditSummary` (คัดลอกฟังก์ชันลงไฟล์ Edge — Deno แยก bundle; หรือ import จาก path relative ที่ Deno อ่านได้ — ใช้คัดลอกเพื่อความชัวร์ แล้วคอมเมนต์ว่า "ต้องตรงกับ src/lib/credit.ts")
  - **ห้าม** ใส่ `link_token`, `id` ของ order, ข้อมูลทีม, audit ใด ๆ ใน response

- [ ] **Step 1: เขียนเทสต์ (Deno) `order-view/index.test.ts`** — mock `createClient` ให้คืน order สมมติ; assert response ไม่มีคีย์ `link_token`/`id` และมี `credit.netPayable`

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `deno test supabase/functions/order-view/` — Expected: FAIL (ยังไม่มีไฟล์)

- [ ] **Step 3: เขียน `order-view/index.ts`**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors } from '../_shared/cors.ts'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100
// ⚠️ ต้องตรงกับ src/lib/credit.ts
function computeCreditSummary(totalValue: number, items: any[], claims: any[]) {
  const shortageValue = round2(items.filter((i) => i.status === 'short')
    .reduce((s, i) => s + Number(i.unit_price) * Number(i.qty_ordered), 0))
  const approvedRefund = round2(claims.filter((c) => c.status === 'approved' && c.resolution === 'refund')
    .reduce((s, c) => s + Number(c.refund_amount), 0))
  return {
    orderValue: round2(totalValue), shortageValue, approvedRefund,
    netPayable: Math.max(0, round2(totalValue - shortageValue - approvedRefund)),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)
  const token = url.searchParams.get('token') ?? (req.method === 'POST' ? (await req.json()).token : null)
  if (!token) return new Response('token required', { status: 400, headers: cors })

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const { data: o } = await admin.from('orders')
    .select('*, order_items(product_name,qty_ordered,unit_price,status), evidence_photos(r2_key), claims(id,type,qty,description,status,resolution,created_at), ship_days(boats)')
    .eq('link_token', token).single()
  if (!o) return new Response('not found', { status: 404, headers: cors })

  const base = Deno.env.get('R2_PUBLIC_BASE_URL')
  const boat = (o.ship_days?.boats ?? []).find((b: any) => b.id === o.boat_id)
  const canClaim = o.status === 'shipped' && o.shipped_at != null &&
    Date.now() - new Date(o.shipped_at).getTime() <= 48 * 3600_000
  const deadline = o.shipped_at ? new Date(new Date(o.shipped_at).getTime() + 48 * 3600_000).toISOString() : null

  const body = {
    orderNo: o.makro_order_no,
    customerNameEn: o.customer_name_en,
    shipDate: o.ship_date,
    status: o.status,
    boatName: boat?.name ?? null,
    paperBoxCount: o.paper_box_count,
    foamBoxCount: o.foam_box_count,
    items: o.order_items.map((i: any) => ({
      productName: i.product_name, qtyOrdered: Number(i.qty_ordered),
      unitPrice: Number(i.unit_price), status: i.status,
    })),
    shortages: o.order_items.filter((i: any) => i.status === 'short')
      .map((i: any) => ({ productName: i.product_name, qtyOrdered: Number(i.qty_ordered) })),
    evidencePhotos: o.evidence_photos.map((p: any) => `${base}/${p.r2_key}`),
    claimDeadlineAt: deadline,
    canClaim,
    credit: computeCreditSummary(Number(o.total_value_cached), o.order_items, o.claims),
    claims: o.claims.map((c: any) => ({
      id: c.id, type: c.type, qty: Number(c.qty), description: c.description,
      status: c.status, resolution: c.resolution, createdAt: c.created_at,
    })),
  }
  return new Response(JSON.stringify(body), { headers: { ...cors, 'Content-Type': 'application/json' } })
})
```

- [ ] **Step 4: รันเทสต์ Deno ยืนยันผ่าน** — Run: `deno test supabase/functions/order-view/` — Expected: PASS

- [ ] **Step 5: (ถ้าไม่มี Deno) manual test** — `npx supabase functions serve order-view` แล้ว `curl "http://localhost:54321/functions/v1/order-view?token=<token จาก Task 3 Step 4>"` → ตรวจ JSON ไม่มี `link_token`/`id`

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add order-view edge function returning sanitized order json"
```

---

### Task 20: CustomerOrderView + i18n (EN default / TH toggle)

**Files:**
- Create: `src/routes/customer/i18n.ts`, `src/routes/customer/CustomerOrderView.tsx`, `src/components/OrderStatusTimeline.tsx`, `src/components/CreditSummaryTable.tsx`
- Modify: `src/App.tsx` (route `/o/:token` **นอก** `<RequireAuth>`)
- Test: `src/routes/customer/CustomerOrderView.test.tsx`, `src/routes/customer/i18n.test.ts`

**Interfaces:**
- Consumes: fetch `order-view`
- Produces:
  - `i18n.ts`: `type Lang = 'en' | 'th'`; `STRINGS: Record<Lang, Record<string,string>>` (คีย์: `title, status_imported..status_shipped, boat, boxes, paper, foam, shortages, none, evidence, credit_orderValue, credit_shortage, credit_refund, credit_net, report_problem, claim_deadline, claim_closed, ...`); `t(lang, key): string`
  - `OrderStatusTimeline`: props `{ status: string; lang: Lang }` — แสดง 5 ขั้น ไฮไลต์ถึงขั้นปัจจุบัน
  - `CreditSummaryTable`: props `{ summary: CreditSummary; lang: Lang }` — ตาราง 4 แถว
  - `CustomerOrderView`: อ่าน `:token`, fetch, สลับภาษา (ค่าเริ่ม `en`, ปุ่ม EN/ไทย, จำใน `localStorage['cust_lang']`), แสดงทุกส่วนตาม spec §5.6; ถ้า `canClaim` แสดงปุ่ม "Report a problem" → เปิด `CustomerClaimForm` (Task 21); ถ้าเลย deadline แสดงข้อความ "ปิดรับเคลมแล้ว"

- [ ] **Step 1: เทสต์ `i18n.test.ts`**

```ts
import { t } from './i18n'
test('falls back to english when key missing in th', () => {
  expect(t('en', 'report_problem')).toBe('Report a problem')
  expect(typeof t('th', 'report_problem')).toBe('string')
})
```

- [ ] **Step 2: เทสต์ `CustomerOrderView.test.tsx`** — mock `fetch` ให้คืน payload ตัวอย่าง (status `shipped`, canClaim true, 1 shortage, credit netPayable 10850) → assert แสดง "10,850" และปุ่มรายงานปัญหา; คลิกปุ่มสลับภาษา → ข้อความหัวเปลี่ยนเป็นไทย

- [ ] **Step 3: รัน ยืนยันล้มเหลว** — Run: `npm test -- CustomerOrderView` — Expected: FAIL

- [ ] **Step 4: เขียนไฟล์ทั้งหมด** — `i18n.ts` (ตาราง STRINGS ครบทุกคีย์ที่หน้าใช้, ค่า `en` เต็ม, `th` เต็ม; `t()` fallback ไป `en`), `OrderStatusTimeline`, `CreditSummaryTable`, `CustomerOrderView`:

```tsx
// CustomerOrderView.tsx (โครง)
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { STRINGS, t, type Lang } from './i18n'
import OrderStatusTimeline from '../../components/OrderStatusTimeline'
import CreditSummaryTable from '../../components/CreditSummaryTable'
import CustomerClaimForm from './CustomerClaimForm'

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/order-view`

export default function CustomerOrderView() {
  const { token } = useParams()
  const [lang, setLang] = useState<Lang>((localStorage.getItem('cust_lang') as Lang) || 'en')
  const [data, setData] = useState<any>(null)
  const [err, setErr] = useState<string>()
  const [claiming, setClaiming] = useState(false)

  async function load() {
    const res = await fetch(`${FN}?token=${token}`)
    if (!res.ok) { setErr(res.status === 404 ? 'not_found' : 'error'); return }
    setData(await res.json())
  }
  useEffect(() => { load() }, [token]) // eslint-disable-line

  function switchLang(l: Lang) { setLang(l); localStorage.setItem('cust_lang', l) }
  if (err) return <p className="p-6">{err === 'not_found' ? 'Order link not found.' : 'Something went wrong.'}</p>
  if (!data) return <p className="p-6">Loading…</p>

  return (
    <div className="mx-auto max-w-lg p-4">
      <div className="mb-3 flex justify-end gap-2 text-sm">
        <button onClick={() => switchLang('en')} className={lang === 'en' ? 'font-bold underline' : ''}>EN</button>
        <button onClick={() => switchLang('th')} className={lang === 'th' ? 'font-bold underline' : ''}>ไทย</button>
      </div>
      <h1 className="text-xl font-semibold">{t(lang, 'title')} · {data.orderNo}</h1>
      <p className="text-sm text-gray-600">{data.customerNameEn}</p>
      <OrderStatusTimeline status={data.status} lang={lang} />
      {/* items, shortages, boxes+boat, evidencePhotos, CreditSummaryTable */}
      {data.canClaim && !claiming && (
        <button className="mt-4 rounded bg-black px-3 py-2 text-white" onClick={() => setClaiming(true)}>
          {t(lang, 'report_problem')}
        </button>
      )}
      {data.claimDeadlineAt && !data.canClaim && data.status === 'shipped' &&
        <p className="mt-4 text-sm text-gray-500">{t(lang, 'claim_closed')}</p>}
      {claiming && <CustomerClaimForm token={token!} items={data.items} lang={lang}
        onDone={() => { setClaiming(false); load() }} />}
    </div>
  )
}
```

- [ ] **Step 5: รันเทสต์ทั้งหมด** — Run: `npm test` — Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add customer order view with en/th toggle, timeline, credit summary"
```

---

### Task 21: Edge Function `submit-claim` + CustomerClaimForm

**Files:**
- Create: `supabase/functions/submit-claim/index.ts`, `src/routes/customer/CustomerClaimForm.tsx`
- Test: `supabase/functions/submit-claim/index.test.ts` (Deno), `src/routes/customer/CustomerClaimForm.test.tsx`

**Interfaces:**
- Consumes: env service role; `PhotoCapture scope="claim"` (Task 16)
- Produces:
  - Edge `submit-claim` (POST `{ token, type, orderItemIndex?, boxSeq?, qty, description, photoKeys: string[] }`):
    - หา order ด้วย token; ต้อง `status='shipped'` และ `now − shipped_at ≤ 48h` มิฉะนั้น 403 `claim window closed`
    - map `orderItemIndex` → `order_items.id` (query ตาม `order_id` เรียง `line_no`)
    - insert `claims` (`deadline_at = shipped_at + 48h`, `status='open'`) + insert `claim_photos` จาก `photoKeys`
    - เขียน `audit_logs` (`action='claim_submitted'`, `entity_type='claim'`, `user_id=null`)
    - คืน `{ ok: true, claimId }`
  - `CustomerClaimForm`: props `{ token, items, lang, onDone }` — เลือกประเภท (`missing_in_box`/`damaged`/`box_lost`), ถ้าไม่ใช่ `box_lost` เลือกสินค้าจาก `items` (ส่ง index), กรอกจำนวน + คำอธิบาย, `PhotoCapture scope="claim" token={token}` (max 3) เก็บ keys, ปุ่มส่ง → fetch `submit-claim` → `onDone()`

- [ ] **Step 1: เทสต์ Deno `submit-claim/index.test.ts`** — เคส: (a) order ที่ `shipped_at` เกิน 48 ชม. → 403; (b) ภายในเวลา → insert claims ถูกเรียก, คืน `ok:true`

- [ ] **Step 2: เทสต์ `CustomerClaimForm.test.tsx`** — mock fetch; เลือกประเภท damaged, เลือกสินค้าแรก, กรอกจำนวน 1, คำอธิบาย, กดส่ง → fetch ถูกเรียกที่ URL `submit-claim` ด้วย body ที่มี `type:'damaged'` และ `orderItemIndex:0`

- [ ] **Step 3: รัน ยืนยันล้มเหลว** — Run: `npm test -- CustomerClaimForm` — Expected: FAIL

- [ ] **Step 4: เขียน Edge `submit-claim/index.ts`**

```ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cors } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const p = await req.json()
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: o } = await admin.from('orders')
      .select('id,status,shipped_at').eq('link_token', p.token).single()
    if (!o) return new Response('not found', { status: 404, headers: cors })
    const shippedMs = o.shipped_at ? new Date(o.shipped_at).getTime() : 0
    if (o.status !== 'shipped' || !shippedMs || Date.now() - shippedMs > 48 * 3600_000)
      return new Response(JSON.stringify({ error: 'claim window closed' }), { status: 403, headers: cors })

    let orderItemId: string | null = null
    if (p.type !== 'box_lost' && Number.isInteger(p.orderItemIndex)) {
      const { data: items } = await admin.from('order_items')
        .select('id,line_no').eq('order_id', o.id).order('line_no')
      orderItemId = items?.[p.orderItemIndex]?.id ?? null
    }
    const deadline = new Date(shippedMs + 48 * 3600_000).toISOString()
    const { data: claim, error } = await admin.from('claims').insert({
      order_id: o.id, order_item_id: orderItemId, box_seq: p.boxSeq ?? null,
      type: p.type, qty: p.qty ?? 1, description: p.description ?? '',
      status: 'open', deadline_at: deadline,
    }).select('id').single()
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: cors })

    if (Array.isArray(p.photoKeys) && p.photoKeys.length) {
      await admin.from('claim_photos').insert(p.photoKeys.map((k: string) => ({ claim_id: claim.id, r2_key: k })))
    }
    await admin.from('audit_logs').insert({
      user_id: null, action: 'claim_submitted', entity_type: 'claim', entity_id: claim.id,
      meta: { orderNo: p.token },
    })
    return new Response(JSON.stringify({ ok: true, claimId: claim.id }), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: cors })
  }
})
```

- [ ] **Step 5: เขียน `CustomerClaimForm.tsx`** ตาม Interfaces (ใช้ `PhotoCapture` + fetch)

- [ ] **Step 6: รันเทสต์ทั้งหมด** — Run: `npm test` — Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add submit-claim edge function and customer claim form"
```

---

## ไมล์สโตน 7 — ฝั่งทีม: คิวเคลม + เคลียร์เคลม + หน้ารายละเอียดออเดอร์

### Task 22: ClaimsQueue + `claims.ts` API

**Files:**
- Create: `src/lib/api/claims.ts`, `src/routes/team/ClaimsQueue.tsx`
- Modify: `src/App.tsx` (แทน placeholder `/claims`)
- Test: `src/lib/api/claims.test.ts`, `src/routes/team/ClaimsQueue.test.tsx`

**Interfaces:**
- Consumes: `supabase`
- Produces:
  - `type ClaimRow = { id: string; order_id: string; makro_order_no: string; customer_name_en: string; type: string; qty: number; status: string; deadline_at: string; created_at: string }`
  - `listClaims(filter: { status?: string }): Promise<ClaimRow[]>` — join order เพื่อเอา `makro_order_no`, `customer_name_en`; เรียง `deadline_at` asc
  - `getClaim(id): Promise<...>` — claim + order + order_item + claim_photos (คืน `r2_key`; หน้าเติม base URL จาก `VITE_R2_PUBLIC_BASE_URL`)
  - `resolveClaim(id, input: { decision: 'approved'|'rejected'; resolution?: 'refund'|'resend_next_day'; refundAmount?: number; note?: string }): Promise<void>`:
    - update `claims` set `status = decision`, `resolution`, `refund_amount`, `resolved_by = auth.uid()`, `resolved_at = now()`, `description = description + '\n[ทีม] ' + note`
    - ถ้า `decision='approved'` และ `resolution='resend_next_day'` → `createResendBackorder(id)` (Task 13)
    - เขียน `audit_logs` `action='claim_resolved'`
- หน้า `ClaimsQueue`: ปุ่มกรอง (ทั้งหมด/เปิด/อนุมัติ/ปฏิเสธ), ตารางลิงก์ไป `/claims/:id`, ไฮไลต์แถวที่ `deadline_at` ผ่านไปแล้วแต่ยัง `open`

- [ ] **Step 1: เทสต์ `claims.test.ts`** — `resolveClaim` เมื่อ `approved + resend_next_day` เรียก `createResendBackorder`; เมื่อ `approved + refund` ไม่เรียก

```ts
import { resolveClaim } from './claims'
const createResendBackorder = vi.fn().mockResolvedValue(undefined)
vi.mock('./backorders', () => ({ createResendBackorder: (...a: any) => createResendBackorder(...a) }))
vi.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: () => ({ update: () => ({ eq: () => Promise.resolve({ error: null }) }), insert: () => Promise.resolve({ error: null }),
      select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { description: '' }, error: null }) }) }) }),
  },
}))
beforeEach(() => createResendBackorder.mockClear())
test('resend resolution creates a backorder', async () => {
  await resolveClaim('c1', { decision: 'approved', resolution: 'resend_next_day' })
  expect(createResendBackorder).toHaveBeenCalledWith('c1')
})
test('refund resolution does not create a backorder', async () => {
  await resolveClaim('c1', { decision: 'approved', resolution: 'refund', refundAmount: 100 })
  expect(createResendBackorder).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- api/claims` — Expected: FAIL

- [ ] **Step 3: เขียน `src/lib/api/claims.ts`**

```ts
import { supabase } from '../supabase'
import { createResendBackorder } from './backorders'
import { logAction } from './audit'

export async function listClaims(filter: { status?: string } = {}) {
  let q = supabase.from('claims')
    .select('id,order_id,type,qty,status,deadline_at,created_at, orders(makro_order_no,customer_name_en)')
    .order('deadline_at', { ascending: true })
  if (filter.status) q = q.eq('status', filter.status)
  const { data, error } = await q
  if (error) throw new Error('โหลดคิวเคลมไม่สำเร็จ: ' + error.message)
  return (data ?? []).map((c: any) => ({
    id: c.id, order_id: c.order_id, type: c.type, qty: Number(c.qty), status: c.status,
    deadline_at: c.deadline_at, created_at: c.created_at,
    makro_order_no: c.orders?.makro_order_no, customer_name_en: c.orders?.customer_name_en,
  }))
}

export async function getClaim(id: string) {
  const { data, error } = await supabase.from('claims')
    .select('*, orders(makro_order_no,customer_name_en,total_value_cached), order_items(product_name), claim_photos(r2_key)')
    .eq('id', id).single()
  if (error) throw new Error('โหลดเคลมไม่สำเร็จ: ' + error.message)
  return data
}

export async function resolveClaim(id: string, input: {
  decision: 'approved' | 'rejected'
  resolution?: 'refund' | 'resend_next_day'
  refundAmount?: number
  note?: string
}) {
  const { data: cur } = await supabase.from('claims').select('description').eq('id', id).single()
  const { data: u } = await supabase.auth.getUser()
  const patch: Record<string, unknown> = {
    status: input.decision,
    resolution: input.decision === 'approved' ? input.resolution ?? null : null,
    refund_amount: input.decision === 'approved' && input.resolution === 'refund' ? input.refundAmount ?? 0 : 0,
    resolved_by: u.user?.id ?? null,
    resolved_at: new Date().toISOString(),
  }
  if (input.note) patch.description = `${(cur as any)?.description ?? ''}\n[ทีม] ${input.note}`.trim()
  const { error } = await supabase.from('claims').update(patch).eq('id', id)
  if (error) throw new Error('บันทึกผลเคลมไม่สำเร็จ: ' + error.message)

  if (input.decision === 'approved' && input.resolution === 'resend_next_day') {
    await createResendBackorder(id)
  }
  await logAction('claim_resolved', 'claim', id, { decision: input.decision, resolution: input.resolution })
}
```

- [ ] **Step 4: เขียน `ClaimsQueue.tsx`** — ตาราง + ปุ่มกรอง (`useState<'all'|'open'|'approved'|'rejected'>`); เรียก `listClaims` ใหม่เมื่อกรองเปลี่ยน; แถว `open` ที่ `new Date(deadline_at) < new Date()` ใส่ `className="bg-red-50"`

- [ ] **Step 5: รันเทสต์ทั้งหมด** — Run: `npm test` — Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add claims queue and resolveClaim api"
```

---

### Task 23: ClaimDetail — อนุมัติ/ปฏิเสธ + เลือกวิธีชดเชย

**Files:**
- Create: `src/routes/team/ClaimDetail.tsx`
- Modify: `src/App.tsx` (แทน placeholder `/claims/:id`)
- Test: `src/routes/team/ClaimDetail.test.tsx`

**Interfaces:**
- Consumes: `getClaim`, `resolveClaim`
- Produces: หน้าแสดง: ข้อมูลเคลม (ประเภท, จำนวน, คำอธิบายลูกค้า), รูปจากลูกค้า (`claim_photos` + base URL), รูปหลักฐานของทีม (query `evidence_photos` ของ `order_id`), รายการออเดอร์; ฟอร์ม: radio อนุมัติ/ปฏิเสธ → ถ้าอนุมัติ: radio `refund`/`resend_next_day` → ถ้า `refund`: ช่องจำนวนเงิน (ค่าเริ่ม = `order_item.unit_price * qty` ถ้าหาได้); ช่องโน้ต; ปุ่ม "บันทึกผล" → `resolveClaim` → กลับ `/claims`

- [ ] **Step 1: เทสต์** — mock `getClaim` (type damaged, order_item rice unit 100, qty 2); เลือกอนุมัติ + refund → ช่องเงิน default "200"; เปลี่ยนเป็น resend_next_day → ช่องเงินหาย; กดบันทึก → `resolveClaim('c1', { decision:'approved', resolution:'resend_next_day' })`

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- ClaimDetail` — Expected: FAIL

- [ ] **Step 3: เขียน `ClaimDetail.tsx`** (โครง)

```tsx
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getClaim, resolveClaim } from '../../lib/api/claims'
import { supabase } from '../../lib/supabase'
import { Button } from '../../components/ui/Button'
import { Spinner } from '../../components/ui/Spinner'

const R2 = import.meta.env.VITE_R2_PUBLIC_BASE_URL as string

export default function ClaimDetail() {
  const { id } = useParams(); const nav = useNavigate()
  const [c, setC] = useState<any>(null)
  const [evi, setEvi] = useState<string[]>([])
  const [decision, setDecision] = useState<'approved' | 'rejected'>('approved')
  const [resolution, setResolution] = useState<'refund' | 'resend_next_day'>('refund')
  const [amount, setAmount] = useState('0')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getClaim(id!).then(async (claim) => {
      setC(claim)
      const guess = claim.order_items ? Number(claim.order_items.unit_price ?? 0) * Number(claim.qty) : 0
      setAmount(String(guess || 0))
      const { data } = await supabase.from('evidence_photos').select('r2_key').eq('order_id', claim.order_id)
      setEvi((data ?? []).map((p: any) => `${R2}/${p.r2_key}`))
    })
  }, [id])

  if (!c) return <Spinner />
  async function save() {
    setBusy(true)
    try {
      await resolveClaim(id!, {
        decision,
        resolution: decision === 'approved' ? resolution : undefined,
        refundAmount: resolution === 'refund' ? Number(amount) : undefined,
        note: note || undefined,
      })
      nav('/claims')
    } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">เคลม · {c.orders?.makro_order_no} · {c.orders?.customer_name_en}</h1>
      <p className="text-sm">ประเภท: {c.type} · จำนวน: {c.qty}</p>
      <p className="whitespace-pre-wrap text-sm">{c.description}</p>
      <div className="flex gap-2">{(c.claim_photos ?? []).map((p: any) => <img key={p.r2_key} src={`${R2}/${p.r2_key}`} className="h-24 rounded border" />)}</div>
      <p className="text-sm font-medium">รูปหลักฐานของทีม</p>
      <div className="flex gap-2">{evi.map((u) => <img key={u} src={u} className="h-24 rounded border" />)}</div>

      <fieldset className="rounded border p-3 text-sm">
        <label className="mr-4"><input type="radio" checked={decision === 'approved'} onChange={() => setDecision('approved')} /> อนุมัติ</label>
        <label><input type="radio" checked={decision === 'rejected'} onChange={() => setDecision('rejected')} /> ปฏิเสธ</label>
        {decision === 'approved' && (
          <div className="mt-2 flex flex-col gap-1">
            <label><input type="radio" checked={resolution === 'refund'} onChange={() => setResolution('refund')} /> คืนเงิน</label>
            {resolution === 'refund' &&
              <input className="w-32 rounded border p-1" value={amount} onChange={(e) => setAmount(e.target.value)} />}
            <label><input type="radio" checked={resolution === 'resend_next_day'} onChange={() => setResolution('resend_next_day')} /> ส่งชดเชยวันถัดไป</label>
          </div>
        )}
      </fieldset>
      <textarea className="rounded border p-2 text-sm" placeholder="โน้ต (ไม่บังคับ)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button onClick={save} disabled={busy}>บันทึกผล</Button>
    </div>
  )
}
```

- [ ] **Step 4: รันเทสต์ทั้งหมด** — Run: `npm test` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add claim detail with approve/reject and resolution choice"
```

---

### Task 24: OrderDetail — หน้ารวมฝั่งทีม + `audit.ts`

**Files:**
- Create: `src/lib/api/audit.ts`, `src/routes/team/OrderDetail.tsx`
- Modify: `src/App.tsx` (แทน placeholder `/order/:id`), `src/lib/api/orders.ts` (เรียก `logAction` ใน `commitImport`, `updateOrderStatus`, `regenTokenLink`), `src/lib/api/pack.ts` (`logAction` ใน `savePack`)
- Test: `src/lib/api/audit.test.ts`, `src/routes/team/OrderDetail.test.tsx`

**Interfaces:**
- Consumes: `supabase`, `getOrder`, `computeCreditSummary`, `regenTokenLink`
- Produces:
  - `logAction(action: string, entityType: string, entityId: string, meta?: object): Promise<void>` — insert `audit_logs` ด้วย `user_id = auth.uid()`; ห้าม throw (จับ error เขียน `console.warn` เฉย ๆ เพื่อไม่ให้งานหลักสะดุด)
  - `OrderDetail`: แสดงหัวออเดอร์ + `StatusBadge` + ปุ่มเปลี่ยนสถานะถัดไป (`nextStatus`), ลิงก์ `/order/:id/pack` และ `/order/:id/label`, กล่อง "ลิงก์ลูกค้า": แสดง `${location.origin}/o/${link_token}` + ปุ่ม "คัดลอก" (navigator.clipboard) + ปุ่ม "สร้างลิงก์ใหม่" (`regenTokenLink` → refetch), ตารางรายการ, `CreditSummaryTable` (คำนวณจาก order+items+claims), รายการเคลมของออเดอร์ (ลิงก์ไป `/claims/:id`), รายการรูปหลักฐาน, รายการ backorder ที่เกี่ยวข้อง (source หรือ target = ออเดอร์นี้)

- [ ] **Step 1: เทสต์ `audit.test.ts`** — `logAction` ไม่ throw แม้ supabase insert คืน error

```ts
import { logAction } from './audit'
vi.mock('../supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) },
    from: () => ({ insert: vi.fn().mockResolvedValue({ error: { message: 'boom' } }) }),
  },
}))
test('logAction swallows errors', async () => {
  await expect(logAction('x', 'order', 'o1')).resolves.toBeUndefined()
})
```

- [ ] **Step 2: รัน ยืนยันล้มเหลว** — Run: `npm test -- api/audit` — Expected: FAIL

- [ ] **Step 3: เขียน `src/lib/api/audit.ts`**

```ts
import { supabase } from '../supabase'

export async function logAction(action: string, entityType: string, entityId: string, meta?: object) {
  try {
    const { data: u } = await supabase.auth.getUser()
    await supabase.from('audit_logs').insert({
      user_id: u.user?.id ?? null, action, entity_type: entityType, entity_id: entityId, meta: meta ?? null,
    })
  } catch (e) {
    console.warn('audit log failed', e)
  }
}
```

- [ ] **Step 4: เสียบ `logAction`** ใน `commitImport` (`action='import'`, meta `{ shipDate, created }`), `updateOrderStatus` (`action='status_change'`, meta `{ from, to }`), `regenTokenLink` (`action='regen_link'`), `savePack` (`action='pack_saved'`, meta `{ shortageValue }`). อัปเดตเทสต์ที่ mock `./audit` ในไฟล์ที่เกี่ยวข้อง

- [ ] **Step 5: เขียน `OrderDetail.tsx`** ตาม Interfaces + เทสต์ `OrderDetail.test.tsx` (mock `getOrder` → assert แสดงลิงก์ `/o/o_xxx` และปุ่มคัดลอก; กด "สร้างลิงก์ใหม่" → `regenTokenLink` ถูกเรียก)

- [ ] **Step 6: รันเทสต์ทั้งหมด + build** — Run: `npm test && npm run build` — Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add order detail page and audit logging on key mutations"
```

---

## ไมล์สโตน 8 — ลบข้อมูล 30 วัน + กวาดไฟล์ R2

### Task 25: pg_cron purge + Edge `cleanup` สำหรับ R2

**Files:**
- Create: `supabase/migrations/0004_cron_cleanup.sql`, `supabase/functions/cleanup/index.ts`
- Test: `supabase/migrations/0004_cron_cleanup.test.sql` หรือ manual (Step 4)

**Interfaces:**
- Consumes: `pg_cron`, `pg_net` (สำหรับเรียก Edge จาก DB) — เปิด extension ใน migration
- Produces:
  - ฟังก์ชัน `public.purge_old_orders()` — สำหรับ orders ที่ `ship_date < current_date - interval '30 days'`:
    1. insert `r2_key` ของ `evidence_photos` + `claim_photos` ที่เกี่ยวข้อง ลง `r2_delete_queue`
    2. `delete from orders where ...` (cascade ลบ items/boxes/photos/claims/backorders ที่ผูก)
    3. ลบ `audit_logs` ที่ `created_at < now() - interval '30 days'`
  - cron job รายวัน 03:00 (`select cron.schedule('purge-old', '0 3 * * *', $$ select public.purge_old_orders() $$)`)
  - cron job รายวัน 03:10 เรียก Edge `cleanup` ผ่าน `net.http_post` (ส่ง header `Authorization: Bearer <service role>` — เก็บใน Vault หรือ setting)
  - Edge `cleanup`: อ่าน `r2_delete_queue` ทีละ batch (100), DELETE object จาก R2 (SigV4 presign DELETE หรือ signed request), ลบแถวออกจากคิวเมื่อสำเร็จ

- [ ] **Step 1: เขียน `0004_cron_cleanup.sql`**

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.purge_old_orders() returns void
language plpgsql security definer set search_path = public as $$
declare cutoff date := current_date - 30;
begin
  insert into r2_delete_queue (r2_key)
  select ep.r2_key from evidence_photos ep
  join orders o on o.id = ep.order_id where o.ship_date < cutoff;

  insert into r2_delete_queue (r2_key)
  select cp.r2_key from claim_photos cp
  join claims c on c.id = cp.claim_id
  join orders o on o.id = c.order_id where o.ship_date < cutoff;

  delete from orders where ship_date < cutoff;
  delete from audit_logs where created_at < now() - interval '30 days';
end $$;

select cron.schedule('purge-old-orders', '0 3 * * *', $$ select public.purge_old_orders() $$);
```
> การเรียก Edge `cleanup` จาก cron: ตั้งค่าใน Supabase Dashboard → Database → Cron (หรือ `cron.schedule` + `net.http_post` พร้อม service key จาก Vault). บันทึกขั้นตอนละเอียดใน `docs/ops-runbook-th.md` — อย่าฝัง service key ใน migration ที่ commit

- [ ] **Step 2: เขียน Edge `cleanup/index.ts`** — วน `r2_delete_queue` batch 100, DELETE จาก R2, ลบแถว; ต้องมี header `Authorization` = service role (เช็คใน handler)

- [ ] **Step 3: รัน `npx supabase db reset`** — Expected: ไม่ ERROR (ถ้า local ไม่มี `pg_cron` ให้ครอบด้วย `do $$ begin ... exception when others ...` หรือรันเฉพาะบน cloud — บันทึกใน runbook)

- [ ] **Step 4: ทดสอบ `purge_old_orders` ด้วยข้อมูลเก่า**

```bash
psql "<DB_URL>" <<'SQL'
insert into ship_days (ship_date) values ('2026-01-01') on conflict do nothing;
insert into orders (ship_day_id, makro_order_no, customer_name_en, ship_date, link_token)
  select id, 'OLD-1', 'OLD', '2026-01-01', 'o_old_1' from ship_days where ship_date='2026-01-01';
select public.purge_old_orders();
select count(*) from orders where makro_order_no = 'OLD-1';
SQL
```
Expected: count = 0

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add 30-day purge job and r2 cleanup function (migration 0004)"
```

---

## ไมล์สโตน 9 — Deploy + เอกสารส่งมอบ

### Task 26: ตั้งค่า deploy — Vercel + Edge Functions + env

**Files:**
- Create: `vercel.json`, `.env.example` (อัปเดตคีย์ครบ), `docs/ops-runbook-th.md` (ส่วน deploy)
- Modify: `src/App.tsx` (route fallback 404 ที่เป็นมิตร)

**Interfaces:**
- Consumes: บัญชี Vercel + Supabase + Cloudflare ของผู้ใช้
- Produces: แอปที่ deploy แล้ว + Edge Functions 4 ตัวขึ้น production + ตัวแปรแวดล้อมครบ

- [ ] **Step 1: `vercel.json` (SPA rewrite)**

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

- [ ] **Step 2: อัปเดต `.env.example`**

```
# frontend (Vercel env)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_R2_PUBLIC_BASE_URL=

# edge functions (supabase secrets set)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
R2_PUBLIC_BASE_URL=
```

- [ ] **Step 3: เขียนขั้นตอน deploy ใน `docs/ops-runbook-th.md`** — ครอบคลุม:
  - สร้าง Supabase project (region Singapore), `supabase link`, `supabase db push`
  - `supabase secrets set` ใส่คีย์ R2 ทั้งหมด
  - `supabase functions deploy order-view submit-claim photo-upload-url cleanup`
  - สร้าง Cloudflare R2 bucket + API token + เปิด public access (r2.dev หรือ custom domain) → ได้ `R2_PUBLIC_BASE_URL`
  - ตั้ง CORS ของ R2 bucket ให้อนุญาต PUT จาก origin ของ Vercel
  - `vercel` deploy + ใส่ env 3 ตัว
  - ทดสอบ smoke: ล็อกอิน, import ไฟล์ตัวอย่าง, เปิดลิงก์ `/o/<token>` แบบ incognito

- [ ] **Step 4: ทดสอบ build โปรดักชัน** — Run: `npm run build && npx vite preview` — เปิดดูหน้า `/login` โหลดได้

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: add vercel config and deploy runbook"
```

---

### Task 27: คู่มือผู้ใช้ (ไทย) + สคริปต์ backup รายสัปดาห์

**Files:**
- Create: `docs/user-guide-th.md`, `scripts/weekly-backup.sh`
- Modify: `docs/ops-runbook-th.md` (ส่วน backup + กู้คืน + แก้ปัญหาที่พบบ่อย)

**Interfaces:**
- Consumes: —
- Produces: เอกสารส่งมอบครบ

- [ ] **Step 1: เขียน `docs/user-guide-th.md`** — ครอบคลุมทุก flow: เข้าสู่ระบบ + ตั้ง 2FA, นำเข้าออเดอร์ (จับคู่คอลัมน์ครั้งแรก, การเตือนทับซ้ำ), หน้าแพ็ค + ของขาด + จำนวนลัง, พิมพ์ใบเขียนหน้าลัง, ตั้งค่าเรือ, หน้าท่าเรือ (เลือกเรือ + ถ่ายรูป + ส่งขึ้นเรือ), ส่งลิงก์ให้ลูกค้าทาง LINE, คิวเคลม + เคลียร์เคลม, รายการค้างส่ง, ความหมายของสรุปเครดิต, ข้อมูลถูกลบอัตโนมัติใน 30 วัน

- [ ] **Step 2: เขียน `scripts/weekly-backup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail
# ต้องตั้ง env: SUPABASE_DB_URL
STAMP=$(date +%Y%m%d)
OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges -Fc -f "$OUT_DIR/db-$STAMP.dump"
echo "เขียน $OUT_DIR/db-$STAMP.dump แล้ว"
echo "ลบไฟล์ backup ที่เก่ากว่า 60 วัน..."
find "$OUT_DIR" -name 'db-*.dump' -mtime +60 -delete
echo "เสร็จ. หมายเหตุ: ไฟล์รูปบน R2 ไม่รวมใน backup นี้ (กู้คืนได้จากคิว/สำเนา R2 แยก)"
```

- [ ] **Step 3: เพิ่มส่วน backup/กู้คืน/แก้ปัญหาใน `ops-runbook-th.md`** — วิธีรันสคริปต์รายสัปดาห์ (เตือนใน LINE ทีม), วิธี `pg_restore`, ปัญหาพบบ่อย: "อัปโหลดรูปไม่ขึ้น" (เช็ก R2 CORS), "ลูกค้าเปิดลิงก์ไม่ได้" (token ถูก regenerate / เลย 30 วัน), "2FA หลุด" (ให้ manager ลบ factor ใน Supabase Auth), "เรือลบไม่ได้" (มีออเดอร์ผูกอยู่)

- [ ] **Step 4: ตรวจ `npm test && npm run build` ผ่านทั้งหมดครั้งสุดท้าย** — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: add thai user guide, ops runbook, weekly backup script"
```

---

## Self-Review (ผู้เขียนแผนตรวจเอง)

**1. ครอบคลุม spec:**
- §4 ผู้ใช้/สิทธิ์ → Task 4 (auth), 5 (2FA), 6 (roles) ✅
- §5.1 นำเข้า + เตือนทับซ้ำ → Task 7–10 ✅
- §5.2 หน้าแพ็ค + ของขาด + จำนวนลัง → Task 12 ✅
- §5.3 ใบเขียนหน้าลัง → Task 14 ✅
- §5.4 หน้าท่าเรือ + เลือกเรือ + รูป → Task 15–17 ✅
- §5.5 แดชบอร์ดรายวัน → Task 11 ✅
- §5.6 หน้าลูกค้า → Task 19–20 ✅
- §5.7 เคลม 48 ชม. → Task 21 (ลูกค้า) + 22–23 (ทีม) ✅
- §5.8 สรุปเครดิต → Task 18 (calc) + 19/24 (แสดง) ✅
- §5.9 backorder อัตโนมัติ → Task 13 + 23 ✅
- §5.10 หน้ารายละเอียดออเดอร์ + ปุ่มส่งลิงก์ซ้ำ → Task 24 ✅
- §5.11 audit log → Task 24 ✅
- §5.12 คิวเคลม → Task 22 ✅
- §8 state machine → Task 10 (`status.ts`) ✅
- §8 ลบ 30 วัน → Task 25 ✅
- §9 ความปลอดภัย: ไม่เก็บ addr/phone/email (schema Task 2 ไม่มีคอลัมน์) ✅; ลูกค้าผ่าน Edge เท่านั้น (Task 19/21) ✅; RLS ไม่มี policy `anon` (Task 3) ✅; 2FA (Task 5) ✅; rate limit token → **ช่องว่าง**: ยังไม่มี task ทำ rate-limit ที่ Edge → **เพิ่มหมายเหตุใน Task 19 Step 3**: ใส่ in-memory throttle ต่อ IP (เช่น 30 req/นาที) หรือใช้ Supabase Edge `Deno.env` + KV ภายหลัง; ระบุเป็น TODO ที่ยอมรับได้สำหรับเฟส 1 เพราะ token เดายากมาก
- §10 tech/free tier → Task 1, 2, 16, 25, 26 ✅
- §14 ภาษา (ทีมไทย/ลูกค้า EN+TH) → Task 6 (ทีมไทยตายตัว) + Task 20 (i18n) ✅

**2. Placeholder scan:** โค้ดในแต่ละ step เป็นของจริง; หน้าที่ระบุ "ตาม Interfaces" (PhotoCapture, ClaimsQueue table, i18n STRINGS, OrderDetail, CustomerClaimForm) มีสัญญา type + พฤติกรรมชัด + เทสต์กำกับ — ผู้ทำเขียนตามได้ ไม่ใช่ "ทำภายหลัง"

**3. Type consistency:** `OrderStatus` (`status.ts`) ใช้เหมือนกันทุกที่; `computeCreditSummary` / `CreditSummary` ตรงกันระหว่าง `credit.ts` กับสำเนาใน `order-view` (มีคอมเมนต์เตือน); `makeLinkToken` prefix `o_` ตรงกับ route `/o/:token`; `syncShortageBackorders` / `createResendBackorder` / `linkBackordersToDay` ชื่อตรงกับที่ Task 10/12/23 เรียก

**ช่องว่างที่ยอมรับสำหรับเฟส 1 (บันทึกไว้):**
- rate-limit ที่ Edge เป็น best-effort (ดูข้อ 1)
- โครงไฟล์แม็คโครจริงยังไม่ทราบ — `DEFAULT_MAPPING` + fixture เป็นค่าสมมติ ต้องปรับเมื่อได้ไฟล์จริง (spec §15)
- ทดสอบ Edge Functions ด้วย Deno เป็นออปชัน ถ้าเครื่องผู้ทำไม่มี Deno ให้ทำ manual test ตอน deploy (ระบุในแต่ละ task)

