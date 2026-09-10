create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.purge_old_orders() returns void
language plpgsql security definer set search_path = public as $$
declare cutoff date := current_date - 30;
begin
  insert into r2_delete_queue (r2_key)
  select ep.r2_key from evidence_photos ep
  join orders o on o.id = ep.order_id where o.ship_date < cutoff;

  insert into r2_delete_queue (r2_key)
  select cp.r2_key from claim_photos cp
  join claims c on c.id = cp.claim_id
  join orders o on o.id = c.order_id where o.ship_date < cutoff;

  delete from orders where ship_date < cutoff;
  delete from audit_logs where created_at < now() - interval '30 days';
end $$;

select cron.schedule('purge-old-orders', '0 3 * * *', $$ select public.purge_old_orders() $$);
-- see docs/ops-runbook-th.md for the r2-cleanup cron wiring
