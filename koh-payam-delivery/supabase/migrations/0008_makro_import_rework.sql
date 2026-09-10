-- 0008_makro_import_rework.sql
-- ปรับสคีมาให้เข้ากับไฟล์ export แม็คโครจริง (2 ไฟล์) + ตัดฟีเจอร์ราคา/มูลค่า
-- controller: ต้องรัน `supabase db push` (subagent เขียนไฟล์นี้เท่านั้น ไม่ push)

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
