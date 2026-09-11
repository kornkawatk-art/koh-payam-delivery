alter table orders
  add column if not exists payment_method text,
  add column if not exists payment_status text,
  add column if not exists outstanding_amount numeric(12,2);
