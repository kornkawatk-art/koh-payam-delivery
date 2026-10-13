-- ผู้แจ้งเคลม (บทบาท sale) ต้องไม่เห็นข้อมูลของแอปจัดส่งเกาะ
-- ไม่ได้รันบนฐานข้อมูลจริง รอคำสั่ง "รันได้" จากผู้ใช้
--
-- นโยบายทีมทั้งหมดของแอปนี้ (team_read / team_write) เรียก is_team_member() ตัวเดียว
-- จึงแก้ฟังก์ชันนี้ที่เดียวก็ปิดสิทธิ์ sale ไม่ให้อ่านหรือแก้ข้อมูลเกาะได้ทั้งหมด
-- ทีมแพ็ค/ท่าเรือ/หัวหน้าไม่เปลี่ยนการทำงาน
--
-- ใช้ role::text เพราะค่า 'sale' ถูกเพิ่มใน enum โดย migration 0101 ของแอปเคลม
-- (ถ้าเทียบเป็น enum ตั้งแต่ตอนสร้างฟังก์ชัน จะยังไม่มีค่านี้ให้เทียบ)

create or replace function public.is_team_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active and role::text <> 'sale'
  )
$$;
