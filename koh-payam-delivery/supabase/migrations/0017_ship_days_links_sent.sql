-- 0017_ship_days_links_sent.sql
-- Idempotency guard for task 2 (send-order-links edge function, not this
-- migration): links for a given ship day are auto-sent over LINE at most
-- once per day, even if the boat list is edited and re-saved later that
-- same day. NULL means "not sent yet".
alter table ship_days add column if not exists links_sent_at timestamptz;
