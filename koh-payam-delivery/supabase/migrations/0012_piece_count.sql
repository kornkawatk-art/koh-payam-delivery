alter table orders
  add column if not exists piece_count int not null default 0
    check (piece_count >= 0);
