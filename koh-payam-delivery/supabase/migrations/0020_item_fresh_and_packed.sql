-- 0020_item_fresh_and_packed.sql
-- Two new per-line fields on order_items (feature/fresh-dry-and-pack-checklist):
--
-- is_fresh: nullable, computed at import time from the Makro OrderDetailExport
-- file's own "Dept" column (Dept 1-5 = fresh; anything else, including a
-- blank/unparseable Dept, = dry). Verified against a real export file, not
-- guessed. Nullable (not `not null default false`) on purpose: rows imported
-- before this migration never captured Dept at all, and must show ungrouped
-- ("no fresh/dry split yet") rather than silently be misclassified as dry --
-- only a row imported/synced through the new buildImport.ts code ever gets a
-- non-null value.
--
-- packed: whether this line has been physically packed, ticked on the pack
-- screen. Defaults false for both new and pre-existing rows -- there is no
-- historical tick data to recover, so "not yet packed" is the only honest
-- default.
alter table order_items
  add column if not exists is_fresh boolean,
  add column if not exists packed boolean not null default false;

-- team_write (0007_hardening.sql) already permits any team member
-- (packer/pier/manager) to update order_items, so the pack screen's
-- per-item tick and the import's is_fresh write both work with a plain
-- client-side update -- no new policy or security-definer function needed.
