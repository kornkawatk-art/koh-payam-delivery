import * as XLSX from 'xlsx'

export type RawRow = Record<string, string>

export async function parseMakroFile(input: File | ArrayBuffer): Promise<RawRow[]> {
  const buf = input instanceof File ? await input.arrayBuffer() : input
  const wb = XLSX.read(buf, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
  return json.map((r) => {
    const out: RawRow = {}
    for (const [k, v] of Object.entries(r)) out[String(k).trim()] = String(v ?? '').trim()
    return out
  })
}

/**
 * แยกแยะว่าไฟล์ที่อัปโหลดเป็น "รายการสินค้า" (OrderDetailExport) หรือ
 * "ที่อยู่/ระดับออเดอร์" (OrderExport) จาก header ของไฟล์
 * - detail: มี `Item Id` และ `Product Name`
 * - order:  มี `Sub District` และ `Shipping Address`
 */
export function detectFileKind(headers: string[]): 'detail' | 'order' | 'unknown' {
  const set = new Set(headers.map((h) => String(h).trim()))
  if (set.has('Item Id') && set.has('Product Name')) return 'detail'
  if (set.has('Sub District') && set.has('Shipping Address')) return 'order'
  return 'unknown'
}
