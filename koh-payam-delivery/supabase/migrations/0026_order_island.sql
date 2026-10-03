-- 0026_order_island.sql
-- Orders now come from more than one island (feature/islands): Koh Payam and
-- Koh Chang (Ranong). The importer tags each order; an address that only
-- names the Paknam municipal pier (used by boats to both islands) is
-- imported untagged (NULL) until a manager picks the island.
alter table public.orders
  add column if not exists island text
  check (island is null or island in ('payam', 'chang'));

-- Until now the importer only ever kept Koh Payam orders.
update public.orders set island = 'payam' where island is null;
