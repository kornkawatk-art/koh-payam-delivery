-- บทบาทใหม่ "ทีมออนไลน์" (online): น้องที่ทำงานประจำวัน ใช้ได้ทั้งแอปเกาะและ O2O Desk (บัญชีเดียว)
-- ก่อนหน้านี้ทีมออนไลน์ถูกตั้งเป็น manager ทั้งหมด จึงทำได้ทุกอย่าง รวมถึงลบออเดอร์
--
-- แอปเกาะ: online ทำได้เหมือนหัวหน้า ยกเว้นลบออเดอร์ (manager_delete ยังใช้ is_manager())
--   และประวัติการใช้งาน (หน้าแอปเปิดเฉพาะหัวหน้า)
-- is_team_member() (active และไม่ใช่ sale) รวม online อยู่แล้ว จึงอ่าน/เขียนข้อมูลเกาะได้ตามเดิม
-- ไฟล์นี้เปลี่ยนเฉพาะนโยบายที่เคยเป็น "หัวหน้าเท่านั้น" ให้เป็น "หัวหน้าหรือทีมออนไลน์" (is_lead())
--
-- เทียบ role เป็นข้อความ (role::text) เพราะค่า 'online' เพิ่งเพิ่มในไฟล์นี้
-- (ถ้าเทียบเป็น enum ในทรานแซกชันเดียวกับที่เพิ่มค่า ฐานข้อมูลจะไม่ยอม)

alter type public.user_role add value if not exists 'online';

-- หัวหน้าหรือทีมออนไลน์ที่เปิดใช้งาน
create or replace function public.is_lead() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and role::text in ('manager', 'online')
  )
$$;

revoke all on function public.is_lead() from public, anon;
grant execute on function public.is_lead() to authenticated;

-- คิวเคลมของเกาะ: จัดการได้
drop policy if exists claims_update_manager on public.claims;
create policy claims_update_manager on public.claims for update to authenticated
  using (public.is_lead() and public.is_team_member())
  with check (public.is_lead() and public.is_team_member());

-- อนุมัติผู้ลงทะเบียน LINE
drop policy if exists manager_update on public.line_contacts;
create policy manager_update on public.line_contacts for update to authenticated
  using (public.is_lead()) with check (public.is_lead());

-- ลังโฟม: ตั้งยอด (เดิมหัวหน้า) และรับคืน (เดิมคนท่าเรือ + หัวหน้า)
drop policy if exists foam_set_insert on public.foam_box_moves;
create policy foam_set_insert on public.foam_box_moves
  for insert to authenticated
  with check (kind = 'set' and created_by = auth.uid() and public.is_lead());

drop policy if exists foam_return_insert on public.foam_box_moves;
create policy foam_return_insert on public.foam_box_moves
  for insert to authenticated
  with check (
    kind = 'return'
    and created_by = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_active and role::text in ('pier', 'manager', 'online')
    )
  );

-- ปลดล็อกการจ่ายเงิน
drop policy if exists manager_insert on public.payment_releases;
create policy manager_insert on public.payment_releases
  for insert to authenticated with check (public.is_lead() and created_by = auth.uid());

-- ลบออเดอร์ (manager_delete) ไม่เปลี่ยน: หัวหน้าเท่านั้น
