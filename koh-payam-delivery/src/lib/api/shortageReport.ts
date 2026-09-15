import { supabase } from '../supabase'

export type ShortageDetailRow = {
  orderId: string
  makroOrderNo: string
  customerNameEn: string
  shipDate: string
  qty: number
}

export type ShortageProductRow = {
  productName: string
  totalQty: number
  orderCount: number
  details: ShortageDetailRow[]
}

type RawShortageRow = {
  product_name: string
  qty_ordered: number
  qty_shipped: number
  shortage_qty: number | null
  order_id: string
  orders: { makro_order_no: string; customer_name_en: string; ship_date: string } | null
}

type ProductAcc = {
  totalQty: number
  // Keyed by order_id -- a product could in principle appear twice on the
  // same order's order_items (rare, but possible), so contributions from the
  // same order for the same product are combined into one detail row rather
  // than duplicated.
  detailsByOrder: Map<string, ShortageDetailRow>
}

// Ranks products by total quantity short over a manager-chosen date range.
// Scoped only to Makro-side under-shipment (order_items.status = 'short') --
// never customer-claimed shortages, which are a different concept already
// covered by the claims queue.
//
// Date filtering happens server-side via PostgREST's dot-notation filter on
// the embedded `orders` resource (`orders.ship_date`). By default, a filter
// on an embedded resource's column only prunes which *nested* rows show up
// inside that embed -- it does not exclude the parent row when the embed
// fails to match, unless the join is hinted as an inner join. Without
// `orders!inner(...)`, an order_items row whose order falls outside the
// requested range would still come back (just with a filtered/empty embed),
// silently fetching unbounded history every time. `orders!inner(...)` makes
// PostgREST apply the date filter to row *inclusion* itself, so a narrow
// manager-chosen range never pulls in the whole table.
export async function getShortageReport(
  fromDate: string,
  toDate: string,
): Promise<ShortageProductRow[]> {
  const { data, error } = await supabase
    .from('order_items')
    .select(
      'product_name, qty_ordered, qty_shipped, shortage_qty, order_id, orders!inner(makro_order_no, customer_name_en, ship_date)',
    )
    .eq('status', 'short')
    .gte('orders.ship_date', fromDate)
    .lte('orders.ship_date', toDate)
  if (error) throw new Error('โหลดรายงานของขาดไม่สำเร็จ: ' + error.message)
  const rows = (data ?? []) as unknown as RawShortageRow[]

  const byProduct = new Map<string, ProductAcc>()

  for (const r of rows) {
    if (!r.orders) continue // defensive only -- the inner join guarantees this in practice
    // Mirrors syncShortageBackorders's exact fallback (src/lib/api/backorders.ts):
    // real shortage_qty when positive, else ordered - shipped clamped at 0.
    const shortage = Number(r.shortage_qty) || 0
    const qty = shortage > 0 ? shortage : Math.max(0, Number(r.qty_ordered) - Number(r.qty_shipped))

    let acc = byProduct.get(r.product_name)
    if (!acc) {
      acc = { totalQty: 0, detailsByOrder: new Map() }
      byProduct.set(r.product_name, acc)
    }
    acc.totalQty += qty

    const existing = acc.detailsByOrder.get(r.order_id)
    if (existing) {
      existing.qty += qty
    } else {
      acc.detailsByOrder.set(r.order_id, {
        orderId: r.order_id,
        makroOrderNo: r.orders.makro_order_no,
        customerNameEn: r.orders.customer_name_en,
        shipDate: r.orders.ship_date,
        qty,
      })
    }
  }

  return Array.from(byProduct.entries())
    .map(([productName, acc]) => ({
      productName,
      totalQty: acc.totalQty,
      orderCount: acc.detailsByOrder.size,
      details: Array.from(acc.detailsByOrder.values()).sort((a, b) =>
        a.shipDate.localeCompare(b.shipDate),
      ),
    }))
    .sort((a, b) => b.totalQty - a.totalQty)
}
