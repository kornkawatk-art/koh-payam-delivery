-- ตรวจแพ็กรวมตามเบอร์ หลังรัน 0038 (แอปเกาะ)
-- สวมบทเป็นบัญชีทีมที่เปิดใช้งานอยู่ 1 บัญชี ทุกอย่างอยู่ในทรานแซกชันที่ rollback ตอนจบ ไม่มีข้อมูลเปลี่ยน
-- ผ่าน: ผลลัพธ์ขึ้นแถว "ผ่านทุกข้อ"   ไม่ผ่าน: ขึ้น ERROR บอกข้อที่ไม่ผ่าน

begin;

do $$
declare
  uid uuid;
  n int;
begin
  select id into uid from public.profiles where is_active and role::text in ('manager', 'packer', 'online') limit 1;
  if uid is null then raise exception 'ไม่มีบัญชีทีมที่เปิดใช้งาน'; end if;

  -- คนนอกทีม (ไม่ได้เข้าสู่ระบบ) อ่านไม่ได้
  execute 'set local role anon';
  begin
    select count(*) into n from public.pack_merges;
    if n > 0 then raise exception 'ไม่ผ่าน: คนที่ไม่ได้เข้าสู่ระบบเห็นการแพ็กรวม'; end if;
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';

  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
  insert into public.pack_merges (ship_date, phone) values ('2000-01-01', '0800000038');
  select count(*) into n from public.pack_merges where ship_date = '2000-01-01' and phone = '0800000038' and created_by = uid;
  if n <> 1 then raise exception 'ไม่ผ่าน: ทีมบันทึกการแพ็กรวมไม่ได้'; end if;
  begin
    insert into public.pack_merges (ship_date, phone, created_by) values ('2000-01-01', '0800000039', gen_random_uuid());
    raise exception 'ไม่ผ่าน: บันทึกในชื่อคนอื่นได้';
  exception when insufficient_privilege or foreign_key_violation then null;
  end;
  delete from public.pack_merges where ship_date = '2000-01-01' and phone = '0800000038';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'ไม่ผ่าน: ทีมยกเลิกการแพ็กรวมไม่ได้'; end if;
  execute 'reset role';
end $$;

select 'ผ่านทุกข้อ' as result;

rollback;
