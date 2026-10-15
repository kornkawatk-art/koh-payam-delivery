-- ตรวจสิทธิ์ของ sale หลังรัน 0036 (รันใน Supabase SQL Editor ได้ทั้งไฟล์)
-- สวมบทเป็นบัญชี sale ที่เปิดใช้งานอยู่ 1 บัญชี ทุกอย่างอยู่ในทรานแซกชันที่ rollback ตอนจบ ไม่มีข้อมูลเปลี่ยน
-- ผ่าน: ผลลัพธ์ขึ้นแถว "ผ่านทุกข้อ"   ไม่ผ่าน: ขึ้น ERROR บอกข้อที่ไม่ผ่าน

begin;

do $$
declare
  uid uuid;
  total_orders int;
  n int;
begin
  select id into uid from public.profiles where role::text = 'sale' and is_active limit 1;
  if uid is null then
    raise exception 'ยังไม่มีบัญชี sale ที่เปิดใช้งาน สร้างบัญชี sale ก่อนแล้วรันใหม่';
  end if;
  select count(*) into total_orders from public.orders;

  -- 1) ยังไม่ยืนยันสองชั้น (aal1): อ่านไม่ได้
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal1')::text, true);
  execute 'set local role authenticated';
  select count(*) into n from public.orders;
  if n <> 0 then raise exception 'ไม่ผ่าน: sale ที่ยังไม่ยืนยันสองชั้นอ่านออเดอร์ได้ % แถว', n; end if;
  execute 'reset role';

  -- 2) ยืนยันสองชั้นแล้ว (aal2)
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';

  -- อ่านได้: ออเดอร์ทุกแถว
  select count(*) into n from public.orders;
  if n <> total_orders then raise exception 'ไม่ผ่าน: sale อ่านออเดอร์ได้ % จาก % แถว', n, total_orders; end if;
  perform 1 from public.order_items limit 1;
  perform 1 from public.evidence_photos limit 1;
  perform 1 from public.boxes limit 1;
  perform 1 from public.ship_days limit 1;
  perform 1 from public.backorders limit 1;
  perform 1 from public.payment_releases limit 1;

  -- อ่านไม่ได้: เคลมของเกาะ ประวัติการใช้งาน รายชื่อ LINE
  select count(*) into n from public.claims;
  if n <> 0 then raise exception 'ไม่ผ่าน: sale อ่านเคลมของเกาะได้ % แถว', n; end if;
  select count(*) into n from public.audit_logs;
  if n <> 0 then raise exception 'ไม่ผ่าน: sale อ่านประวัติการใช้งานได้ % แถว', n; end if;
  select count(*) into n from public.line_contacts;
  if n <> 0 then raise exception 'ไม่ผ่าน: sale อ่านรายชื่อ LINE ได้ % แถว', n; end if;

  -- แก้ไม่ได้: update / delete ไม่โดนแถวไหนเลย
  update public.orders set status = status;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ไม่ผ่าน: sale แก้ออเดอร์ได้ % แถว', n; end if;
  update public.order_items set packed = packed;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ไม่ผ่าน: sale แก้รายการสินค้าได้ % แถว', n; end if;
  delete from public.evidence_photos;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ไม่ผ่าน: sale ลบรูปหลักฐานได้ % แถว', n; end if;
  delete from public.payment_releases;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ไม่ผ่าน: sale ลบการปลดล็อกชำระเงินได้ % แถว', n; end if;

  -- เพิ่มไม่ได้: ฐานข้อมูลต้องปฏิเสธ
  begin
    insert into public.ship_days (ship_date) values ('2099-12-31');
    raise exception 'ไม่ผ่าน: sale เพิ่มวันส่งได้';
  exception when insufficient_privilege then
    null; -- ถูกปฏิเสธตามที่ควร
  end;

  execute 'reset role';
  raise notice 'ผ่านทุกข้อ: sale (%) อ่านออเดอร์ได้ครบ % แถว อ่านเคลม/ประวัติ/LINE ไม่ได้ และแก้ข้อมูลไม่ได้', uid, total_orders;
end $$;

-- ถึงบรรทัดนี้ได้แปลว่าทุกข้อผ่าน (ถ้าข้อไหนไม่ผ่าน จะหยุดที่ ERROR ด้านบน)
select 'ผ่านทุกข้อ' as result;

rollback;
