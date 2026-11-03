-- 0039_myanmar_box_label.sql
-- PO ฝั่งเมียนมา (feature/myanmar-box-labels): PO ที่ sale ตั้งชื่อหน้าลังไว้ใน O2O Desk (box_labels, makro-claim 0122)
-- เข้ามาเป็นออเดอร์ของแอปเกาะด้วย ปลายทาง 'myanmar' เพื่อใช้หน้าแพ็ก รูป สติกเกอร์ ท่าเรือ ลิงก์ลูกค้า และเคลมผ่านลิงก์ชุดเดียวกับเกาะ
-- orders.box_label = ชื่อหน้าลัง (การนำเข้าคัดลอกจาก box_labels ทุกรอบ) ใช้เป็นชื่อบนสติกเกอร์แทนชื่อย่อลูกค้า

alter table public.orders drop constraint if exists orders_island_check;
alter table public.orders add constraint orders_island_check check (island is null or island in ('payam', 'chang', 'myanmar'));
alter table public.orders add column if not exists box_label text;

-- ให้ sale เห็นใน O2O Desk: สถานะ จำนวนลัง จำนวนรูปตอนแพ็ก และลิงก์ลูกค้า ของ PO ที่ตั้งชื่อหน้าลังไว้
-- (orders เปิดให้ทีมแอปเกาะเท่านั้น sale อ่านผ่านฟังก์ชันนี้)
create or replace function public.box_label_orders(p_from date)
returns table (makro_order_no text, status text, paper_box_count int, foam_box_count int, piece_count int,
               pack_photos int, link_token text, ship_date date)
language sql stable security definer set search_path = public as $$
  select o.makro_order_no, o.status::text, o.paper_box_count, o.foam_box_count, o.piece_count,
         (select count(*)::int from public.evidence_photos p where p.order_id = o.id and p.stage = 'pack'),
         o.link_token, o.ship_date
  from public.orders o
  join public.box_labels b on b.makro_order_no = o.makro_order_no
  where public.is_claim_user() and o.ship_date >= p_from
$$;
revoke all on function public.box_label_orders(date) from public, anon;
grant execute on function public.box_label_orders(date) to authenticated;
