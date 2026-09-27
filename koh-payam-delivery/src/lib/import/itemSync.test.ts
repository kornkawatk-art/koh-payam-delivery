import { planItemSync, type ExistingItem } from './itemSync'
import type { ParsedItem } from './buildImport'

const item = (p: Partial<ParsedItem> & { itemId: string; productName?: string }): ParsedItem => ({
  productName: p.productName ?? `name-${p.itemId}`,
  orderedQty: 2,
  shippedQty: 2,
  shortageQty: 0,
  itemRemark: '',
  lineNo: 1,
  isShort: false,
  isFresh: false,
  dept: '7',
  ...p,
})

const old = (p: Partial<ExistingItem> & { id: string; makro_item_id: string | null }): ExistingItem => ({
  product_name: `name-${p.makro_item_id}`,
  line_no: 1,
  packed: false,
  claimed: false,
  ...p,
})

test('a matched line is UPDATED in place (same row id), refreshed from the file, keeping its packed tick', () => {
  const plan = planItemSync(
    'o1',
    [old({ id: 'r1', makro_item_id: 'A', packed: true, line_no: 1 })],
    [item({ itemId: 'A', productName: 'renamed', shippedQty: 1, shortageQty: 1, isShort: true, dept: '1', lineNo: 3 })],
  )
  expect(plan.insert).toEqual([])
  expect(plan.remove).toEqual([])
  expect(plan.update).toHaveLength(1)
  expect(plan.update[0]).toMatchObject({
    id: 'r1',
    order_id: 'o1',
    product_name: 'renamed',
    qty_shipped: 1,
    shortage_qty: 1,
    status: 'short',
    dept: '1',
    line_no: 3,
    packed: true,
  })
})

test('a new line in the file is INSERTED unpacked; a line gone from the file is REMOVED', () => {
  const plan = planItemSync(
    'o1',
    [old({ id: 'r-gone', makro_item_id: 'GONE', packed: true })],
    [item({ itemId: 'NEW' })],
  )
  expect(plan.update).toEqual([])
  expect(plan.insert).toHaveLength(1)
  expect(plan.insert[0]).toMatchObject({ order_id: 'o1', makro_item_id: 'NEW', packed: false })
  expect(plan.insert[0]).not.toHaveProperty('id')
  expect(plan.remove).toEqual(['r-gone'])
  expect(plan.keep).toEqual([])
})

// The point of syncing in place: claim_items.order_item_id is ON DELETE SET
// NULL, so deleting a claimed line would silently detach the customer's claim
// from the product.
test('a line gone from the file but referenced by a claim is KEPT, not removed', () => {
  const plan = planItemSync('o1', [old({ id: 'r-claimed', makro_item_id: 'X', claimed: true })], [])
  expect(plan.remove).toEqual([])
  expect(plan.keep).toEqual(['r-claimed'])
})

test('lines without an item code match by product name', () => {
  const plan = planItemSync(
    'o1',
    [old({ id: 'r1', makro_item_id: null, product_name: 'loose pork', packed: true })],
    [item({ itemId: '', productName: 'loose pork' })],
  )
  expect(plan.update.map((u) => u.id)).toEqual(['r1'])
  expect(plan.update[0].packed).toBe(true)
})

test('repeated item codes pair up in line order; extra lines on either side insert/remove', () => {
  const plan = planItemSync(
    'o1',
    [
      old({ id: 'r2', makro_item_id: 'A', line_no: 5 }),
      old({ id: 'r1', makro_item_id: 'A', line_no: 2 }),
      old({ id: 'r3', makro_item_id: 'A', line_no: 9 }),
    ],
    [item({ itemId: 'A', lineNo: 1, orderedQty: 10 }), item({ itemId: 'A', lineNo: 4, orderedQty: 20 })],
  )
  expect(plan.update.map((u) => [u.id, u.qty_ordered])).toEqual([
    ['r1', 10],
    ['r2', 20],
  ])
  expect(plan.remove).toEqual(['r3'])
})

// Same safety rule the old delete+reinsert sync had: when a key is ambiguous,
// a tick could land on a line nobody re-verified -- reset to unpacked instead.
test('a packed tick is NOT carried when the item code repeats (ambiguous match resets to unpacked)', () => {
  const plan = planItemSync(
    'o1',
    [old({ id: 'r1', makro_item_id: 'A', packed: true, line_no: 1 }), old({ id: 'r2', makro_item_id: 'A', packed: true, line_no: 2 })],
    [item({ itemId: 'A', lineNo: 1 }), item({ itemId: 'A', lineNo: 2 })],
  )
  expect(plan.update.map((u) => u.packed)).toEqual([false, false])
})

test('an empty dept from the file is stored as null', () => {
  const plan = planItemSync('o1', [], [item({ itemId: 'A', dept: '' })])
  expect(plan.insert[0].dept).toBeNull()
})
