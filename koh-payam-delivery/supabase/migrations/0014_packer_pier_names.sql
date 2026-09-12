-- 0014_packer_pier_names.sql
-- Adds free-text packer_name (set on the pack screen) and pier_name (set on
-- the pier screen) columns to orders. Plain columns only — no RLS change
-- needed, since the existing team_update policy (from 0013_manager_delete_orders.sql,
-- still gated on is_team_member()) already covers writes to these columns.

alter table orders
  add column if not exists packer_name text,
  add column if not exists pier_name text;
