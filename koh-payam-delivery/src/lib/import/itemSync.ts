import type { ParsedItem } from './buildImport'

/** An order_items row as it exists before a re-import, plus whether a claim points at it. */
export type ExistingItem = {
  id: string
  makro_item_id: string | null
  product_name: string
  line_no: number | null
  packed: boolean
  claimed: boolean
}

export type ItemRow = ReturnType<typeof itemRow>

/** The order_items columns a Makro file line maps to. */
export function itemRow(orderId: string, it: ParsedItem, packed: boolean) {
  return {
    order_id: orderId,
    product_name: it.productName,
    qty_ordered: it.orderedQty,
    qty_shipped: it.shippedQty,
    shortage_qty: it.shortageQty,
    status: (it.isShort ? 'short' : 'ok') as 'short' | 'ok',
    makro_item_id: it.itemId,
    item_remark: it.itemRemark,
    line_no: it.lineNo,
    is_fresh: it.isFresh,
    dept: it.dept || null,
    packed,
  }
}

export type ItemSyncPlan = {
  update: (ItemRow & { id: string })[]
  insert: ItemRow[]
  remove: string[]
  keep: string[]
}

// Makro item code, else the product name (a real data gap: some lines have no code).
const keyOfNew = (it: ParsedItem) => (it.itemId ? it.itemId : `name:${it.productName}`)
const keyOfOld = (r: ExistingItem) => (r.makro_item_id ? r.makro_item_id : `name:${r.product_name}`)

function groupBy<T>(xs: T[], key: (x: T) => string) {
  const m = new Map<string, T[]>()
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x])
  return m
}

/**
 * How a re-import brings an existing order's lines in line with the file,
 * IN PLACE: matched lines keep their row id (so claim_items, which reference
 * order_items with ON DELETE SET NULL, stay attached), lines new in the file
 * are inserted, and lines gone from the file are removed -- unless a claim
 * points at them, in which case they are kept.
 *
 * Matching: same item code (or product name when there is none); repeats of
 * one code pair up in line order. A line's "packed" tick carries over only
 * when its key is unambiguous (appears once on both sides) -- otherwise it
 * resets to unpacked, so a tick can never land on a line nobody re-verified.
 */
export function planItemSync(
  orderId: string,
  existing: ExistingItem[],
  incoming: ParsedItem[],
): ItemSyncPlan {
  const oldByKey = groupBy(
    [...existing].sort((a, b) => (a.line_no ?? Infinity) - (b.line_no ?? Infinity)),
    keyOfOld,
  )
  const newByKey = groupBy(incoming, keyOfNew)
  const plan: ItemSyncPlan = { update: [], insert: [], remove: [], keep: [] }

  for (const [key, news] of newByKey) {
    const olds = oldByKey.get(key) ?? []
    const unambiguous = olds.length === 1 && news.length === 1
    news.forEach((it, i) => {
      const match = olds[i]
      if (match) plan.update.push({ id: match.id, ...itemRow(orderId, it, unambiguous && match.packed) })
      else plan.insert.push(itemRow(orderId, it, false))
    })
  }
  for (const [key, olds] of oldByKey) {
    const matched = newByKey.get(key)?.length ?? 0
    for (const r of olds.slice(matched)) (r.claimed ? plan.keep : plan.remove).push(r.id)
  }
  return plan
}
