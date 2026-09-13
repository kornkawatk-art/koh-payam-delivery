-- 0019_claim_closing.sql
-- Claim "closed" status + link resend backorders back to the claim that
-- queued them (feature/claim-closing-status).
--   `claim_status` already has a 'closed' value (0001_core_tables.sql) but no
--   code path ever wrote it -- this feature starts writing it: immediately
--   for an approved refund (nothing left to track), and automatically once
--   every resend-compensation backorder a claim queued has been delivered
--   (markBackorderFulfilled in backorders.ts checks this on each fulfillment).
--   That check needs to walk from a fulfilled backorder back to its claim, so
--   backorders gets a nullable claim_id column. It is nullable and set-once
--   at insert time because only createResendBackorder (reason =
--   'claim_resend') ever populates it -- shortage backorders from
--   syncShortageBackorders never originate from a claim and keep it null
--   forever. `on delete set null` mirrors this table's other order_id-style
--   FKs (target_order_id) so a deleted claim never blocks a backorder row.
alter table backorders
  add column if not exists claim_id uuid references claims(id) on delete set null;

create index on backorders (claim_id) where claim_id is not null;

-- close_resend_claim_if_fulfilled(): claims has exactly one write policy,
-- claims_update_manager (0007_hardening.sql), gated `is_manager() and
-- is_team_member()` -- but markBackorderFulfilled (backorders.ts) is called
-- from the PACK screen, reachable by packer/pier sessions (see
-- src/routes/team/PackOrder.tsx + src/lib/roles.ts), not just managers. A
-- plain client-side `update claims ...` from a non-manager session matches
-- zero rows under RLS -- PostgREST reports that as success, not an error --
-- so the claim silently never closes. This mirrors create_claim's
-- security-definer shape (0015_claim_items.sql) to perform that one narrow,
-- well-defined write on the caller's behalf.
--
-- Self-contained by design: re-derives the "are all of this claim's
-- backorders fulfilled" check itself rather than trusting the caller's TS-side
-- check, so it stays correct even if ever called directly or out of order.
create or replace function public.close_resend_claim_if_fulfilled(p_claim_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_total int;
  v_unfulfilled int;
  v_count int;
begin
  -- Defense-in-depth: the grant below already restricts execute to
  -- `authenticated`, but the function must not blindly trust its own
  -- security-definer privilege either -- mirrors is_team_member() gating
  -- elsewhere in this codebase.
  if not public.is_team_member() then
    raise exception 'not authorized';
  end if;

  select count(*), count(*) filter (where status <> 'fulfilled')
    into v_total, v_unfulfilled
    from backorders
    where claim_id = p_claim_id;

  -- No backorders at all (claim_id never populated, or wrong id), or at
  -- least one sibling still not fulfilled -- nothing to close yet.
  if v_total = 0 or v_unfulfilled > 0 then
    return false;
  end if;

  update claims set status = 'closed'
    where id = p_claim_id and status = 'approved';
  get diagnostics v_count = row_count;

  -- Only true if THIS call actually flipped a row -- false (no error) if the
  -- claim was already closed, or was somehow not 'approved'.
  return v_count > 0;
end;
$$;

-- Unlike create_claim (locked to service_role -- its caller has no Supabase
-- session at all), this function's caller always has one: any signed-in team
-- member (packer/pier/manager) reachable from the pack screen must be able
-- to call it.
revoke execute on function public.close_resend_claim_if_fulfilled(uuid) from public, anon;
grant execute on function public.close_resend_claim_if_fulfilled(uuid) to authenticated;
