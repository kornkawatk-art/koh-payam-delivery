import { groupByPhone, entryHasUnpacked, entryOrders } from './groupOrders'

const o = (id: string, no: string, name: string, phone: string | null, status = 'imported') => ({
  id,
  makro_order_no: no,
  customer_name_en: name,
  customer_phone: phone,
  status,
})

test('orders sharing a non-blank phone collapse into one group, sorted by order number', () => {
  const r = groupByPhone([
    o('1', 'PO-3', 'A', '081'),
    o('2', 'PO-1', 'B', '082'),
    o('3', 'PO-2', 'A', '081'),
  ])
  expect(r).toHaveLength(2)
  expect(r[0]).toMatchObject({ kind: 'group', phone: '081', name: 'A' })
  expect(entryOrders(r[0]).map((x) => x.makro_order_no)).toEqual(['PO-2', 'PO-3'])
  expect(r[1]).toMatchObject({ kind: 'single' })
})

test('the group sits where its first PO appeared', () => {
  const r = groupByPhone([o('1', 'PO-1', 'B', '082'), o('2', 'PO-2', 'A', '081'), o('3', 'PO-3', 'A', '081')])
  expect(r.map((e) => e.kind)).toEqual(['single', 'group'])
})

test('blank, null and whitespace phones never group, even with the same name', () => {
  const r = groupByPhone([o('1', 'PO-1', 'A', null), o('2', 'PO-2', 'A', ''), o('3', 'PO-3', 'A', '  ')])
  expect(r.every((e) => e.kind === 'single')).toBe(true)
})

test('phone is trimmed before matching', () => {
  const r = groupByPhone([o('1', 'PO-1', 'A', '081 '), o('2', 'PO-2', 'A', ' 081')])
  expect(r).toHaveLength(1)
  expect(r[0].kind).toBe('group')
})

test('a group counts as unpacked while any PO is still imported', () => {
  const [g] = groupByPhone([o('1', 'PO-1', 'A', '081', 'packed'), o('2', 'PO-2', 'A', '081', 'imported')])
  expect(entryHasUnpacked(g)).toBe(true)
  const [h] = groupByPhone([o('1', 'PO-1', 'A', '081', 'packed'), o('2', 'PO-2', 'A', '081', 'shipped')])
  expect(entryHasUnpacked(h)).toBe(false)
})
