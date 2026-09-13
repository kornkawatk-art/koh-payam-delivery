-- 0018_line_contact_approval.sql
-- Manager approval gate before a phone's line_contacts row can be
-- re-registered to a DIFFERENT LINE account (feature/line-contact-approval).
-- First-time registration and same-account refreshes are unaffected -- see
-- register-line-contact/index.ts for the branch that decides which path a
-- request takes.

alter table line_contacts
  add column if not exists pending_line_user_id text,
  add column if not exists pending_display_name text,
  add column if not exists pending_requested_at timestamptz;

-- public.is_manager() already exists (first created in 0002_rls.sql, then
-- redefined with a stricter is_active check in 0013_manager_delete_orders.sql).
-- Reused as-is here, not redefined again.
create policy manager_update on line_contacts for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
