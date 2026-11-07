-- 0041_boat_defaults.sql
-- เรือประจำ: รายชื่อเรือที่วันใหม่ทุกวันได้ไปเลย (แทนเรือ 1-3 ที่ตายตัว)
-- แก้ได้ในหน้าตั้งค่าเรือ โดยหัวหน้า ทีมออนไลน์ และท่าเรือ
--
-- เรือที่ออกหลายรอบ (timed = true เช่น Speed boat) เป็นแม่แบบ: ตอนลงเรือ
-- คนท่าเรือเลือกเวลา แล้ว add_timed_boat() เพิ่มเรือของวันนั้นชื่อ
-- "Speed boat 14:30" (of = id ของแม่แบบ) ให้ออเดอร์ผูก
-- ลิงก์ลูกค้า ประวัติ และหน้างานวันนี้จึงเห็นชื่อพร้อมเวลาโดยไม่ต้องแก้ที่อื่น

create table if not exists public.boat_defaults (
  id int primary key default 1 check (id = 1),
  boats jsonb not null check (jsonb_typeof(boats) = 'array'),
  updated_at timestamptz not null default now()
);

insert into public.boat_defaults (id, boats) values (1, '[
  {"id": "taikhaek-1", "name": "ไต๋แขก 1"},
  {"id": "taikhaek-2", "name": "ไต๋แขก 2"},
  {"id": "taikhaek-3", "name": "ไต๋แขก 3"},
  {"id": "koh-chang", "name": "เกาะช้าง"},
  {"id": "ton-son", "name": "ต้นสน"},
  {"id": "speed", "name": "Speed boat", "timed": true}
]'::jsonb)
on conflict (id) do nothing;

alter table public.boat_defaults enable row level security;

drop policy if exists boat_defaults_read on public.boat_defaults;
create policy boat_defaults_read on public.boat_defaults for select to authenticated
  using (public.is_team_member());

-- เหมือนคนที่เข้าหน้าตั้งค่าเรือได้ (src/lib/roles.ts '/boats')
drop policy if exists boat_defaults_write on public.boat_defaults;
create policy boat_defaults_write on public.boat_defaults for update to authenticated
  using (public.is_team_member() and exists (
    select 1 from public.profiles
    where id = auth.uid() and role::text in ('manager', 'online', 'pier')
  ))
  with check (public.is_team_member() and exists (
    select 1 from public.profiles
    where id = auth.uid() and role::text in ('manager', 'online', 'pier')
  ));

revoke all on public.boat_defaults from anon;
grant select, update on public.boat_defaults to authenticated;

-- ค่าเริ่มต้นของ ship_days.boats: อ่านรายชื่อเรือประจำตอนสร้างวัน
-- (ทั้งจากแอปและจากการนำเข้าอัตโนมัติ)
create or replace function public.default_boats() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select boats from public.boat_defaults where id = 1), '[]'::jsonb)
$$;

alter table public.ship_days alter column boats set default public.default_boats();

-- เพิ่มรอบของเรือหลายรอบให้วันนั้น (ถ้ามีแล้วใช้อันเดิม) คืนเรือที่ได้
-- ล็อกแถวของวันไว้ คนท่าเรือ 2 คนกดพร้อมกันจะไม่ทับกัน
create or replace function public.add_timed_boat(p_ship_day uuid, p_of text, p_time text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_boats jsonb;
  v_tpl jsonb;
  v_boat jsonb;
  v_id text;
begin
  if not public.is_team_member() then
    raise exception 'ไม่มีสิทธิ์' using errcode = '42501';
  end if;
  if p_time is null or p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'เวลาไม่ถูกต้อง';
  end if;
  select boats into v_boats from public.ship_days where id = p_ship_day for update;
  if not found then
    raise exception 'ไม่พบวันจัดส่ง';
  end if;
  select e into v_tpl from jsonb_array_elements(v_boats) e
    where e->>'id' = p_of and coalesce((e->>'timed')::boolean, false);
  if v_tpl is null then
    raise exception 'ไม่พบเรือที่เลือกเวลาได้';
  end if;
  v_id := p_of || '-' || replace(p_time, ':', '');
  select e into v_boat from jsonb_array_elements(v_boats) e where e->>'id' = v_id;
  if v_boat is null then
    v_boat := jsonb_build_object('id', v_id, 'name', (v_tpl->>'name') || ' ' || p_time, 'of', p_of);
    update public.ship_days set boats = boats || jsonb_build_array(v_boat) where id = p_ship_day;
  end if;
  return v_boat;
end
$$;

revoke all on function public.add_timed_boat(uuid, text, text) from public, anon;
grant execute on function public.add_timed_boat(uuid, text, text) to authenticated;

-- วันนี้ขึ้นไปที่ยังไม่มีออเดอร์ผูกเรือ ใช้รายชื่อใหม่เลย
-- (วันที่ผูกเรือแล้ว หรือวันที่ผ่านมา ไม่แตะ)
update public.ship_days s set boats = public.default_boats()
where s.ship_date >= (now() at time zone 'Asia/Bangkok')::date
  and not exists (
    select 1 from public.orders o where o.ship_day_id = s.id and o.boat_id is not null
  );
