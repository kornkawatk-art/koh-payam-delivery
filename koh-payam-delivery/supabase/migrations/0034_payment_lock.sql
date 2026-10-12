-- 0034_payment_lock.sql
-- Payment lock (feature/payment-lock, spec 2026-10-12): a manager can mark a
-- cash-on-delivery bill paid (until a Makro import says otherwise), and can
-- release a locked customer for one delivery.
alter table public.orders
  add column if not exists paid_marked_at timestamptz,
  add column if not exists paid_marked_by uuid references public.profiles(id);

create table if not exists public.payment_releases (
  id uuid primary key default gen_random_uuid(),
  customer_key text not null,
  customer_name text not null,
  ship_date date not null,
  reason text not null check (length(btrim(reason)) > 0),
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  unique (customer_key, ship_date)
);
alter table public.payment_releases enable row level security;
drop policy if exists team_read on public.payment_releases;
create policy team_read on public.payment_releases
  for select to authenticated using (public.is_team_member());
drop policy if exists manager_insert on public.payment_releases;
create policy manager_insert on public.payment_releases
  for insert to authenticated with check (public.is_manager() and created_by = auth.uid());
