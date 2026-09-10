-- Auto-create a profiles row for every new auth user at least-privilege role.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'name',''), split_part(new.email, '@', 1)),
    'packer'
  )
  on conflict (id) do nothing;
  return new;
end $$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill existing auth users with no profile row yet
insert into public.profiles (id, name, role)
select u.id, split_part(u.email, '@', 1), 'packer'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
