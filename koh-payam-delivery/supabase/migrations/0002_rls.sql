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
