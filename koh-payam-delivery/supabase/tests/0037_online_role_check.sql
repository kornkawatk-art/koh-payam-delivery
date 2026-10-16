-- ตรวจสิทธิ์ของทีมออนไลน์ หลังรัน 0037 (แอปเกาะ) และ 0113 (O2O Desk) และย้ายบัญชีเป็น online แล้ว
-- สวมบทเป็นบัญชี online ที่เปิดใช้งานอยู่ 1 บัญชี ทุกอย่างอยู่ในทรานแซกชันที่ rollback ตอนจบ ไม่มีข้อมูลเปลี่ยน
-- ผ่าน: ผลลัพธ์ขึ้นแถว "ผ่านทุกข้อ"   ไม่ผ่าน: ขึ้น ERROR บอกข้อที่ไม่ผ่าน

begin;

do $$
declare
  uid uuid;
  n int;
  open_claim uuid;
begin
  select id into uid from public.profiles where role::text = 'online' and is_active limit 1;
  if uid is null then
    raise exception 'ยังไม่มีบัญชี online ที่เปิดใช้งาน ย้ายบัญชีทีมออนไลน์ก่อนแล้วรันใหม่';
  end if;
  select id into open_claim from public.makro_claims where status::text = 'open' limit 1;

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';

  -- แอปเกาะ: งานประจำวันทำได้
  if not public.is_team_member() then raise exception 'ไม่ผ่าน: online ไม่ได้เป็นทีมของแอปเกาะ'; end if;
  if not public.is_lead() then raise exception 'ไม่ผ่าน: online ไม่ได้สิทธิ์งานหัวหน้าประจำวัน'; end if;
  update public.orders set status = status where id in (select id from public.orders limit 1);
  get diagnostics n = row_count;
  if n = 0 and exists (select 1 from public.orders) then raise exception 'ไม่ผ่าน: online แก้ออเดอร์ไม่ได้'; end if;

  -- แอปเกาะ: ลบออเดอร์ไม่ได้
  delete from public.orders where id in (select id from public.orders limit 1);
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ไม่ผ่าน: online ลบออเดอร์ได้'; end if;

  -- O2O Desk: เห็นทุกเคลม
  if not public.makro_is_lead() then raise exception 'ไม่ผ่าน: online ไม่ได้สิทธิ์ของ O2O Desk'; end if;
  if public.makro_is_manager() then raise exception 'ไม่ผ่าน: online ได้สิทธิ์หัวหน้าของ O2O Desk'; end if;

  -- O2O Desk: ตัดสินเคลมไม่ได้
  if open_claim is not null then
    update public.makro_claims set reject_reason = 'ทดสอบ', status = 'rejected' where id = open_claim;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'ไม่ผ่าน: online ตัดสินเคลมได้'; end if;
  end if;

  -- O2O Desk: เคลมที่รอส่งงาน แก้ได้เฉพาะการส่งงาน (เลื่อนวันส่งชดเชยไม่ได้)
  if exists (select 1 from public.makro_claims where status::text = 'approved' and resolution::text = 'resend_next_day' and handoff_confirmed_at is null) then
    begin
      update public.makro_claims set resend_date = resend_date + 1
      where id = (select id from public.makro_claims
                  where status::text = 'approved' and resolution::text = 'resend_next_day' and handoff_confirmed_at is null limit 1);
      raise exception 'ไม่ผ่าน: online เลื่อนวันส่งชดเชยได้';
    exception when insufficient_privilege then
      null; -- ถูกปฏิเสธตามที่ควร
    end;
  end if;

  -- O2O Desk: แก้รายชื่อพนักงานไม่ได้
  update public.makro_staff set name = name;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'ไม่ผ่าน: online แก้รายชื่อพนักงานได้'; end if;

  execute 'reset role';
end $$;

select 'ผ่านทุกข้อ' as result;

rollback;
