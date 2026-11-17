-- 0044_delivery_note.sql
-- ใบส่งของ (ไทย / พม่า): บาร์โค้ด 13 หลักแบบใบเสร็จหน้าร้าน + เลขสมาชิก + เลขใบกำกับ
--
-- 1) item_barcodes: บาร์โค้ดทุกตัวของสินค้าจากคอลัมน์ Bar_Code ในไฟล์ OrderDetailExport (คั่นด้วย ||)
--    หนึ่งแถวต่อรหัสสินค้า การนำเข้าทุกรอบเขียนทับ ออเดอร์เก่าจึงได้บาร์โค้ดเองเมื่อสินค้านั้นถูกนำเข้าอีก
--    เก็บดิบทุกตัว แอปเลือกเองว่าจะแสดงตัวไหน (src/lib/deliveryNote.ts)
-- 2) orders.member_card / invoice_no จาก OrderExport (Member Card / Invoice Number)
--    orders.synced_at = เวลาที่ไฟล์แม็คโครอัปเดตออเดอร์นี้ล่าสุด ("ข้อมูล ณ" บนใบส่งของ)
--
-- ลำดับ: รัน SQL นี้ก่อน แล้วค่อย deploy หน้าเว็บ, auto-import และ order-view
-- (การนำเข้าเวอร์ชันใหม่เขียนคอลัมน์เหล่านี้ ถ้ายังไม่มีคอลัมน์ การนำเข้าจะไม่ผ่าน)
-- ไม่ได้รันบนฐานข้อมูลจริง รอผู้ใช้รันเอง

create table if not exists public.item_barcodes (
  item_id text primary key check (length(btrim(item_id)) between 1 and 40),
  barcodes text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.item_barcodes enable row level security;

-- อ่านได้ทุกคนที่อ่านออเดอร์ได้ (ทีมเกาะ เซลฟลอร์ sale)
drop policy if exists team_read on public.item_barcodes;
create policy team_read on public.item_barcodes for select to authenticated
  using (public.is_team_member() or public.is_floor() or public.is_island_reader());

-- เขียนโดยคนที่นำเข้าออเดอร์ได้ (การนำเข้าอัตโนมัติใช้ service role)
drop policy if exists team_insert on public.item_barcodes;
create policy team_insert on public.item_barcodes for insert to authenticated
  with check (public.is_team_member());
drop policy if exists team_update on public.item_barcodes;
create policy team_update on public.item_barcodes for update to authenticated
  using (public.is_team_member()) with check (public.is_team_member());

revoke all on public.item_barcodes from anon;
grant select, insert, update on public.item_barcodes to authenticated;
grant select, insert, update, delete on public.item_barcodes to service_role;

alter table public.orders add column if not exists member_card text check (length(member_card) <= 40);
alter table public.orders add column if not exists invoice_no text check (length(invoice_no) <= 40);
alter table public.orders add column if not exists synced_at timestamptz;

notify pgrst, 'reload schema';
