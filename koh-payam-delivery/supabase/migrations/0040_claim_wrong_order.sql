-- 0040_claim_wrong_order.sql
-- New claim type "สั่งสินค้าผิดรายการ": the customer ordered the wrong
-- product. Like damaged it names one or more items with a qty each.
alter type public.claim_type add value if not exists 'wrong_order';
