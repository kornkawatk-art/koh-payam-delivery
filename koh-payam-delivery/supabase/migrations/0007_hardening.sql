-- 0007_hardening.sql
-- Final whole-branch hardening pass.
--   (a) Team-access gate (C1 defense-in-depth): profiles.is_active + is_team_member()
--       and re-gate every team_read/team_write policy on it.
--   (b) Realtime for public.orders (I6).
--   (c) R2 key capture on ANY delete of an evidence/claim photo row (I9).

-- ---------------------------------------------------------------------------
-- (a) Team-access gate
-- ---------------------------------------------------------------------------

alter table public.profiles add column if not exists is_active boolean not null default false;

-- Activate the existing manager account so it keeps working after the gate lands.
update public.profiles set is_active = true where role = 'manager';

create or replace function public.is_team_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active
  )
$$;

-- handle_new_user() (from 0005): the auto-created profile row must start inactive
-- so a freshly created auth user cannot touch team data until a manager flips
-- is_active. is_active already defaults to false; we insert it explicitly for clarity.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role, is_active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email, '@', 1)),
    'packer',
    false  -- new team members are inactive until a manager activates them
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- Re-gate the blanket team policies from 0002_rls.sql: using(true) -> is_team_member().

-- team_read (SELECT, to authenticated)
drop policy if exists team_read on public.ship_days;
drop policy if exists team_read on public.orders;
drop policy if exists team_read on public.order_items;
drop policy if exists team_read on public.boxes;
drop policy if exists team_read on public.evidence_photos;
drop policy if exists team_read on public.claims;
drop policy if exists team_read on public.claim_photos;
drop policy if exists team_read on public.backorders;
drop policy if exists team_read on public.audit_logs;

create policy team_read on public.ship_days       for select to authenticated using (public.is_team_member());
create policy team_read on public.orders          for select to authenticated using (public.is_team_member());
create policy team_read on public.order_items     for select to authenticated using (public.is_team_member());
create policy team_read on public.boxes           for select to authenticated using (public.is_team_member());
create policy team_read on public.evidence_photos for select to authenticated using (public.is_team_member());
create policy team_read on public.claims          for select to authenticated using (public.is_team_member());
create policy team_read on public.claim_photos    for select to authenticated using (public.is_team_member());
create policy team_read on public.backorders      for select to authenticated using (public.is_team_member());
create policy team_read on public.audit_logs      for select to authenticated using (public.is_team_member());

-- team_write (ALL, to authenticated) — same shape as 0002, both clauses re-gated.
drop policy if exists team_write on public.ship_days;
drop policy if exists team_write on public.orders;
drop policy if exists team_write on public.order_items;
drop policy if exists team_write on public.boxes;
drop policy if exists team_write on public.evidence_photos;
drop policy if exists team_write on public.backorders;
drop policy if exists team_write on public.audit_logs;

create policy team_write on public.ship_days       for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy team_write on public.orders          for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy team_write on public.order_items     for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy team_write on public.boxes           for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy team_write on public.evidence_photos for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
create policy team_write on public.backorders      for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
-- audit_logs kept INSERT-only, as in 0002.
create policy team_write on public.audit_logs      for insert to authenticated with check (public.is_team_member());

-- Claims: keep claims_insert / claims_update_manager shapes from 0002, add the gate.
drop policy if exists claims_insert on public.claims;
drop policy if exists claims_update_manager on public.claims;
create policy claims_insert on public.claims for insert to authenticated
  with check (public.is_team_member());
create policy claims_update_manager on public.claims for update to authenticated
  using (public.is_manager() and public.is_team_member())
  with check (public.is_manager() and public.is_team_member());

-- r2_delete_queue: keep queue_insert INSERT-only, add the gate (durable writers are
-- the SECURITY DEFINER triggers below + service role, which bypass RLS regardless).
drop policy if exists queue_insert on public.r2_delete_queue;
create policy queue_insert on public.r2_delete_queue for insert to authenticated
  with check (public.is_team_member());

-- profiles.team_read_profiles is intentionally LEFT as `to authenticated using (true)`
-- so loadProfile() works during the brief window between sign-in and 2FA / activation.

-- ---------------------------------------------------------------------------
-- (b) Realtime (I6) — DailyDashboard subscribes to postgres_changes on orders.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.orders;

-- ---------------------------------------------------------------------------
-- (c) R2 key capture on any delete (I9)
-- ---------------------------------------------------------------------------

create or replace function public.tg_queue_r2_key() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.r2_delete_queue (r2_key) values (old.r2_key);
  return old;
end $$;

create trigger evidence_photos_queue_r2 before delete on public.evidence_photos
  for each row execute function public.tg_queue_r2_key();

create trigger claim_photos_queue_r2 before delete on public.claim_photos
  for each row execute function public.tg_queue_r2_key();

-- purge_old_orders() (from 0006): the two manual r2_delete_queue back-fills are now
-- redundant — the triggers above fire as `delete from orders` cascades into
-- evidence_photos and (via claims) claim_photos. Keep only the row deletions.
create or replace function public.purge_old_orders() returns void
language plpgsql security definer set search_path = public as $$
declare cutoff date := current_date - 30;
begin
  delete from orders where ship_date < cutoff;
  delete from audit_logs where created_at < now() - interval '30 days';
end $$;
