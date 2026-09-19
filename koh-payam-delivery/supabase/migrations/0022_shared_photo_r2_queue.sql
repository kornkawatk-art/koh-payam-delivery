-- 0022_shared_photo_r2_queue.sql
-- Customer-group shipping (feature/pier-customer-group): the pier screen attaches
-- ONE handoff photo to every PO of a customer shipped together, i.e. several
-- evidence_photos rows share one r2_key (one object in R2). tg_queue_r2_key
-- (0007_hardening.sql) queued the key for deletion on ANY row delete, so
-- removing the photo from one PO -- or a manager deleting a single PO -- would
-- have deleted the R2 object out from under the other POs' rows.
-- Now the key is queued only when no other evidence/claim photo row still
-- points at it. The last row to go (e.g. the final PO of the group, or the
-- last cascade in purge_old_orders) still queues it, because the trigger's
-- own query sees earlier deletions from the same command (volatile function).
create or replace function public.tg_queue_r2_key() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
       select 1 from public.evidence_photos
       where r2_key = old.r2_key and not (tg_table_name = 'evidence_photos' and id = old.id)
     )
     and not exists (
       select 1 from public.claim_photos
       where r2_key = old.r2_key and not (tg_table_name = 'claim_photos' and id = old.id)
     ) then
    insert into public.r2_delete_queue (r2_key) values (old.r2_key);
  end if;
  return old;
end $$;
