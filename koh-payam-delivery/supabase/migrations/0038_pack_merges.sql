-- 0038_pack_merges.sql
-- แพ็กรวมตามเบอร์ (feature/pack-merge-by-phone): ปกติลูกค้า = เบอร์ + ชื่อร้าน (0025) เพราะเจ้าของคนเดียว
-- มีหลายร้านที่แพ็กและส่งแยกกัน แต่บางวันทีมอยากแพ็กรวมทุกชื่อของเบอร์เดียวกัน: เลือกเป็นรายวัน ต่อเบอร์
-- phone = orders.customer_phone ตามที่เก็บ (trim แล้ว) เหมือน groupByPhone ในแอป
create table if not exists public.pack_merges (
  ship_date date not null,
  phone text not null check (length(btrim(phone)) > 0),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (ship_date, phone)
);
alter table public.pack_merges enable row level security;
drop policy if exists team_read on public.pack_merges;
create policy team_read on public.pack_merges
  for select to authenticated using (public.is_team_member());
drop policy if exists team_insert on public.pack_merges;
create policy team_insert on public.pack_merges
  for insert to authenticated with check (public.is_team_member() and created_by = auth.uid());
drop policy if exists team_delete on public.pack_merges;
create policy team_delete on public.pack_merges
  for delete to authenticated using (public.is_team_member());
