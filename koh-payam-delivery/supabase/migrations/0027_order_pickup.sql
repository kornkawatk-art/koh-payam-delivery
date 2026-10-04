-- 0027_order_pickup.sql
-- Makro's "Order Type" = "Pick up at store": the customer collects at the
-- branch, nothing goes on a boat. Such orders are still imported (kept as a
-- record) but flagged so the team sees it (feature/pickup-badge).
alter table public.orders
  add column if not exists is_pickup boolean not null default false;

-- Order Type wasn't kept before this; these two are the pickups known from
-- the 10-Sep-2026 export (ship date 2026-09-11). Others fill in when their
-- file is re-imported (a sync updates the flag).
update public.orders set is_pickup = true
where makro_order_no in ('6041990441A', '6041863948A');
