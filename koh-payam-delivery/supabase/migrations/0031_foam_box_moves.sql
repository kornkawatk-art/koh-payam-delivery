-- 0031_foam_box_moves.sql
-- Foam box tracking (feature/foam-boxes, spec 2026-10-10). Only what the team
-- types is stored here -- returns and set-balance; boxes SENT come from
-- shipped orders' foam_box_count since app_settings.foam_tracking_start.

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  foam_tracking_start timestamptz not null
);
insert into public.app_settings (foam_tracking_start) values (now())
  on conflict (id) do nothing;
alter table public.app_settings enable row level security;
drop policy if exists team_read on public.app_settings;
create policy team_read on public.app_settings
  for select to authenticated using (public.is_team_member());

create table if not exists public.foam_box_moves (
  id uuid primary key default gen_random_uuid(),
  customer_key text not null,
  customer_name text not null,
  kind text not null check (kind in ('return', 'set')),
  qty integer not null check ((kind = 'return' and qty > 0) or (kind = 'set' and qty >= 0)),
  note text,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists foam_box_moves_customer_idx
  on public.foam_box_moves (customer_key, created_at);
alter table public.foam_box_moves enable row level security;

drop policy if exists team_read on public.foam_box_moves;
create policy team_read on public.foam_box_moves
  for select to authenticated using (public.is_team_member());

-- Returns: pier staff and managers. Set-balance: managers only. Rows are
-- written as the caller (created_by = auth.uid()). No update/delete policy:
-- a mistake is fixed with a new set.
drop policy if exists foam_return_insert on public.foam_box_moves;
create policy foam_return_insert on public.foam_box_moves
  for insert to authenticated
  with check (
    kind = 'return'
    and created_by = auth.uid()
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and is_active and role in ('pier', 'manager')
    )
  );
drop policy if exists foam_set_insert on public.foam_box_moves;
create policy foam_set_insert on public.foam_box_moves
  for insert to authenticated
  with check (kind = 'set' and created_by = auth.uid() and public.is_manager());
