-- enums
create type user_role as enum ('packer', 'pier', 'manager');
create type order_status as enum ('imported', 'packing', 'packed', 'at_pier', 'shipped');
create type item_status as enum ('ok', 'short');
create type claim_type as enum ('missing_in_box', 'damaged', 'box_lost');
create type claim_status as enum ('open', 'approved', 'rejected', 'closed');
create type claim_resolution as enum ('refund', 'resend_next_day');
create type backorder_reason as enum ('shortage', 'claim_resend');
create type backorder_status as enum ('pending', 'fulfilled');

-- team profiles (1:1 กับ auth.users)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role user_role not null default 'packer',
  created_at timestamptz not null default now()
);

create table ship_days (
  id uuid primary key default gen_random_uuid(),
  ship_date date not null unique,
  boats jsonb not null default '[{"id":"1","name":"เรือ 1"},{"id":"2","name":"เรือ 2"},{"id":"3","name":"เรือ 3"}]'::jsonb,
  created_at timestamptz not null default now()
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  ship_day_id uuid not null references ship_days(id) on delete cascade,
  makro_order_no text not null,
  customer_name_en text not null,
  ship_date date not null,
  status order_status not null default 'imported',
  link_token text not null unique,
  boat_id text,
  paper_box_count int not null default 0 check (paper_box_count >= 0),
  foam_box_count int not null default 0 check (foam_box_count >= 0),
  total_value_cached numeric(12,2) not null default 0,
  packed_at timestamptz,
  shipped_at timestamptz,
  created_at timestamptz not null default now(),
  unique (ship_day_id, makro_order_no)
);
create index on orders (ship_date);
create index on orders (status);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_name text not null,
  qty_ordered numeric(12,3) not null,
  unit_price numeric(12,2) not null,
  status item_status not null default 'ok',
  qty_shipped numeric(12,3) not null default 0,
  line_no int not null
);
create index on order_items (order_id);

create table boxes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  box_type text not null check (box_type in ('paper','foam')),
  seq int not null,
  total int not null,
  unique (order_id, box_type, seq)
);

create table evidence_photos (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  r2_key text not null,
  note text,
  taken_by uuid references profiles(id),
  taken_at timestamptz not null default now()
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  order_item_id uuid references order_items(id) on delete set null,
  box_seq int,
  type claim_type not null,
  qty numeric(12,3) not null default 1,
  description text not null default '',
  status claim_status not null default 'open',
  resolution claim_resolution,
  refund_amount numeric(12,2) not null default 0,
  deadline_at timestamptz not null,
  created_at timestamptz not null default now(),
  resolved_by uuid references profiles(id),
  resolved_at timestamptz
);
create index on claims (status);
create index on claims (order_id);

create table claim_photos (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  r2_key text not null,
  created_at timestamptz not null default now()
);

create table backorders (
  id uuid primary key default gen_random_uuid(),
  source_order_id uuid not null references orders(id) on delete cascade,
  reason backorder_reason not null,
  product_name text not null,
  qty numeric(12,3) not null,
  target_ship_date date,
  target_order_id uuid references orders(id) on delete set null,
  status backorder_status not null default 'pending',
  fulfilled_by uuid references profiles(id),
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);
create index on backorders (target_ship_date) where status = 'pending';
create index on backorders (source_order_id);

create table audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid references profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index on audit_logs (created_at);

create table r2_delete_queue (
  id bigint generated always as identity primary key,
  r2_key text not null,
  queued_at timestamptz not null default now()
);
