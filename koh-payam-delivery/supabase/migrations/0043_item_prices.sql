-- 0043_item_prices.sql
-- ราคาคร่าวๆ ต่อสินค้า สำหรับคิด "มูลค่าที่ขาด" ในรายงานของขาด
-- ไฟล์แม็คโครไม่มีราคาต่อชิ้น (0008 ตัด unit_price ทิ้ง) หัวหน้าจึงอัปโหลด Excel ราคา (รหัสสินค้า + ราคา) เอง
-- ราคาเป็นราคาปัจจุบันของตาราง ไม่ใช่ราคาที่ลูกค้าจ่ายในวันนั้น: มูลค่าที่ได้เป็นตัวเลขคร่าวๆ
--
-- อ่านได้: ทุกคนที่เข้ารายงานของขาดได้ (ทีมเกาะ + เซลฟลอร์)
-- เขียนได้: หัวหน้า แอดมิน ทีมออนไลน์ (is_lead)
-- ไม่ได้รันบนฐานข้อมูลจริง รอผู้ใช้รันเอง

create table if not exists public.item_prices (
  item_id text primary key check (length(btrim(item_id)) between 1 and 40),
  price numeric(12, 2) not null check (price >= 0),
  product_name text check (length(product_name) <= 300),
  updated_by uuid references public.profiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);

alter table public.item_prices enable row level security;

drop policy if exists team_read on public.item_prices;
create policy team_read on public.item_prices for select to authenticated
  using (public.is_team_member() or public.is_floor());

drop policy if exists lead_insert on public.item_prices;
create policy lead_insert on public.item_prices for insert to authenticated
  with check (public.is_lead() and public.is_team_member());

drop policy if exists lead_update on public.item_prices;
create policy lead_update on public.item_prices for update to authenticated
  using (public.is_lead() and public.is_team_member())
  with check (public.is_lead() and public.is_team_member());

revoke all on public.item_prices from anon;
grant select, insert, update on public.item_prices to authenticated;
grant select, insert, update, delete on public.item_prices to service_role;

notify pgrst, 'reload schema';
