-- 0025_customer_per_shop.sql
-- One owner (one phone) can run several shops/resorts, each with its own
-- Makro account name (e.g. one phone -> "กระต่าย พยามาศ", "เต้ย Ziggy",
-- "แคท Gympansea"). They pack, label and ship separately, so a customer is
-- now phone + name (feature/customer-per-shop).

-- 1. Keep the full Makro shipping address: it names the shop/resort and
--    sometimes carries instructions ("เขียนข้างกล่องว่า ครูวิทย์ ทุกกล่อง").
--    Nullable: older orders fill in when their file is re-imported.
alter table public.orders
  add column if not exists shipping_address text;

-- 2. Short-name keys: 'phone:<digits>' -> 'phone:<digits>|name:<NAME>', the
--    same key src/lib/api/customerAliases.ts now builds (name = trimmed,
--    runs of whitespace collapsed to one space, upper-cased -- keep in step
--    with normCustomerName in src/lib/groupOrders.ts). Names saved so far
--    carry the customer_name they were saved for, so none are lost.
update public.customer_aliases
set customer_key = 'phone:' || regexp_replace(customer_key, '^phone:', '')
                   || '|name:' || upper(regexp_replace(btrim(customer_name), '\s+', ' ', 'g'))
where customer_key like 'phone:%'
  and customer_key not like '%|name:%'
  and customer_name is not null;
