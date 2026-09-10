create or replace function public.tg_orders_set_shipped_at() returns trigger
language plpgsql as $$
begin
  if new.status = 'shipped' and old.status is distinct from 'shipped' and new.shipped_at is null then
    new.shipped_at := now();
  end if;
  if new.status = 'packed' and old.status is distinct from 'packed' and new.packed_at is null then
    new.packed_at := now();
  end if;
  return new;
end $$;

create trigger orders_set_shipped_at before update on orders
for each row execute function public.tg_orders_set_shipped_at();

create or replace function public.tg_orders_regen_boxes() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.paper_box_count = old.paper_box_count
     and new.foam_box_count = old.foam_box_count then
    return new;
  end if;
  delete from boxes where order_id = new.id;
  insert into boxes (order_id, box_type, seq, total)
    select new.id, 'paper', g, new.paper_box_count
    from generate_series(1, new.paper_box_count) g
  union all
    select new.id, 'foam', g, new.foam_box_count
    from generate_series(1, new.foam_box_count) g;
  return new;
end $$;

create trigger orders_regen_boxes after insert or update of paper_box_count, foam_box_count on orders
for each row execute function public.tg_orders_regen_boxes();
