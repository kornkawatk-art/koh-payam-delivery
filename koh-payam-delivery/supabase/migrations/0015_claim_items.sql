-- 0015_claim_items.sql
-- Support multiple order_item + qty references per claim (missing_in_box can
-- now reference several products at once; damaged stays exactly 1, box_lost
-- stays 0). claims.order_item_id/qty move into a new claim_items table; the
-- claim is now created atomically (claim + its items) via create_claim().
--
-- claims currently has zero rows in production, so this is a clean schema
-- cutover with no data-migration path needed.

create table claim_items (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  order_item_id uuid references order_items(id) on delete set null,
  qty numeric(12,3) not null
);
create index on claim_items (claim_id);

alter table claims drop column order_item_id;
alter table claims drop column qty;

alter table claim_items enable row level security;
create policy team_read on claim_items for select to authenticated
  using (public.is_team_member());

create or replace function public.create_claim(
  p_order_id uuid,
  p_type text,
  p_description text,
  p_deadline_at timestamptz,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_claim_id uuid;
  v_item jsonb;
begin
  insert into claims (order_id, type, description, status, deadline_at)
  values (p_order_id, p_type::claim_type, p_description, 'open', p_deadline_at)
  returning id into v_claim_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    insert into claim_items (claim_id, order_item_id, qty)
    values (v_claim_id, (v_item->>'order_item_id')::uuid, (v_item->>'qty')::numeric);
  end loop;

  return v_claim_id;
end;
$$;

-- Supabase auto-grants EXECUTE on new public functions to anon/authenticated/
-- service_role. create_claim does no authorization or business-rule checks of
-- its own (token lookup, 48h window, item-count-per-type validation all live
-- in submit-claim's TS) — lock the grant down to service_role only so it can
-- only be reached through the edge function, never called directly with the
-- anon/authenticated key.
revoke execute on function public.create_claim(uuid, text, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.create_claim(uuid, text, text, timestamptz, jsonb) to service_role;
