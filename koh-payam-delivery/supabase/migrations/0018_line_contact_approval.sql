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

-- public.is_manager() already exists (supabase/migrations/0013_manager_delete_orders.sql).
create policy manager_update on line_contacts for update to authenticated
  using (public.is_manager()) with check (public.is_manager());
