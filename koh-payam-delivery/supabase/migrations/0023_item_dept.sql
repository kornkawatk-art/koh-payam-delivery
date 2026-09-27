-- 0023_item_dept.sql
-- order_items.dept: the raw "Dept" number from Makro's OrderDetailExport
-- (feature/shortage-by-dept), so the shortage report can group by product
-- department and be fed back to each department owner.
--
-- Stored raw (text, as it appears in the file, e.g. '7') rather than as a
-- department name: the number -> name grouping (7/8/9 = DF1, ...) lives in
-- src/lib/departments.ts, so regrouping a number later never needs a
-- re-import. Nullable: rows imported before this migration never captured
-- Dept and show as "ไม่ทราบแผนก" until that day's file is imported again
-- (a same-day re-import deletes + reinserts the order's items, filling it).
alter table order_items
  add column if not exists dept text;

-- No new policy needed: team_write (0007_hardening.sql) already covers
-- inserts/updates of order_items by team members, and the shortage report's
-- read is the same team read it already uses.
