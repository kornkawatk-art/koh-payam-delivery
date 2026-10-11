import { customerKey } from '../../supabase/functions/_shared/customerKey'
import { ISLAND_LIST } from './islands'
import { makroVoid } from './makroStatus'

// "พิมพ์สติ๊กเกอร์ทั้งหมด": which customers of a day need box stickers.
// One job per customer (phone + shop name), numbered 1..N across all their POs.

export type StickerOrder = {
  id: string
  makro_order_no: string
  customer_name_en: string
  customer_phone: string | null
  island?: string | null
  status: string
  makro_order_status?: string | null
  paper_box_count: number
  foam_box_count: number
  piece_count: number
  // the box counts this order's stickers were last printed with ("p,f,n")
  stickers_printed?: string | null
}

export type StickerJob = {
  key: string
  name: string
  phone: string | null
  island: string | null
  counts: { paper: number; foam: number; piece: number }
  orders: StickerOrder[]
  // already printed with the counts the orders have now
  printed: boolean
}

/** What gets remembered when an order's stickers print. */
export const printedSnapshot = (o: {
  paper_box_count: number
  foam_box_count: number
  piece_count: number
}) => `${o.paper_box_count || 0},${o.foam_box_count || 0},${o.piece_count || 0}`

// Boxes are packed and still on this side of the water.
const PRINTABLE = ['packed', 'at_pier']

const islandRank = (i: string | null) => {
  const n = ISLAND_LIST.indexOf(i as (typeof ISLAND_LIST)[number])
  return n === -1 ? ISLAND_LIST.length : n
}

export function buildStickerJobs(orders: StickerOrder[]): StickerJob[] {
  const byKey = new Map<string, StickerJob>()
  for (const o of orders) {
    if (!PRINTABLE.includes(o.status) || makroVoid(o.makro_order_status)) continue
    const key = customerKey(o)
    const job =
      byKey.get(key) ??
      ({
        key,
        name: o.customer_name_en,
        phone: o.customer_phone,
        island: o.island ?? null,
        counts: { paper: 0, foam: 0, piece: 0 },
        orders: [],
        printed: true,
      } as StickerJob)
    job.counts.paper += o.paper_box_count || 0
    job.counts.foam += o.foam_box_count || 0
    job.counts.piece += o.piece_count || 0
    job.orders.push(o)
    if (o.stickers_printed !== printedSnapshot(o)) job.printed = false
    byKey.set(key, job)
  }
  return [...byKey.values()]
    .filter((j) => j.counts.paper + j.counts.foam + j.counts.piece > 0)
    .sort((a, b) => islandRank(a.island) - islandRank(b.island) || a.name.localeCompare(b.name))
}
