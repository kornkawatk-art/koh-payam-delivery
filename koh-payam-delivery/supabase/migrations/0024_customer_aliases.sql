-- 0024_customer_aliases.sql
-- The short name printed on a customer's box stickers (feature/box-stickers):
-- "JJ Payam" -> "JJ", the name the boat crew actually uses. Set once per
-- customer and reused on every later order.
--
-- customer_key identifies the customer the same way the app groups a
-- customer's POs: 'phone:<digits>' when the order has a phone, else
-- 'name:<UPPERCASED trimmed name>' (see src/lib/api/customerAliases.ts).
-- customer_name / customer_phone are the last-seen display values for the
-- manager's list page; the key is what matters.
create table if not exists public.customer_aliases (
  customer_key text primary key,
  short_name text not null check (length(btrim(short_name)) > 0),
  customer_name text,
  customer_phone text,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id) on delete set null
);

alter table public.customer_aliases enable row level security;

-- Any active team member reads and writes: packers set/fix the name right
-- at the print button. The manager-only list page is a UI restriction, the
-- same pattern as the other team tables (0007_hardening.sql).
create policy team_read on public.customer_aliases
  for select to authenticated using (public.is_team_member());
create policy team_write on public.customer_aliases
  for all to authenticated using (public.is_team_member()) with check (public.is_team_member());
