-- sale (ผู้แจ้งเคลมของแอปเคลม) อ่านข้อมูลเกาะได้บางส่วน แบบอ่านอย่างเดียว
-- ใช้บัญชีเดียวกับแอปเคลม เพื่อดูงานวันนี้และหน้าออเดอร์ ตอบลูกค้าได้ว่าของถึงไหน
--
-- is_team_member() ยังกัน sale เหมือนเดิม (0035) จึงไม่มีนโยบายเขียนใดเปิดให้ sale
-- ไฟล์นี้เพิ่มเฉพาะนโยบาย SELECT ชื่อ sale_read ซึ่ง OR กับ team_read เดิม ทีมเดิมไม่เปลี่ยนการทำงาน
--
-- sale อ่านได้: ship_days, orders, order_items, boxes, evidence_photos, backorders, payment_releases
-- sale อ่านไม่ได้ (ไม่มีนโยบาย): claims, claim_items, claim_photos, audit_logs, line_contacts,
--   customer_aliases, foam_box_moves, app_settings
-- ต้องยืนยันตัวตนสองชั้นแล้ว (aal2) เหมือนตารางของแอปเคลม

create or replace function public.is_island_reader() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from public.profiles
       where id = auth.uid() and is_active and role::text = 'sale'
     )
$$;

revoke all on function public.is_island_reader() from public, anon;
grant execute on function public.is_island_reader() to authenticated;

drop policy if exists sale_read on public.ship_days;
create policy sale_read on public.ship_days for select to authenticated using (public.is_island_reader());

drop policy if exists sale_read on public.orders;
create policy sale_read on public.orders for select to authenticated using (public.is_island_reader());

drop policy if exists sale_read on public.order_items;
create policy sale_read on public.order_items for select to authenticated using (public.is_island_reader());

drop policy if exists sale_read on public.boxes;
create policy sale_read on public.boxes for select to authenticated using (public.is_island_reader());

drop policy if exists sale_read on public.evidence_photos;
create policy sale_read on public.evidence_photos for select to authenticated using (public.is_island_reader());

drop policy if exists sale_read on public.backorders;
create policy sale_read on public.backorders for select to authenticated using (public.is_island_reader());

drop policy if exists sale_read on public.payment_releases;
create policy sale_read on public.payment_releases for select to authenticated using (public.is_island_reader());
