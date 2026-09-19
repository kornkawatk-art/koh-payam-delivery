-- 0021_packed_with_order.sql
-- Customer-group packing (feature/customer-group-packing): when a packer packs
-- several POs of the same customer (same ship date + same phone) together on
-- the combined pack page, the box/piece counts, packer name and pack photos
-- are recorded ONCE, on a "primary" PO (the first not-yet-packed PO). Every
-- other PO in that pack action stores 0 boxes and points here at the primary,
-- so the label sheet, pier list and order detail can say "packed together
-- with PO xxxx" instead of looking like an order with nothing packed.
-- Nullable, set-once-per-pack-action; cleared again if that PO is later saved
-- individually from its own pack page. `on delete set null` so deleting the
-- primary order never blocks or cascades to the others.
alter table orders
  add column if not exists packed_with_order_id uuid references orders(id) on delete set null;

create index if not exists orders_packed_with_order_id_idx
  on orders (packed_with_order_id) where packed_with_order_id is not null;
