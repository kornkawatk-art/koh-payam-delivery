-- 0030_scale_indexes.sql
-- Indexes for lookups that scan whole tables today (fine at hundreds of rows,
-- slow at tens of thousands). Additive only -- no data changes.
create index if not exists evidence_photos_order_id_idx on public.evidence_photos (order_id);
create index if not exists claim_photos_claim_id_idx on public.claim_photos (claim_id);
-- import: "already imported on another day?" + the QR/PO search
create index if not exists orders_makro_order_no_idx on public.orders (makro_order_no);
-- one customer's POs on a day (pack together, pier group, customer page siblings)
create index if not exists orders_customer_phone_ship_date_idx on public.orders (customer_phone, ship_date);
-- carry-over owed to an order (order + pack pages)
create index if not exists backorders_target_order_id_idx on public.backorders (target_order_id)
  where target_order_id is not null;
