-- 0042_drop_voided_orders.sql
-- ออเดอร์ที่แม็คโครยกเลิก/คืน หลังนำเข้าแอปไปแล้ว: ตอนนำเข้าไฟล์ใหม่ (มือหรือ auto-import ทุกชั่วโมง)
-- ลบออกจากแอปให้เอง ถ้ายังไม่มีใครเริ่มทำงานกับออเดอร์นั้น
--   ยังไม่เริ่ม = สถานะ imported, ไม่มีรูปหลักฐาน, ไม่มีกล่อง, ไม่มีเคลม,
--                 ไม่ได้แพ็ครวมกับออเดอร์อื่น และไม่มีของค้างส่งจากออเดอร์อื่นมารอใส่กล่องนี้
-- ที่เริ่มแล้วไม่ลบ: แอปขึ้นป้ายแดง "ยกเลิก" และห้ามขึ้นเรือเหมือนเดิม ให้หัวหน้าตัดสินใจเอง
-- ลบได้ทั้งทีมที่นำเข้าได้ (ไม่ใช่แค่หัวหน้าแบบ manager_delete) เพราะลบเฉพาะออเดอร์ที่แม็คโครบอกว่ายกเลิก
-- และยังไม่มีงานติดอยู่ · บันทึก audit_logs ทุกออเดอร์ที่ลบ
-- ไม่ได้รันบนฐานข้อมูลจริง รอผู้ใช้รันเอง (แอปที่ยังไม่มีฟังก์ชันนี้ ก็ยังขึ้นป้ายแดงได้ตามเดิม)

create or replace function public.drop_voided_orders(p_nos text[], p_statuses text[])
returns text[]
language plpgsql security definer set search_path = public as $$
declare
  dropped text[] := '{}';
  o record;
begin
  -- auto-import ใช้ service role (ไม่มี auth.uid()); คนที่ล็อกอินต้องเป็นทีม
  if auth.uid() is not null and not public.is_team_member() then
    raise exception 'ไม่มีสิทธิ์' using errcode = 'insufficient_privilege';
  end if;
  for o in
    select x.id, x.makro_order_no, x.customer_name_en, x.ship_date, n.status as makro_status
    from public.orders x
    join unnest(p_nos, p_statuses) as n(no, status) on n.no = x.makro_order_no
    where x.status = 'imported'
      and x.packed_with_order_id is null
      and not exists (select 1 from public.evidence_photos p where p.order_id = x.id)
      and not exists (select 1 from public.boxes b where b.order_id = x.id)
      and not exists (select 1 from public.claims c where c.order_id = x.id)
      and not exists (select 1 from public.orders w where w.packed_with_order_id = x.id)
      and not exists (select 1 from public.backorders k where k.target_order_id = x.id)
    for update of x
  loop
    delete from public.orders where id = o.id;
    insert into public.audit_logs (user_id, action, entity_type, entity_id, meta)
    values (auth.uid(), 'order_deleted_voided', 'order', o.id::text,
            jsonb_build_object('makroOrderNo', o.makro_order_no, 'customerNameEn', o.customer_name_en,
                               'shipDate', o.ship_date, 'makroStatus', o.makro_status));
    dropped := dropped || o.makro_order_no;
  end loop;
  return dropped;
end $$;

revoke all on function public.drop_voided_orders(text[], text[]) from public, anon;
grant execute on function public.drop_voided_orders(text[], text[]) to authenticated, service_role;
