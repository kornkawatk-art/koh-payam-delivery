-- 0013_manager_delete_orders.sql
-- Manager self-service order delete (feature/delete-order).
--   Splits orders' blanket team_write (ALL) policy from 0007_hardening.sql into
--   team_insert / team_update (still gated on is_team_member()) plus a new
--   manager_delete (gated on the new is_manager()) so only an active manager
--   profile can hard-delete an order row. order_items/boxes/evidence_photos/
--   claims/backorders keep their existing is_team_member()-gated policies
--   as-is — a manager already satisfies is_team_member(), so the ON DELETE
--   CASCADE foreign keys from those tables still fire on a manager delete.

create or replace function public.is_manager() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'manager' and is_active
  )
$$;

drop policy if exists team_write on public.orders;

create policy team_insert on public.orders
  for insert to authenticated with check (public.is_team_member());

create policy team_update on public.orders
  for update to authenticated using (public.is_team_member())
  with check (public.is_team_member());

create policy manager_delete on public.orders
  for delete to authenticated using (public.is_manager());
