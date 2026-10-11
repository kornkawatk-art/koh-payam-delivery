-- 0033_stickers_printed.sql
-- "พิมพ์สติ๊กเกอร์ทั้งหมด" (feature/bulk-stickers): the box counts an order's
-- stickers were last printed with ("paper,foam,piece"). NULL = never printed.
-- A count edited after printing no longer matches, so the order is due again.
alter table public.orders add column if not exists stickers_printed text;
