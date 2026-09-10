#!/usr/bin/env bash
#
# weekly-backup.sh — สำรองฐานข้อมูล Supabase ของแอปส่งสินค้าเกาะพยาม (รันมือ รายสัปดาห์)
#
# Supabase แพลนฟรี "ไม่มี" backup อัตโนมัติรายวัน — ต้องรันสคริปต์นี้เองอย่างน้อยสัปดาห์ละครั้ง
# (แนะนำตั้งเตือนใน LINE ทีมทุกวันจันทร์)
#
# วิธีใช้:
#   1) ติดตั้ง PostgreSQL client tools (pg_dump) ให้ตรงเวอร์ชันกับ DB (Postgres 17)
#   2) ตั้งค่า env SUPABASE_DB_URL = connection string แบบ URI ของ DB
#      เอาจาก: Supabase Dashboard → Project Settings → Database → Connection string → URI
#      (ใส่รหัส DB password แทน [YOUR-PASSWORD] ในสตริง; แนะนำใช้ตัวเชื่อมแบบ "Session pooler")
#   3) รัน:  SUPABASE_DB_URL="postgresql://..." ./scripts/weekly-backup.sh
#      หรือกำหนดโฟลเดอร์ปลายทางเอง:  ./scripts/weekly-backup.sh /path/to/backups
#
# ผลลัพธ์: ไฟล์ ./backups/db-YYYYMMDD.dump (รูปแบบ custom ของ pg_dump ใช้ pg_restore กู้คืน)
# ไฟล์ที่เก่ากว่า 60 วันจะถูกลบทิ้งอัตโนมัติ
#
# หมายเหตุ: รูปหลักฐานบน Cloudflare R2 "ไม่รวม" ใน backup นี้
#   - R2 เป็นที่เก็บแยก และรูปจะถูกลบอัตโนมัติเมื่อออเดอร์เกิน 30 วันอยู่แล้ว
#   - ถ้าต้องการสำเนารูป ให้ดึงจาก R2 ต่างหาก (เช่น `rclone sync` bucket koh-payam-photos)

set -euo pipefail

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "ผิดพลาด: ยังไม่ได้ตั้ง env SUPABASE_DB_URL" >&2
  echo "ตัวอย่าง: export SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres'" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "ผิดพลาด: ไม่พบคำสั่ง pg_dump — ติดตั้ง PostgreSQL client tools ก่อน" >&2
  exit 1
fi

STAMP="$(date +%Y%m%d)"
OUT_DIR="${1:-./backups}"
OUT_FILE="$OUT_DIR/db-$STAMP.dump"

mkdir -p "$OUT_DIR"

echo "กำลังสำรองฐานข้อมูล → $OUT_FILE"
pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --format=custom --file="$OUT_FILE"
echo "เขียน $OUT_FILE เรียบร้อย ($(du -h "$OUT_FILE" | cut -f1))"

echo "ลบไฟล์ backup ที่เก่ากว่า 60 วัน..."
find "$OUT_DIR" -name 'db-*.dump' -type f -mtime +60 -print -delete

echo "เสร็จ."
echo "หมายเหตุ: ไฟล์รูปบน Cloudflare R2 ไม่รวมใน backup นี้ (เก็บแยก + ลบอัตโนมัติที่ 30 วัน)"
