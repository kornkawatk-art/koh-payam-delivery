# คู่มือดูแลระบบ + ตั้งค่าโครงสร้างพื้นฐาน — แอปส่งสินค้าเกาะพยาม

> เอกสารนี้มี 3 ส่วน: (A) ตั้งค่าบัญชีคลาวด์ครั้งแรก, (B) deploy ขึ้น production, (C) backup / กู้คืน / เพิ่มสมาชิกทีม / แก้ปัญหาที่พบบ่อย
>
> **สถานะปัจจุบัน (2026-09):** ส่วน A ทำเสร็จแล้ว และ backend บน Supabase (ฐานข้อมูล + Edge Functions + cron) กับ Cloudflare R2 **ขึ้น production แล้ว** เหลือแค่ deploy หน้าเว็บขึ้น Vercel (ส่วน B ขั้นที่ 2) กับตั้ง CORS ของ R2 (ส่วน B ขั้นที่ 3)

---

## ข้อมูลโปรเจกต์จริง (ใช้อ้างอิงเวลาแก้ปัญหา)

| ค่า | ข้อมูล |
|---|---|
| Supabase project | `koh-payam` (org `payam-app`) |
| Project ref | `kprlqjxwolljkgqyzygf` |
| Region | `ap-southeast-1` (Singapore) |
| Supabase URL | `https://kprlqjxwolljkgqyzygf.supabase.co` |
| Edge Functions | `order-view`, `photo-upload-url`, `submit-claim`, `register-line-contact`, `cleanup` (ทุกตัว `verify_jwt = false`) และ `send-order-links` (**ไม่มี** entry ใน `config.toml` โดยตั้งใจ → คง `verify_jwt = true` ค่าเริ่มต้น เพราะเรียกจากเซสชันทีมที่ล็อกอินแล้วเท่านั้น ไม่ใช่ลิงก์ลูกค้า) |
| R2 bucket | `koh-payam-photos` (Cloudflare) |
| R2 public base URL | `https://pub-4a2a896c192541cf87225ae05c77fb39.r2.dev` |
| Migrations ที่ apply แล้ว | `0001`–`0007` (`0007` = team-access gate `is_active` + realtime `orders` + R2-key delete triggers) |
| pg_cron jobs | `purge-old-orders` (`0 3 * * *`), `r2-cleanup` (`10 3 * * *`) |
| บัญชีทีมคนแรก (หัวหน้า) | `kornkawat.k@gmail.com` (role = `manager`) |

> ค่าคีย์ลับ (DB password, service_role key, R2 keys, `CLEANUP_SECRET`, `LIFF_CHANNEL_ID`, `LINE_CHANNEL_ACCESS_TOKEN`) **ไม่อยู่ในเอกสารนี้** — เก็บใน `koh-payam-delivery/.env.local` (ไม่ commit) และใน Supabase → Edge Functions → Secrets

---

## ส่วน A — ตั้งค่าบัญชีคลาวด์ครั้งแรก (ทำครั้งเดียว — **ทำเสร็จแล้ว**)

> ส่วนนี้เก็บไว้เป็นบันทึกว่าตั้งค่าอะไรไปบ้าง เผื่อต้องสร้างโปรเจกต์ใหม่ตั้งแต่ต้น (ดูส่วน B ขั้นที่ 4)

ต้องเปิด 2 บริการ: **Supabase** (ฐานข้อมูล + ล็อกอิน) และ **Cloudflare R2** (เก็บรูป)
Vercel + GitHub ทำในส่วน B

---

### A1. Supabase — สร้างโปรเจกต์

1. ไปที่ https://supabase.com → **Start your project** → สมัครด้วย GitHub หรืออีเมล
2. กด **New project**
   - **Name:** `koh-payam`
   - **Database Password:** กด Generate แล้ว **คัดลอกเก็บไว้ให้ดี** (ใช้ตอนรัน migration, หาย = รีเซ็ตใหม่ได้แต่ยุ่ง)
   - **Region:** เลือก **`Southeast Asia (Singapore)`** (`ap-southeast-1`)
   - **Plan:** Free
3. กด **Create new project** → รอ ~2 นาทีจนขึ้นเขียว

### A2. Supabase — คัดลอกคีย์

> Supabase เปลี่ยนรูปแบบ key ใหม่ (ปี 2025+) เป็น `sb_publishable_...` / `sb_secret_...` — ใช้แบบใหม่ได้เลย ไม่ต้องเปิด "Legacy API keys"

ไปที่ **Project Settings** (รูปเฟือง ซ้ายล่าง) → **API Keys** (หรือ **API** / **Data API**)

| ช่องในหน้า Supabase | เอาไปใส่ตัวแปร | ✏️ ค่าที่ได้ |
|---|---|---|
| Project URL | `VITE_SUPABASE_URL` | `https://kprlqjxwolljkgqyzygf.supabase.co` |
| **Publishable key** (`sb_publishable_...`) | `VITE_SUPABASE_ANON_KEY` | เก็บใน `.env.local` |
| **Secret key** (`sb_secret_...`) — ถ้ายังไม่มี กด **Create new secret key** ตั้งชื่อ `edge-functions`, คัดลอกตอนโชว์ครั้งเดียว | `SUPABASE_SERVICE_ROLE_KEY` | เก็บใน `.env.local` (**ห้ามหลุด ห้าม commit**) |

ไปที่ **Project Settings → General**

| ช่อง | เอาไปใช้ | ✏️ ค่าที่ได้ |
|---|---|---|
| Project ID (= Reference ID) | `SUPABASE_PROJECT_REF` — ใช้ตอน `supabase link` | `kprlqjxwolljkgqyzygf` |

> Database password: รหัสที่ตั้งตอนสร้างโปรเจกต์ → `SUPABASE_DB_PASSWORD` (ลืม = Settings → Database → Reset database password)
> โค้ดของเราใช้ `@supabase/supabase-js` v2 ซึ่งรองรับ key แบบใหม่ ไม่ต้องแก้อะไร ชื่อ env ยังเป็น `VITE_SUPABASE_ANON_KEY` เหมือนเดิม (แค่ค่าข้างในเป็น publishable key)

### A3. Supabase — เปิดล็อกอินแบบอีเมล + 2FA

1. ซ้ายมือ **Authentication → Sign In / Providers** (หรือ **Providers**)
   - เปิด **Email** ให้ Enabled
   - **ปิด** "Confirm email" (ทีมเล็ก หัวหน้าสร้างบัญชีให้เอง ไม่ต้องยืนยันอีเมล)
2. **Authentication → (Settings / Multi-Factor)** → ยืนยันว่า **TOTP (App Authenticator)** เปิดอยู่
   (Supabase รุ่นใหม่เปิดให้โดยค่าเริ่มต้น — ถ้าเห็นสวิตช์ TOTP ให้เปิด)
3. **สร้างบัญชีทีมคนแรก (หัวหน้า):** **Authentication → Users → Add user → Create new user**
   - อีเมล + รหัสผ่านของคุณ, ติ๊ก **Auto Confirm User**
   - ✏️ อีเมลที่ใช้: `kornkawat.k@gmail.com`
   - trigger `handle_new_user` (migration `0005`) จะสร้างแถวใน `profiles` ให้อัตโนมัติที่บทบาท `packer`
   - จากนั้นเลื่อนขั้นเป็น `manager` ด้วย SQL (ทำครั้งเดียว — ดูวิธีเพิ่ม/เปลี่ยนบทบาทสมาชิกในส่วน C):
     ```sql
     update public.profiles
     set role = 'manager'
     where id = (select id from auth.users where email = 'kornkawat.k@gmail.com');
     ```

### A4. Cloudflare R2 — สร้าง bucket + คีย์

> ⚠️ R2 ฟรี 10GB แต่ Cloudflare **ขอผูกบัตรเครดิต/เดบิตไว้ก่อน** (ไม่ตัดเงินถ้าไม่เกินโควตาฟรี)

1. ไปที่ https://dash.cloudflare.com → สมัคร → ยืนยันอีเมล
2. เมนูซ้าย **R2 Object Storage** → **Create bucket**
   - **Name:** `koh-payam-photos`
   - **Location:** Automatic (หรือ Asia-Pacific)
3. หน้า bucket → แท็บ **Settings** → **Public Development URL** → กด **Enable**
   - จะได้ URL หน้าตา `https://pub-xxxxxxxx.r2.dev` → ตอนนี้คือ `https://pub-4a2a896c192541cf87225ae05c77fb39.r2.dev`

| ช่อง | ตัวแปร | ✏️ ค่าที่ได้ |
|---|---|---|
| Public Development URL | `R2_PUBLIC_BASE_URL` / `VITE_R2_PUBLIC_BASE_URL` | `https://pub-4a2a896c192541cf87225ae05c77fb39.r2.dev` |
| ชื่อ bucket | `R2_BUCKET` | `koh-payam-photos` |

4. **สร้าง API Token:** กลับหน้า R2 Overview → ขวาบน **{} API** หรือ **Manage R2 API Tokens** → **Create API Token**
   - **Permissions:** `Object Read & Write`
   - **Specify bucket:** เลือก `koh-payam-photos`
   - **TTL:** Forever
   - กด Create แล้วหน้าถัดไปจะโชว์ค่า **ครั้งเดียว** — คัดลอกทั้งหมดเก็บใน `.env.local`:

| ช่องในหน้า token | ตัวแปร |
|---|---|
| Access Key ID | `R2_ACCESS_KEY_ID` |
| Secret Access Key | `R2_SECRET_ACCESS_KEY` (**ห้ามหลุด**) |
| ในบรรทัด endpoint `https://<ตรงนี้>.r2.cloudflarestorage.com` | `R2_ACCOUNT_ID` |

5. **ตั้ง CORS ให้ bucket** — ⚠️ **ขั้นตอนนี้ยังไม่ได้ทำ ต้องทำเองในหน้า Cloudflare** (ถ้าไม่ตั้ง ลูกค้า/ทีมจะอัปโหลดรูปไม่ได้):
   bucket `koh-payam-photos` → **Settings** → **CORS Policy** → **Add CORS policy** → วาง JSON นี้:

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
   หลัง deploy Vercel ได้โดเมนจริงแล้ว ให้เพิ่มโดเมนนั้นใน `AllowedOrigins` ด้วย (ดูส่วน B ขั้นที่ 3)

---

### A5. คีย์ทั้งหมด (บันทึกไว้ใน `.env.local` — ไม่ commit)

ดูรายชื่อตัวแปรครบใน `koh-payam-delivery/.env.example` — ค่าจริงอยู่ใน `.env.local` (gitignored) และใน Supabase → Edge Functions → Secrets

```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_R2_PUBLIC_BASE_URL=
VITE_LIFF_ID=
SUPABASE_PROJECT_REF=
SUPABASE_DB_PASSWORD=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ACCESS_TOKEN=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=koh-payam-photos
R2_PUBLIC_BASE_URL=
CLEANUP_SECRET=
LIFF_CHANNEL_ID=
LINE_CHANNEL_ACCESS_TOKEN=
SITE_URL=
```

> `VITE_LIFF_ID` เป็นค่า public (ฝังในหน้าเว็บได้ ไม่ใช่ความลับ) ส่วน `LIFF_CHANNEL_ID`, `LINE_CHANNEL_ACCESS_TOKEN`, `SITE_URL` เป็น secret ของฝั่ง Edge Functions เท่านั้น — ดูวิธีได้ค่าเหล่านี้ในหัวข้อ A6 ถัดไป

> **ความปลอดภัย:** `SUPABASE_SERVICE_ROLE_KEY` และ `R2_SECRET_ACCESS_KEY` มีสิทธิ์เต็ม — ถ้ากังวลว่าค่าหลุด rotate ใหม่ได้ (Supabase: Settings → API → Roll; R2: ลบ token เดิมสร้างใหม่) แล้วอัปเดต `.env.local` + `supabase secrets set` ใหม่

---

### A6. LINE Developers Console — เปิด Messaging API + สร้าง LIFF app — **ทำเสร็จแล้ว**

> ฟีเจอร์นี้ (ลงทะเบียนลูกค้าผ่าน LIFF + ส่งลิงก์ออเดอร์อัตโนมัติหลังตั้งค่าเรือประจำวัน) ตั้งค่าเสร็จสมบูรณ์แล้วเมื่อ 2026-09-13 — เก็บขั้นตอนจริงที่ใช้ได้ไว้อ้างอิงกรณีต้องตั้งใหม่/ย้ายบัญชี (LINE เปลี่ยนขั้นตอนบ่อย ขั้นตอนด้านล่างคือของจริงที่ใช้ได้ ณ วันที่ทำ ไม่ใช่ตามเอกสาร LINE ที่อาจเก่ากว่านี้):

1. **หา Messaging API channel ที่ผูกกับ OA จริงก่อน** — ห้ามเดาจากชื่อ provider เฉยๆ วิธีเช็คให้ชัวร์:
   - เข้า https://manager.line.biz/ (LINE Official Account Manager) → เลือก OA ตัวที่ลูกค้าแชทอยู่จริง → Settings (⚙️) → **Messaging API** → จะเห็น **Channel ID** ของ channel จริง (**ไม่มี Channel access token ในหน้านี้** — หน้านี้มีแค่ Channel ID/Secret/Webhook)
   - เอา Channel ID นั้นไปเปิดตรงที่ `https://developers.line.biz/console/channel/<Channel ID>/` ใน Developers Console — จะเข้าถึง channel ได้ตรงแม้ provider ในลิสต์ฝั่งซ้ายจะดูไม่ตรงชื่อ/หา provider ไม่เจอในเมนู (ในทางปฏิบัติจริง เจอกรณี OA ชื่อร้านแต่ channel ทาง Developers Console ถูกจัดไว้ใต้ provider คนละชื่อไปเลย — เกิดจากสิทธิ์ผู้ดูแล OA กับสิทธิ์ Developers Console เป็นคนละระบบสิทธิ์กัน)
2. คัดลอก **Channel access token** (long-lived) จากแท็บ **Messaging API** ของ channel นั้นใน Developers Console (เลื่อนผ่านส่วน Webhook — **ห้ามแตะ/แก้ Webhook เดิมเด็ดขาด** ถ้ามีแชทบอทเดิมทำงานอยู่แล้ว) → ใส่เป็น `LINE_CHANNEL_ACCESS_TOKEN`
3. **สร้าง LIFF app — ปัจจุบัน LINE ไม่ให้เพิ่ม LIFF เข้า Messaging API channel ตรงๆ แล้ว** ต้องสร้าง **LINE Login channel แยกใหม่** (channel type ใหม่) ภายใต้ **provider เดียวกัน** กับ Messaging API channel (สำคัญ: provider เดียวกันเท่านั้น ถึงจะได้ userId ตรงกัน — คนละ provider ส่งข้อความไม่ได้เลย):
   - Developers Console → provider เดียวกับ Messaging API channel → **Create a new channel → Create a LINE Login channel** → ตั้งชื่อ (เช่น "Koh Payam LIFF")
   - เข้า channel ใหม่นี้ → แท็บ **LIFF** → **Add**:
     - **Endpoint URL:** `<โดเมนเว็บจริง>/liff/register` (เช่น `https://koh-payam-delivery-omega.vercel.app/liff/register`)
     - **Scope:** ติ๊ก `openid` และ `profile`
     - **Size:** Full
     - **Add friend option:** **Off** (ลูกค้าที่มาหน้านี้เป็นเพื่อนกับ OA อยู่แล้วเสมอ ไม่ต้องมีหน้าชวนเพิ่มเพื่อนซ้ำ)
   - บันทึกแล้วจะได้ **LIFF ID** (หน้าตา `1234567890-AbCdEfGh`)
4. คัดลอก 2 ค่านี้จาก **channel ใหม่ (LINE Login channel)** — คนละที่กับ Messaging API channel เดิม:
   - `VITE_LIFF_ID` = LIFF ID จากขั้นที่ 3 — ค่านี้ฝังในหน้าเว็บ ไม่ใช่ความลับ **ต้องไปตั้งเป็น Environment Variable ใน Vercel เอง** (Vercel → โปรเจกต์ → Settings → Environment Variables → เพิ่ม `VITE_LIFF_ID`) **แล้ว Redeploy ใหม่ 1 ครั้ง** ค่าใหม่ถึงจะมีผล — คนละขั้นตอนกับ `supabase secrets set` ด้านล่าง (อันนั้นเป็น secret ฝั่ง edge function เท่านั้น ไม่ใช่ตัวแปรฝั่งเว็บ)
   - `LIFF_CHANNEL_ID` = **Channel ID ของ LINE Login channel ใหม่นี้** (แท็บ **Basic settings** ของมันเอง — **ไม่ใช่** Channel ID ของ Messaging API channel เดิม แม้จะดูคล้ายกันก็ตาม สองอันนี้เป็นคนละเลขกันเสมอ) — edge function `register-line-contact` เอาไปใช้เป็น `client_id` ตอนตรวจสอบ id token กับ LINE ถ้าใส่ผิด (เช่นใส่ Channel ID ของ Messaging API channel แทน) จะได้ 401 "ยืนยันตัวตน LINE ไม่สำเร็จ" ทุกครั้ง
5. ใส่ `SITE_URL` เป็นโดเมนเว็บจริง (ไม่มี `/` ท้าย) — `send-order-links` เอาไปต่อเป็น `<SITE_URL>/o/<token>` ตอนส่งลิงก์ทาง LINE
6. รัน `supabase secrets set LIFF_CHANNEL_ID=... LINE_CHANNEL_ACCESS_TOKEN=... SITE_URL=...` (ดูขั้นที่ 4 ด้านล่าง) แล้ว `supabase functions deploy register-line-contact send-order-links`

> ✅ **เช็คด่วนหลังตั้งค่า**: `curl -X GET https://api.line.me/v2/bot/info -H "Authorization: Bearer <LINE_CHANNEL_ACCESS_TOKEN>"` ต้องได้ `displayName`/`basicId` ของ OA จริงกลับมา ไม่ใช่ error — ถ้า error แปลว่า token ผิด/หมดอายุ

> 🔧 **กู้คืนกรณีวันไหนถูกทำเครื่องหมายว่า "ส่งแล้ว" ทั้งที่ยังไม่ได้ส่งจริง** (เช่น เผลอ deploy ก่อนตั้ง secrets): ระบบส่งลิงก์ได้วันละครั้งเท่านั้น ถ้าต้องให้ส่งใหม่ ให้ล้างตัวกันซ้ำด้วย SQL ใน Supabase → SQL Editor แล้วกด **บันทึก** ที่หน้า "ตั้งค่าเรือประจำวัน" อีกครั้ง (ส่งได้เฉพาะ **วันปัจจุบัน** เท่านั้น — วันย้อนหลังระบบจะข้ามให้เงียบ ๆ เพราะลิงก์หมดอายุไปแล้ว):
> ```sql
> update ship_days set links_sent_at = null where ship_date = '<date>';
> ```

> ⚠️ **โควตาข้อความ:** ร้านมีออเดอร์จริงมากกว่า 50 รายการ/วัน ซึ่ง**เกินโควตาฟรีของ LINE Official Account แน่นอน** — ต้องอัปเกรดเป็นแพลนเสียเงิน (Light/Standard) ก่อนเปิดใช้ฟีเจอร์นี้กับลูกค้าจริง ไม่งั้นข้อความจะถูกบล็อกกลางทาง

---

## ส่วน B — Deploy ขึ้น production

**สรุปสถานะ:** backend (Supabase migrations + Edge Functions + secrets + cron) กับ R2 bucket **ทำเสร็จแล้ว** — เหลือขั้นที่ 1–3 และ 5 ส่วนขั้นที่ 4 เก็บไว้กรณีต้องสร้างโปรเจกต์ใหม่

### ขั้นที่ 1 — โค้ดขึ้น GitHub (repo แบบ private)

1. สร้าง repo ใหม่บน GitHub แบบ **Private** (แอปนี้มีข้อมูลลูกค้า — ห้าม public)
2. ⚠️ **ประวัติ branch `build/koh-payam-delivery-app` มี commit เก่าที่เคยเผลอ commit ไฟล์ `password.txt`** (คีย์ของโปรเจกต์ Supabase เก่าที่เลิกใช้แล้ว — commit `2af7387`, ถูกเอาออกจาก tracking ที่ `ee1778b` แต่ยังอยู่ในประวัติ)
   - **วิธีที่แนะนำ:** ให้ controller **squash-merge** branch นี้เข้า `main` แล้ว **push `main` (แบบ squash)** ขึ้น GitHub — ประวัติจะเหลือ commit เดียว ไม่มี `password.txt` ติดไป
   - **ถ้าจำเป็นต้อง push ทั้ง branch:** ต้อง scrub `password.txt` ออกจากประวัติก่อน เช่น
     ```
     git filter-repo --path password.txt --invert-paths
     ```
     (หรือ `git filter-branch` / BFG) แล้วค่อย push
   - ถึงคีย์ในไฟล์นั้นจะเป็นของโปรเจกต์เก่าที่เลิกใช้แล้ว ก็ไม่ควรปล่อยติดไปในประวัติ repo

### ขั้นที่ 2 — Vercel (deploy หน้าเว็บ) — **ยังไม่ได้ทำ**

1. สมัคร https://vercel.com ด้วย GitHub → **Add New… → Project** → เลือก repo ที่ push ไว้
2. ตั้งค่า import:
   - **Root Directory:** `koh-payam-delivery`  ← สำคัญ (โค้ดแอปอยู่ในโฟลเดอร์ย่อย ไม่ใช่ราก repo)
   - **Framework Preset:** `Vite`
   - Build command / Output ปล่อยค่า default (`npm run build` → `dist`)
3. **Environment Variables** — ใส่ 3 ตัว (ค่าจาก `.env.local`):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_R2_PUBLIC_BASE_URL`
4. กด **Deploy** → รอจนเขียว → ได้โดเมน `https://<ชื่อ>.vercel.app`
   - `vercel.json` ในโฟลเดอร์ตั้ง SPA rewrite ไว้แล้ว (ทุก path → `index.html`) เพื่อให้ refresh หน้าลึก ๆ เช่น `/o/<token>` ไม่ 404

### ขั้นที่ 3 — เพิ่มโดเมน Vercel ลง CORS ของ R2 — **ต้องทำหลังขั้นที่ 2**

Cloudflare → R2 → bucket `koh-payam-photos` → **Settings → CORS Policy** → แก้ `AllowedOrigins` ให้มีโดเมนจริง:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://*.vercel.app",
      "https://<โดเมนจริงของคุณ>.vercel.app"
    ],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

> `https://*.vercel.app` ครอบคลุม preview deployment ด้วย แต่บาง config ไม่ match wildcard กับ subdomain ซ้อน — ใส่โดเมน production เต็ม ๆ ไว้ด้วยจะชัวร์กว่า

### ขั้นที่ 4 — คำสั่งสร้าง backend ใหม่ตั้งแต่ต้น (อ้างอิง — ปกติ**ไม่ต้องรัน** เพราะทำไปแล้ว)

ใช้เมื่อย้ายไป Supabase project ใหม่ หรือกู้ระบบทั้งหมด รันจากในโฟลเดอร์ `koh-payam-delivery/`:

```bash
# 1) เชื่อม CLI กับ cloud project (ไม่ใช้ Docker/local — push ตรงขึ้น cloud)
supabase link --project-ref kprlqjxwolljkgqyzygf
# (จะถาม DB password — ใส่ค่า SUPABASE_DB_PASSWORD)

# 2) push migrations ขึ้น cloud DB (0001 ถึงเลขล่าสุด)
supabase db push

# 3) ตั้ง secrets ของ Edge Functions (ค่าจริงจาก .env.local — LIFF_CHANNEL_ID /
#    LINE_CHANNEL_ACCESS_TOKEN / SITE_URL มาจากขั้นตอน A6 ด้านบน)
supabase secrets set \
  R2_ACCOUNT_ID=... \
  R2_ACCESS_KEY_ID=... \
  R2_SECRET_ACCESS_KEY=... \
  R2_BUCKET=koh-payam-photos \
  R2_PUBLIC_BASE_URL=https://pub-4a2a896c192541cf87225ae05c77fb39.r2.dev \
  CLEANUP_SECRET=cs_xxxxxxxxxxxxxxxx \      # สุ่มค่าใหม่ยาว ๆ ก็ได้
  LIFF_CHANNEL_ID=... \
  LINE_CHANNEL_ACCESS_TOKEN=... \
  SITE_URL=https://<โดเมนเว็บจริง>

# 4) deploy Edge Functions ทั้งหมด
#    (order-view/photo-upload-url/submit-claim/register-line-contact/cleanup
#    มี verify_jwt=false ใน config.toml แล้ว; send-order-links ตั้งใจไม่มี entry
#    เลยคง verify_jwt=true ค่าเริ่มต้น — ดูคอมเมนต์ใน config.toml)
supabase functions deploy order-view photo-upload-url submit-claim register-line-contact send-order-links cleanup
```

จากนั้นใน **Supabase Dashboard → SQL Editor** รัน:

```sql
-- (ก) เลื่อนบัญชีหัวหน้าเป็น manager (trigger handle_new_user สร้าง profile ให้เป็น 'packer' อัตโนมัติ)
update public.profiles
set role = 'manager'
where id = (select id from auth.users where email = 'kornkawat.k@gmail.com');

-- (ข) ต่อ cron job "r2-cleanup" ให้ยิงเข้า Edge Function cleanup ทุกวัน 03:10
--     (migration 0006 ตั้ง cron "purge-old-orders" 03:00 ให้แล้ว แต่ตัวนี้ต้องต่อ net.http_post เอง
--      เพราะต้องแนบ secret ใน header — เก็บ secret ไว้ใน vault)
select vault.create_secret('<ค่า CLEANUP_SECRET ตัวเดียวกับที่ set ใน secrets>', 'cleanup_secret');

select cron.schedule(
  'r2-cleanup',
  '10 3 * * *',
  $$
  select net.http_post(
    url := 'https://kprlqjxwolljkgqyzygf.supabase.co/functions/v1/cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_secret')
    )
  )
  $$
);
```

> ลำดับงานของ cron: 03:00 `purge-old-orders` ลบแถวออเดอร์/เคลม/audit ที่เกิน 30 วัน และหย่อน key ของรูปลง `r2_delete_queue` → 03:10 `r2-cleanup` เรียก Edge `cleanup` ให้ไปลบไฟล์จริงบน R2 ตามคิวนั้น

### ขั้นที่ 5 — Smoke test (หลัง deploy Vercel + ตั้ง CORS)

> ⚠️ **ต้องรัน smoke test นี้ให้ครบทุกข้อ *ก่อน* นำเข้าข้อมูลลูกค้าจริงชุดแรก** — unit test (`npx vitest run`) ครอบเฉพาะ logic ล้วน ๆ ที่ mock ทุกอย่างไว้ ขั้นตอนนี้เป็น**ที่เดียว**ที่ทดสอบเส้นทางจริงครบวง: session ใน browser + RLS/`is_team_member()` บน Supabase จริง + realtime (`postgres_changes` ของตาราง `orders`) + R2 CORS ตอนอัปโหลดรูป ถ้าข้ามไป จะไม่รู้ว่าพังจนลูกค้าเจอเอง

1. เปิดโดเมน Vercel → หน้า `/login` → ล็อกอินด้วย `kornkawat.k@gmail.com`
2. ครั้งแรกจะถูกบังคับ **ตั้ง 2FA** → สแกน QR ด้วยแอป authenticator → กรอกรหัส 6 หลัก
3. ไปหน้า **นำเข้าออเดอร์** → อัปโหลดไฟล์ CSV ตัวอย่างจากแม็คโคร → ตรวจการจับคู่คอลัมน์ → ดูตัวอย่าง → นำเข้า
4. เปิดหน้ารายละเอียดออเดอร์ → กด **คัดลอก** ลิงก์ลูกค้า → เปิดใน **หน้าต่างส่วนตัว (incognito)** → ต้องเห็นหน้า `/o/<token>` ของลูกค้า
5. ในหน้าลูกค้า (หลังออเดอร์ถึงสถานะ "ส่งขึ้นเรือแล้ว") กด **แจ้งปัญหา** → ส่งเคลมทดสอบ + แนบรูป → ต้องอัปโหลดรูปได้ (ถ้าไม่ได้ = R2 CORS ยังไม่ถูก)
6. กลับฝั่งทีม → หน้า **คิวเคลม** → ต้องเห็นเคลมทดสอบที่เพิ่งส่ง → เปิด → อนุมัติ/ปฏิเสธได้
7. ลบข้อมูลทดสอบออกก่อนใช้งานจริง (หรือปล่อยให้ cron ลบเองใน 30 วัน)

---

## ส่วน C — Backup / กู้คืน / จัดการทีม / แก้ปัญหา

### Backup รายสัปดาห์

- Supabase แพลนฟรี **ไม่มี backup อัตโนมัติ** — ต้องรันเอง
- ตั้ง env `SUPABASE_DB_URL` (จาก Supabase → **Project Settings → Database → Connection string → URI**; แนะนำ "Session pooler", ใส่ DB password แทน `[YOUR-PASSWORD]`)
- รัน `scripts/weekly-backup.sh` → ได้ไฟล์ `./backups/db-YYYYMMDD.dump`
  ```bash
  SUPABASE_DB_URL="postgresql://postgres.kprlqjxwolljkgqyzygf:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres" \
    ./scripts/weekly-backup.sh
  ```
- สคริปต์ลบ dump ที่เก่ากว่า 60 วันให้เอง — เก็บ dump ไว้อย่างน้อย 4 สัปดาห์
- **ตั้งเตือนใน LINE ทีมทุกวันจันทร์** ให้รันสคริปต์
- รูปบน R2 **ไม่รวม** ใน backup นี้ (เก็บแยก + ข้อมูลรูปถูกลบอัตโนมัติใน 30 วันอยู่แล้ว) — ถ้าต้องการสำเนารูป ใช้ `rclone sync` bucket `koh-payam-photos` แยกต่างหาก

### กู้คืน

```bash
createdb koh_payam_restore
pg_restore --no-owner --no-privileges -d koh_payam_restore db-YYYYMMDD.dump
```

กู้กลับขึ้น Supabase โดยตรง (ระวัง — ทับข้อมูลปัจจุบัน ทำเฉพาะตอนกู้ภัยจริง):
```bash
pg_restore --no-owner --no-privileges --clean --if-exists \
  -d "$SUPABASE_DB_URL" db-YYYYMMDD.dump
```

### เพิ่ม / ลบ / เปลี่ยนบทบาทสมาชิกทีม

บทบาทมี 3 แบบ (คอลัมน์ `role` ในตาราง `public.profiles`):

| role ในระบบ | เรียกในคู่มือ | เข้าถึงได้ |
|---|---|---|
| `packer` | คนแพ็ค | งานวันนี้, นำเข้าออเดอร์, หน้าแพ็ค, ใบเขียนหน้าลัง, หน้ารายละเอียดออเดอร์ |
| `pier` | คนที่ท่าเรือ | งานวันนี้, ตั้งค่าเรือวันนี้, หน้าท่าเรือ, หน้ารายละเอียดออเดอร์ |
| `manager` | หัวหน้า | ทุกหน้า + **คิวเคลม / อนุมัติเคลม** (เฉพาะ manager) |

> **ปิดการสมัครสมาชิกเอง (public signup) — ทำแล้ว:** ปิดผ่าน Management API ไปแล้ว (คนนอกกดสมัครเองไม่ได้) และ migration `0007` เพิ่มชั้นกันซ้ำระดับ DB (`profiles.is_active` + RLS ผ่าน `public.is_team_member()`)
> **วิธีตรวจ:** Supabase → **Authentication → Sign In / Providers → Email** → ช่อง **Allow new users to sign up** ต้องเป็น **OFF**

**เพิ่มสมาชิกใหม่:**
1. Supabase → **Authentication → Users → Add user → Create new user** → ใส่อีเมล + รหัสผ่านชั่วคราว → ติ๊ก **Auto Confirm User**
2. trigger `handle_new_user` สร้างแถว `profiles` ให้อัตโนมัติที่บทบาท `packer` และ **`is_active = false`** (ยังใช้งานไม่ได้จนกว่าหัวหน้าจะเปิดให้)
3. **หัวหน้า** รัน SQL ใน **SQL Editor** เพื่อกำหนดบทบาท **และเปิดใช้งาน** (ต้องมี `is_active = true` ไม่งั้น RLS บล็อกทุกอย่าง):
   ```sql
   update public.profiles
   set role = 'pier',        -- หรือ 'manager' / 'packer'
       is_active = true
   where id = (select id from auth.users where email = 'newmember@example.com');
   ```
4. สมาชิกล็อกอินครั้งแรก → ระบบบังคับตั้ง 2FA

**ลบ / ระงับสมาชิก (offboarding):**

> ⚠️ กด **Delete user** ตรง ๆ **ไม่ได้** — จะ error เพราะมีแถวประวัติอ้างถึง `profiles` ของคนนั้นอยู่ (`evidence_photos.taken_by`, `claims.resolved_by`, `backorders.fulfilled_by`, `audit_logs.user_id`) และคอลัมน์เหล่านั้นไม่ได้ตั้ง `on delete cascade`

- **Offboarding เฟส 1 (ใช้ตอนนี้):** Supabase → **Authentication → Users** → เลือกผู้ใช้ → **Ban user** (หรือรีเซ็ตรหัสผ่านเป็นค่าที่คนนั้นไม่รู้) แล้วรันใน **SQL Editor**:
  ```sql
  update public.profiles set is_active = false where id = '<uuid ของผู้ใช้>';
  ```
  แค่นี้คนนั้นจะล็อกอินไม่ได้ และต่อให้ล็อกอินได้ก็อ่าน/เขียนข้อมูลทีมไม่ได้ (RLS ผ่าน `public.is_team_member()` — migration `0007`)
- **ลบถาวรจริง ๆ (เฟส 2):** ต้องแก้ schema ให้คอลัมน์อ้างอิงเป็น `on delete set null` ก่อน ค่อยลบ auth user — เก็บไว้ทำตอนมีเวลา ไม่ใช่งานเร่งด่วน

**เปลี่ยนบทบาท:** รัน `update public.profiles set role = '...' where id = ...` แบบข้างบน (ผู้ใช้ต้อง refresh หน้า/ล็อกอินใหม่จึงจะเห็นเมนูใหม่)

> หมายเหตุความปลอดภัย: ผู้ใช้ **แก้บทบาทตัวเองไม่ได้** (migration `0004` ตัด self-update policy ทิ้ง) — ต้องแก้ผ่าน SQL Editor / service role เท่านั้น

### ตรวจสอบ cron jobs

ใน **SQL Editor**:

```sql
-- มี job อะไรบ้าง เปิดอยู่ไหม
select jobname, schedule, active from cron.job;
-- คาดหวัง: purge-old-orders (0 3 * * *) และ r2-cleanup (10 3 * * *) ทั้งคู่ active = true

-- ผลการรัน 10 ครั้งล่าสุด (ดู status = 'succeeded' / ข้อความ error)
select jobid, runid, status, return_message, start_time, end_time
from cron.job_run_details
order by start_time desc
limit 10;
```

ถ้า `r2-cleanup` fail: เช็กว่า secret ใน vault ยังอยู่ (`select name from vault.secrets;` ต้องมี `cleanup_secret`) และตรงกับ `CLEANUP_SECRET` ใน Edge Function secrets; ดู log ของ function ที่ Supabase → Edge Functions → `cleanup` → Logs

### ปัญหาที่พบบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| ลูกค้าอัปโหลดรูปเคลมไม่ขึ้น / ทีมถ่ายรูปที่ท่าเรือไม่ขึ้น | **CORS ของ R2 bucket ไม่มี origin ปัจจุบัน** → Cloudflare → R2 → `koh-payam-photos` → Settings → CORS Policy → เพิ่มโดเมนใน `AllowedOrigins` (ต้องมี `PUT` ใน `AllowedMethods`) |
| ลูกค้าเปิดลิงก์ไม่ได้ ("not found / expired") | ทีมกด "สร้างลิงก์ใหม่" ไปแล้ว (ลิงก์เก่าใช้ไม่ได้ทันที) หรือออเดอร์เกิน 30 วันถูกลบ หรือเลย 48 ชม. หลังส่งขึ้นเรือ (ลิงก์หมดอายุ) → ส่งลิงก์ล่าสุดจากหน้ารายละเอียดออเดอร์ |
| ปุ่มแจ้งเคลมของลูกค้าหาย | เกิน 48 ชม. หลังสถานะ "ส่งขึ้นเรือแล้ว" — ปิดรับเคลมตามกติกา (ตรวจสอบไม่ได้ = ต้องคุยนอกระบบ) |
| ล็อกอินติดหน้า 2FA เข้าไม่ได้ (ทำโทรศัพท์หาย/ลบแอป) | หัวหน้าเข้า Supabase → **Authentication → Users** → เลือกผู้ใช้ → แท็บ/ปุ่มลบ **MFA factor** → ให้ผู้ใช้ล็อกอินใหม่แล้วตั้ง 2FA ใหม่ |
| ลบเรือในหน้าตั้งค่าไม่ได้ ("ลบไม่ได้: มี N ออเดอร์ผูกกับเรือนี้แล้ว") | มีออเดอร์เลือกเรือนั้นไว้แล้ว — เปลี่ยนเรือของออเดอร์เหล่านั้นในหน้าท่าเรือก่อน ค่อยลบ |
| นำเข้าไฟล์แล้วคอลัมน์เพี้ยน | กดแก้ "จับคู่คอลัมน์" ใหม่ในหน้านำเข้า (ระบบจำค่าล่าสุดไว้ใน browser — key `makro_mapping` ใน localStorage; ล้างได้โดยล้าง site data) |
| นำเข้าแล้วขึ้นเตือน "มีออเดอร์ซ้ำ" | เลขออเดอร์นั้นเคยนำเข้าแล้ว — ระบบโชว์รายการที่จะถูกเขียนทับ กด "ทับของเดิม" เพื่อยืนยัน (ข้อมูลแพ็ค/เคลมของออเดอร์เดิมจะหาย) |
| ข้อมูลออเดอร์เก่าหายไปเอง | **ปกติ** — cron `purge-old-orders` รันทุกวัน 03:00 น. **ลบถาวร** ออเดอร์ + รายการ + รูป + เคลม + audit log ที่เกิน 30 วัน (ตามกติกาความปลอดภัย) กู้ได้จาก backup รายสัปดาห์เท่านั้น |
| รูปเก่ายังค้างบน R2 ทั้งที่ออเดอร์ถูกลบแล้ว | เช็ก cron `r2-cleanup` (03:10) ว่ารันผ่านไหม (ดูหัวข้อ "ตรวจสอบ cron jobs") — ไฟล์ที่ลบไม่สำเร็จจะยังอยู่ในตาราง `r2_delete_queue` |
