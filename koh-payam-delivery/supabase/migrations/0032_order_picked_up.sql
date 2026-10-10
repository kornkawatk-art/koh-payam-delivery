-- 0032_order_picked_up.sql
-- "ลูกค้ารับแล้ว": a store-pickup order the customer collected at the branch
-- (feature/pickup-close-returned). Final like 'shipped'; a manager can reopen
-- it back to 'imported'. picked_up_at records when.
alter type public.order_status add value if not exists 'picked_up';
alter table public.orders add column if not exists picked_up_at timestamptz;
