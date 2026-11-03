-- ตรวจ PO ฝั่งเมียนมา หลังรัน 0039 (แอปเกาะ) และ 0122 (makro-claim)
-- ต้องมีบัญชี sale ที่เปิดใช้งาน และออเดอร์ใน makro_orders อย่างน้อย 1 ใบที่ยังไม่มีชื่อหน้าลัง
-- ทุกอย่างอยู่ในทรานแซกชันที่ rollback ตอนจบ ไม่มีข้อมูลเปลี่ยน
-- ผ่าน: ผลลัพธ์ขึ้นแถว "ผ่านทุกข้อ"   ไม่ผ่าน: ขึ้น ERROR บอกข้อที่ไม่ผ่าน

begin;

do $$
declare
  sale_id uuid;
  po text;
  day date;
  sd uuid;
  n int;
  as_user text := 'select set_config(''request.jwt.claims'', json_build_object(''sub'', %L, ''role'', ''authenticated'', ''aal'', ''aal2'')::text, true)';
begin
  select id into sale_id from public.profiles where role::text = 'sale' and is_active limit 1;
  select makro_order_no, ship_date into po, day from public.makro_orders m
  where not exists (select 1 from public.box_labels b where b.makro_order_no = m.makro_order_no)
    and not exists (select 1 from public.orders o where o.makro_order_no = m.makro_order_no) limit 1;
  if sale_id is null or po is null then raise exception 'ต้องมีบัญชี sale และออเดอร์ใน makro_orders ที่ยังไม่มีชื่อหน้าลัง'; end if;

  -- ปลายทาง myanmar และชื่อหน้าลังเก็บในออเดอร์ของแอปเกาะได้
  insert into public.ship_days (ship_date) values (day) on conflict do nothing;
  select id into sd from public.ship_days where ship_date = day;
  insert into public.box_labels (makro_order_no, label, created_by) values (po, 'ทดสอบ 0039', sale_id);
  insert into public.orders (ship_day_id, makro_order_no, customer_name_en, ship_date, link_token, island, box_label, paper_box_count, foam_box_count)
  values (sd, po, 'TEST 0039', day, 'test-0039-' || po, 'myanmar', 'ทดสอบ 0039', 2, 1);
  begin
    update public.orders set island = 'atlantis' where makro_order_no = po;
    raise exception 'ไม่ผ่าน: ปลายทางที่ไม่รู้จักบันทึกได้';
  exception when check_violation then null;
  end;

  -- sale เห็นสถานะ จำนวนลัง และลิงก์ลูกค้าของ PO ที่ตั้งชื่อไว้
  execute format(as_user, sale_id);
  execute 'set local role authenticated';
  select count(*) into n from public.box_label_orders(day) where makro_order_no = po and paper_box_count = 2 and foam_box_count = 1 and link_token = 'test-0039-' || po;
  if n <> 1 then raise exception 'ไม่ผ่าน: sale ไม่เห็นสถานะและลิงก์ของ PO ที่ตั้งชื่อหน้าลังไว้'; end if;
  execute 'reset role';

  -- คนที่ไม่ได้เข้าสู่ระบบเรียกไม่ได้
  execute 'set local role anon';
  begin
    perform public.box_label_orders(day);
    raise exception 'ไม่ผ่าน: คนที่ไม่ได้เข้าสู่ระบบเรียกได้';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end $$;

select 'ผ่านทุกข้อ' as result;

rollback;
