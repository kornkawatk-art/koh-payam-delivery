-- 0016_line_contacts.sql
-- Phone -> LINE-account mapping, registered once by the customer via a LIFF
-- page (register-line-contact edge function). Used later (task 2, not this
-- migration) to auto-send order links over LINE instead of relying on the
-- customer opening an emailed/SMS link.

create table line_contacts (
  id uuid primary key default gen_random_uuid(),
  phone text not null unique,
  line_user_id text not null,
  display_name text,
  created_at timestamptz not null default now()
);

alter table line_contacts enable row level security;
create policy team_read on line_contacts for select to authenticated
  using (public.is_team_member());

-- No grant/revoke needed here (unlike create_claim in migration 0015) — this
-- is a plain table with RLS, not a security definer function; the
-- service-role key used by edge functions bypasses RLS by design, and no
-- authenticated/anon write path exists at all since there's no insert/
-- update/delete policy.
