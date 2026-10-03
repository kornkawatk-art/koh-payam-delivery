import { supabase } from '../supabase'
import {
  DEPT_GROUP_ORDER,
  deptGroupLabel,
  deptGroupOf,
  type DeptGroupCode,
} from '../departments'

export type ShortageDetailRow = {
  orderId: string
  makroOrderNo: string
  customerNameEn: string
  island?: string | null
  shipDate: string
  qty: number
}

export type ShortageProductRow = {
  // Stable identity: the Makro item code, or the product name for a line
  // that has no code (older/odd rows). Two sizes of "the same" product carry
  // different codes, so they stay separate rows.
  key: string
  itemId: string
  productName: string
  dept: DeptGroupCode
  totalQty: number
  // How many distinct orders were short of this item in the range -- "ขาด N
  // ครั้ง", the report's ranking metric (how often customers missed out).
  orderCount: number
  details: ShortageDetailRow[]
}

export type ShortageDeptGroup = {
  code: DeptGroupCode
  label: string
  products: ShortageProductRow[]
  // Sum of the products' orderCount: short occurrences in this department.
  occurrenceCount: number
}

export type ShortageReport = {
  groups: ShortageDeptGroup[]
  productCount: number
  occurrenceCount: number
  affectedOrderCount: number
}

type RawShortageRow = {
  product_name: string
  makro_item_id: string | null
  dept: string | null
  qty_ordered: number
  qty_shipped: number
  shortage_qty: number | null
  order_id: string
  orders: {
    makro_order_no: string
    customer_name_en: string
    ship_date: string
    island?: string | null
  } | null
}

type ProductAcc = {
  itemId: string
  productName: string
  dept: DeptGroupCode
  totalQty: number
  // Keyed by order_id -- the same item can in principle appear twice on one
  // order, so those combine into one detail row rather than duplicating.
  detailsByOrder: Map<string, ShortageDetailRow>
}

// Weighed items short by fractional kilos; keep sums tidy at 2 decimals.
const round2 = (n: number) => Math.round(n * 100) / 100

// Makro-side under-shipment only (order_items.status = 'short', which
// already excludes weighed items short by under 10% -- see buildImport.ts),
// never customer-claimed shortages (those live in the claims queue).
//
// `orders!inner(...)` makes PostgREST apply the ship_date range to row
// *inclusion*: without the inner hint, a filter on an embedded resource only
// prunes the embed and every out-of-range order_items row would still come
// back, silently fetching unbounded history.
export async function getShortageReport(
  fromDate: string,
  toDate: string,
): Promise<ShortageReport> {
  const { data, error } = await supabase
    .from('order_items')
    .select(
      'product_name, makro_item_id, dept, qty_ordered, qty_shipped, shortage_qty, order_id, orders!inner(makro_order_no, customer_name_en, ship_date, island)',
    )
    .eq('status', 'short')
    .gte('orders.ship_date', fromDate)
    .lte('orders.ship_date', toDate)
  if (error) throw new Error('โหลดรายงานของขาดไม่สำเร็จ: ' + error.message)
  const rows = (data ?? []) as unknown as RawShortageRow[]

  const byProduct = new Map<string, ProductAcc>()
  const affectedOrders = new Set<string>()

  for (const r of rows) {
    if (!r.orders) continue // defensive only -- the inner join guarantees this in practice
    // Mirrors syncShortageBackorders's fallback (src/lib/api/backorders.ts):
    // real shortage_qty when positive, else ordered - shipped clamped at 0.
    const shortage = Number(r.shortage_qty) || 0
    const qty = shortage > 0 ? shortage : Math.max(0, Number(r.qty_ordered) - Number(r.qty_shipped))

    const itemId = (r.makro_item_id ?? '').trim()
    const key = itemId || `name:${r.product_name}`
    const dept = deptGroupOf(r.dept)
    let acc = byProduct.get(key)
    if (!acc) {
      acc = { itemId, productName: r.product_name, dept, totalQty: 0, detailsByOrder: new Map() }
      byProduct.set(key, acc)
    } else if (acc.dept === 'UNKNOWN' && dept !== 'UNKNOWN') {
      // An older line (imported before Dept was captured) seen first must not
      // pin the item to "unknown" once a newer line knows its department.
      acc.dept = dept
    }
    acc.totalQty += qty
    affectedOrders.add(r.order_id)

    const existing = acc.detailsByOrder.get(r.order_id)
    if (existing) {
      existing.qty = round2(existing.qty + qty)
    } else {
      acc.detailsByOrder.set(r.order_id, {
        orderId: r.order_id,
        makroOrderNo: r.orders.makro_order_no,
        customerNameEn: r.orders.customer_name_en,
        island: r.orders.island ?? null,
        shipDate: r.orders.ship_date,
        qty: round2(qty),
      })
    }
  }

  const products: ShortageProductRow[] = Array.from(byProduct.entries()).map(([key, acc]) => ({
    key,
    itemId: acc.itemId,
    productName: acc.productName,
    dept: acc.dept,
    totalQty: round2(acc.totalQty),
    orderCount: acc.detailsByOrder.size,
    details: Array.from(acc.detailsByOrder.values()).sort((a, b) =>
      a.shipDate.localeCompare(b.shipDate),
    ),
  }))

  const groups: ShortageDeptGroup[] = DEPT_GROUP_ORDER.map((code) => {
    const ps = products
      .filter((p) => p.dept === code)
      .sort(
        (a, b) =>
          b.orderCount - a.orderCount ||
          b.totalQty - a.totalQty ||
          a.productName.localeCompare(b.productName),
      )
    return {
      code,
      label: deptGroupLabel(code),
      products: ps,
      occurrenceCount: ps.reduce((n, p) => n + p.orderCount, 0),
    }
  }).filter((g) => g.products.length > 0)

  return {
    groups,
    productCount: products.length,
    occurrenceCount: products.reduce((n, p) => n + p.orderCount, 0),
    affectedOrderCount: affectedOrders.size,
  }
}
