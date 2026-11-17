// ใบส่งของ (delivery note): what the customer gets in the box and in the order link -- like the store's
// receipt, each line carries the 13-digit barcode the customer checks the goods against (Myanmar
// customers check by barcode), then ordered / shipped / short. Thai or Myanmar headings; product
// names stay as Makro writes them. Barcodes come from item_barcodes (migration 0044).

export type NoteLang = 'th' | 'my'

export type NoteItem = {
  lineNo: number
  itemId: string | null
  productName: string
  /** every code from the file's Bar_Code cell; [] when unknown */
  barcodes: string[]
  ordered: number
  shipped: number
  isShort: boolean
}

export type DeliveryNote = {
  orderNo: string
  customerName: string
  memberCard: string | null
  invoiceNo: string | null
  shipDate: string
  island: string | null
  boatName: string | null
  boxes: { paper: number; foam: number; piece: number }
  /** when Makro's file last updated this PO (null before migration 0044) */
  syncedAt: string | null
  items: NoteItem[]
}

/**
 * The codes printed for a line, as the store receipt would: the maker's barcodes (13 or 14 digits, not
 * starting with 2 -- a 14-digit one is the case code, printed when a whole case is sold), all of them,
 * since the file doesn't say which is the piece and which the pack. Without one: Makro's own 13-digit
 * code (prefix 2, the 250... one first -- 21/28/29... carry a weight). Nothing -> [] (the 6-digit code shows).
 */
export function noteCodes(barcodes: string[]): string[] {
  const maker = barcodes.filter((c) => (c.length === 13 || c.length === 14) && !c.startsWith('2'))
  if (maker.length) return maker
  const own = barcodes.filter((c) => c.length === 13 && c.startsWith('2'))
  const best = own.find((c) => c.startsWith('250')) ?? own[0]
  return best ? [best] : []
}

const round2 = (n: number) => Math.round(n * 100) / 100
export const shortQty = (i: Pick<NoteItem, 'ordered' | 'shipped'>) => Math.max(0, round2(i.ordered - i.shipped))
/** "12", "0.45" -- weighed lines are short by fractions of a kilo */
export const qtyText = (n: number) => String(round2(n))

/** Makro has filled in what it shipped (before that every line reads 0 shipped) */
export const hasShipped = (n: Pick<DeliveryNote, 'items'>) => n.items.some((i) => i.shipped > 0)

/** Myanmar POs default to the Myanmar note; everything else to Thai */
export const defaultNoteLang = (island: string | null | undefined): NoteLang => (island === 'myanmar' ? 'my' : 'th')

type Label = { main: string; en: string }
type Labels = Record<
  | 'title'
  | 'customer'
  | 'member'
  | 'po'
  | 'invoice'
  | 'shipDate'
  | 'destination'
  | 'boat'
  | 'boxes'
  | 'no'
  | 'code'
  | 'item'
  | 'ordered'
  | 'shipped'
  | 'short'
  | 'totalLines'
  | 'shortLines'
  | 'asOf'
  | 'page'
  | 'checkHint',
  Label
>

// Each heading in the note's language with English under it (as Makro's receipts print Thai/English),
// so a wrong Myanmar word still reads. Myanmar wording to be checked by a Myanmar speaker before use.
export const NOTE_LABELS: Record<NoteLang, Labels> = {
  th: {
    title: { main: 'ใบส่งของ', en: 'DELIVERY NOTE' },
    customer: { main: 'ลูกค้า', en: 'Customer' },
    member: { main: 'เลขสมาชิก', en: 'Member no.' },
    po: { main: 'เลขที่ออเดอร์', en: 'Order no.' },
    invoice: { main: 'เลขใบกำกับ', en: 'Invoice no.' },
    shipDate: { main: 'วันที่ส่ง', en: 'Delivery date' },
    destination: { main: 'ปลายทาง', en: 'Destination' },
    boat: { main: 'เรือ', en: 'Boat' },
    boxes: { main: 'จำนวนลัง', en: 'Packages' },
    no: { main: 'ลำดับ', en: 'No.' },
    code: { main: 'บาร์โค้ด / รหัสสินค้า', en: 'Barcode / Article no.' },
    item: { main: 'รายการสินค้า', en: 'Description' },
    ordered: { main: 'สั่ง', en: 'Ordered' },
    shipped: { main: 'ส่ง', en: 'Delivered' },
    short: { main: 'ขาด', en: 'Short' },
    totalLines: { main: 'รวมรายการ', en: 'Lines' },
    shortLines: { main: 'ส่งไม่ครบ', en: 'Short lines' },
    asOf: { main: 'ข้อมูล ณ', en: 'Data as of' },
    page: { main: 'แผ่นที่', en: 'Page' },
    checkHint: {
      main: 'ตรวจสินค้ากับบาร์โค้ดบนสินค้า แถวสีส้มคือรายการที่ส่งไม่ครบ',
      en: 'Check each item against the barcode on its pack. Shaded lines were not delivered in full.',
    },
  },
  my: {
    title: { main: 'ပစ္စည်းပို့လွှာ', en: 'DELIVERY NOTE' },
    customer: { main: 'ဖောက်သည်', en: 'Customer' },
    member: { main: 'အသင်းဝင်နံပါတ်', en: 'Member no.' },
    po: { main: 'အော်ဒါနံပါတ်', en: 'Order no.' },
    invoice: { main: 'ငွေတောင်းခံလွှာနံပါတ်', en: 'Invoice no.' },
    shipDate: { main: 'ပို့သည့်ရက်', en: 'Delivery date' },
    destination: { main: 'ပို့ရမည့်နေရာ', en: 'Destination' },
    boat: { main: 'လှေ', en: 'Boat' },
    boxes: { main: 'ပုံးအရေအတွက်', en: 'Packages' },
    no: { main: 'စဉ်', en: 'No.' },
    code: { main: 'ဘားကုဒ် / ပစ္စည်းကုဒ်', en: 'Barcode / Article no.' },
    item: { main: 'ပစ္စည်းအမည်', en: 'Description' },
    ordered: { main: 'မှာယူ', en: 'Ordered' },
    shipped: { main: 'ပို့ပြီး', en: 'Delivered' },
    short: { main: 'လိုသည်', en: 'Short' },
    totalLines: { main: 'ပစ္စည်းစုစုပေါင်း', en: 'Lines' },
    shortLines: { main: 'မပြည့်စုံသော ပစ္စည်း', en: 'Short lines' },
    asOf: { main: 'အချက်အလက် အချိန်', en: 'Data as of' },
    page: { main: 'စာမျက်နှာ', en: 'Page' },
    checkHint: {
      main: 'ပစ္စည်းပေါ်ရှိ ဘားကုဒ်နှင့် တိုက်စစ်ပါ။ လိမ္မော်ရောင်တန်းများသည် အပြည့်မပို့ရသေးသော ပစ္စည်းများ ဖြစ်သည်။',
      en: 'Check each item against the barcode on its pack. Shaded lines were not delivered in full.',
    },
  },
}

/** Destination names on the note */
export const DESTINATION: Record<NoteLang, Record<string, string>> = {
  th: { payam: 'เกาะพยาม', chang: 'เกาะช้าง', myanmar: 'ฝั่งเมียนมา' },
  // island names stay in Latin script (as on the boats and maps); only Myanmar itself is translated
  my: { payam: 'Koh Phayam', chang: 'Koh Chang', myanmar: 'မြန်မာ (Myanmar)' },
}

/** "17/11/2026" for the note (same in both languages: digits read the same everywhere) */
export const noteDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

/** "17/11/2026 09:25" in Thai time */
export const noteDateTime = (iso: string) => {
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return iso
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(t)
  const g = (k: string) => p.find((x) => x.type === k)?.value ?? ''
  return `${g('day')}/${g('month')}/${g('year')} ${g('hour')}:${g('minute')}`
}
