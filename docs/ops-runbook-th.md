# คู่มือดูแลระบบ + ตั้งค่าโครงสร้างพื้นฐาน — แอปส่งสินค้าเกาะพยาม

> เอกสารนี้มี 3 ส่วน: (A) ตั้งค่าบัญชีคลาวด์ครั้งแรก — **ทำก่อนเริ่มพัฒนา**, (B) deploy ขึ้น production, (C) backup / กู้คืน / แก้ปัญหาที่พบบ่อย
>
> ทำเฉพาะ **ส่วน A** ตอนนี้ แล้วส่งค่าในช่อง "✏️ ค่าที่ได้" กลับมา

---

## ส่วน A — ตั้งค่าบัญชีคลาวด์ครั้งแรก (ทำครั้งเดียว, ~25–35 นาที)

ต้องเปิด 2 บริการ: **Supabase** (ฐานข้อมูล + ล็อกอิน) และ **Cloudflare R2** (เก็บรูป)
Vercel + GitHub ค่อยทำตอน deploy (ส่วน B) ยังไม่ต้องตอนนี้

---

### A1. Supabase — สร้างโปรเจกต์

1. ไปที่ https://supabase.com → **Start your project** → สมัครด้วย GitHub หรืออีเมล
2. กด **New project**
   - **Name:** `koh-payam`
   - **Database Password:** กด Generate แล้ว **คัดลอกเก็บไว้ให้ดี** (ใช้ตอนรัน migration, หาย = รีเซ็ตใหม่ได้แต่ยุ่ง)
   - **Region:** เลือก **`Southeast Asia (Singapore)`**
   - **Plan:** Free
3. กด **Create new project** → รอ ~2 นาทีจนขึ้นเขียว

### A2. Supabase — คัดลอกคีย์

ไปที่ **Project Settings** (รูปเฟือง ซ้ายล่าง) → **API**

| ช่องในหน้า Supabase | เอาไปใส่ตัวแปร | ✏️ ค่าที่ได้ |
|---|---|---|
| Project URL | `VITE_SUPABASE_URL` และ `SUPABASE_URL` | `https://__________.supabase.co` |
| Project API keys → `anon` `public` | `VITE_SUPABASE_ANON_KEY` | `eyJ...` (ยาวมาก) |
| Project API keys → `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` (ยาวมาก — **ห้ามหลุด ห้าม commit**) |

ไปที่ **Project Settings → General**

| ช่อง | เอาไปใช้ | ✏️ ค่าที่ได้ |
|---|---|---|
| Reference ID | ใช้ตอน `supabase link` | `____________________` |

### A3. Supabase — เปิดล็อกอินแบบอีเมล + 2FA

1. ซ้ายมือ **Authentication → Sign In / Providers** (หรือ **Providers**)
   - เปิด **Email** ให้ Enabled
   - **ปิด** "Confirm email" (ทีมเล็ก หัวหน้าสร้างบัญชีให้เอง ไม่ต้องยืนยันอีเมล)
2. **Authentication → (Settings / Multi-Factor)** → ยืนยันว่า **TOTP (App Authenticator)** เปิดอยู่
   (Supabase รุ่นใหม่เปิดให้โดยค่าเริ่มต้น — ถ้าเห็นสวิตช์ TOTP ให้เปิด)
3. **สร้างบัญชีทีมคนแรก (หัวหน้า):** **Authentication → Users → Add user → Create new user**
   - อีเมล + รหัสผ่านของคุณ, ติ๊ก **Auto Confirm User**
   - ✏️ อีเมลที่ใช้: `____________________`
   - หลังแอปเสร็จ ผมจะใส่สคริปต์ให้ตั้ง `role = manager` ให้บัญชีนี้ (หรือทำใน Table editor: ตาราง `profiles`)

### A4. Cloudflare R2 — สร้าง bucket + คีย์

> ⚠️ R2 ฟรี 10GB แต่ Cloudflare **ขอผูกบัตรเครดิต/เดบิตไว้ก่อน** (ไม่ตัดเงินถ้าไม่เกินโควตาฟรี) — ถ้าไม่สะดวกผูกบัตร บอกผม จะสลับไปเก็บรูปใน Supabase Storage แทน (ฟรี 1GB, พอสำหรับช่วงแรกถ้าบีบรูปเข้ม)

1. ไปที่ https://dash.cloudflare.com → สมัคร → ยืนยันอีเมล
2. เมนูซ้าย **R2 Object Storage** → **Create bucket**
   - **Name:** `koh-payam-photos`
   - **Location:** Automatic (หรือ Asia-Pacific)
3. หน้า bucket → แท็บ **Settings** → **Public Development URL** → กด **Enable**
   - จะได้ URL หน้าตา `https://pub-xxxxxxxx.r2.dev`

| ช่อง | ตัวแปร | ✏️ ค่าที่ได้ |
|---|---|---|
| Public Development URL | `R2_PUBLIC_BASE_URL` | `https://pub-________.r2.dev` |
| ชื่อ bucket | `R2_BUCKET` | `koh-payam-photos` |

4. **สร้าง API Token:** กลับหน้า R2 Overview → ขวาบน **{} API** หรือ **Manage R2 API Tokens** → **Create API Token**
   - **Permissions:** `Object Read & Write`
   - **Specify bucket:** เลือก `koh-payam-photos`
   - **TTL:** Forever
   - กด Create แล้วหน้าถัดไปจะโชว์ค่า **ครั้งเดียว** — คัดลอกทั้งหมด:

| ช่องในหน้า token | ตัวแปร | ✏️ ค่าที่ได้ |
|---|---|---|
| Access Key ID | `R2_ACCESS_KEY_ID` | `____________________` |
| Secret Access Key | `R2_SECRET_ACCESS_KEY` | `____________________` (**ห้ามหลุด**) |
| ในบรรทัด endpoint `https://<ตรงนี้>.r2.cloudflarestorage.com` | `R2_ACCOUNT_ID` | `____________________` |

5. **ตั้ง CORS ให้ bucket** (ให้เบราว์เซอร์อัปโหลดรูปตรงได้): bucket → **Settings** → **CORS Policy** → **Add CORS policy** → วาง JSON นี้:

```json
[
  {
    "AllowedOrigins": ["http://localhost:5173", "https://*.vercel.app"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```
(ตอน deploy จริงค่อยเพิ่มโดเมนจริงถ้ามี)

---

### A5. ส่งค่ากลับมา

คัดลอกบล็อกนี้ เติมค่าในช่องว่าง แล้วส่งกลับมาในแชต (ค่าเหล่านี้จะถูกใส่ในไฟล์ `.env.local` ที่ **ไม่ commit** ขึ้น git):

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_PROJECT_REF=
SUPABASE_DB_PASSWORD=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=koh-payam-photos
R2_PUBLIC_BASE_URL=
```

> **ข้อควรระวังเรื่องความปลอดภัย:** `service_role` key และ `R2_SECRET_ACCESS_KEY` มีสิทธิ์เต็ม — หลังใช้เสร็จ ถ้ากังวลว่าค่าไปอยู่ในประวัติแชต สามารถกด rotate/regenerate ใหม่ได้ทั้งคู่ (Supabase: Settings → API → Roll; R2: ลบ token เดิมสร้างใหม่) แล้วผมอัปเดต `.env.local` ให้

---

## ส่วน B — Deploy ขึ้น production (ทำทีหลัง หลังแอปเสร็จ)

1. **โค้ดขึ้น GitHub** (repo แบบ **private** เพราะเป็นแอปข้อมูลลูกค้า)
2. **Supabase migrations:**
   ```
   cd koh-payam-delivery
   npx supabase link --project-ref <SUPABASE_PROJECT_REF>
   npx supabase db push
   npx supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... R2_PUBLIC_BASE_URL=...
   npx supabase functions deploy order-view submit-claim photo-upload-url cleanup
   ```
3. **Vercel:** สมัครที่ vercel.com ด้วย GitHub → Import repo → ตั้ง Root Directory = `koh-payam-delivery` → ใส่ Environment Variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_R2_PUBLIC_BASE_URL` → Deploy
4. เพิ่มโดเมน Vercel (`*.vercel.app`) ลง CORS ของ R2 bucket
5. **Smoke test:** ล็อกอิน → นำเข้าไฟล์ตัวอย่าง → เปิดลิงก์ `/o/<token>` ในหน้าต่าง incognito
6. ตั้ง cron ลบข้อมูล 30 วัน: Supabase Dashboard → Database → Cron (หรือใช้ `cron.schedule` ใน migration 0004) + ตั้งให้เรียก Edge `cleanup` วันละครั้ง

---

## ส่วน C — Backup / กู้คืน / แก้ปัญหา

### Backup รายสัปดาห์
- รัน `scripts/weekly-backup.sh` (ตั้ง env `SUPABASE_DB_URL` ก่อน — เอาจาก Supabase → Settings → Database → Connection string → URI)
- เก็บไฟล์ `.dump` ไว้อย่างน้อย 4 สัปดาห์ (สคริปต์ลบของเก่ากว่า 60 วันให้เอง)
- ตั้งเตือนใน LINE ทีมทุกวันจันทร์
- รูปบน R2 ไม่รวมใน backup นี้ (ข้อมูลรูปถูกลบอัตโนมัติใน 30 วันอยู่แล้ว)

### กู้คืน
```
createdb koh_payam_restore
pg_restore --no-owner --no-privileges -d koh_payam_restore db-YYYYMMDD.dump
```

### ปัญหาที่พบบ่อย
| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| อัปโหลดรูปไม่ขึ้น | CORS ของ R2 bucket ไม่มี origin ปัจจุบัน → เพิ่มใน Settings → CORS Policy |
| ลูกค้าเปิดลิงก์ไม่ได้ ("not found") | ทีมกด "สร้างลิงก์ใหม่" ไปแล้ว (ลิงก์เก่าใช้ไม่ได้) หรือออเดอร์เกิน 30 วันถูกลบ → ส่งลิงก์ล่าสุดจากหน้ารายละเอียดออเดอร์ |
| ปุ่มแจ้งเคลมของลูกค้าหาย | เกิน 48 ชม. หลังสถานะ "ส่งที่ท่าเรือแล้ว" — ปิดรับเคลมตามกติกา |
| ล็อกอินติดหน้า 2FA เข้าไม่ได้ | หัวหน้าเข้า Supabase → Authentication → Users → เลือกผู้ใช้ → ลบ MFA factor → ให้ผู้ใช้ตั้งใหม่ |
| ลบเรือในหน้าตั้งค่าไม่ได้ | มีออเดอร์ผูกกับเรือนั้นแล้ว — ย้ายออเดอร์ไปเรืออื่นก่อน |
| นำเข้าไฟล์แล้วคอลัมน์เพี้ยน | กดแก้ "จับคู่คอลัมน์" ใหม่ (ระบบจำค่าล่าสุดไว้ใน browser) |
