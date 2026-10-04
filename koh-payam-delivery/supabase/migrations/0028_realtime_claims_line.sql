-- 0028_realtime_claims_line.sql
-- The menu shows live counts of open claims and pending LINE registrations
-- (feature/nav-counts). Postgres-changes events still respect RLS, so only
-- the managers who can already read these rows receive them.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'claims') then
    alter publication supabase_realtime add table public.claims;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'line_contacts') then
    alter publication supabase_realtime add table public.line_contacts;
  end if;
end $$;
