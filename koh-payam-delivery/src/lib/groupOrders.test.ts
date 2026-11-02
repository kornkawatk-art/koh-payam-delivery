import { groupByPhone, entryHasUnpacked, entryOrders, mergeCandidates, pickPrimary, normCustomerName } from './groupOrders'

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

const cand = (id: string, extra: object = {}) => ({ id, ...extra })

test('pickPrimary falls back to the first PO when none carries recorded state', () => {
  expect(pickPrimary([cand('a'), cand('b')])?.id).toBe('a')
  expect(pickPrimary([])).toBeNull()
})

test('pickPrimary prefers the PO the others point at over a lower-numbered newcomer', () => {
  const r = pickPrimary([cand('new'), cand('old'), cand('linked', { packed_with_order_id: 'old' })])
  expect(r?.id).toBe('old')
})

test('pickPrimary prefers a PO that already has counts, then one with pack photos', () => {
  expect(pickPrimary([cand('a'), cand('b', { piece_count: 2 })])?.id).toBe('b')
  expect(
    pickPrimary([cand('a'), cand('b', { evidence_photos: [{ stage: 'handoff' }, { stage: 'pack' }] })])?.id,
  ).toBe('b')
})

test('pickPrimary ignores handoff-only photos and zero counts', () => {
  const r = pickPrimary([
    cand('a', { evidence_photos: [{ stage: 'handoff' }], paper_box_count: 0 }),
    cand('b'),
  ])
  expect(r?.id).toBe('a') // nothing owns state -> plain first
})

test('one owner (same phone) with several shops: each shop name is its own customer', () => {
  const entries = groupByPhone([
    o('1', 'PO-1', 'เต้ย Ziggy', '0811111111'),
    o('2', 'PO-2', 'แคท Gympansea', '0811111111'),
    o('3', 'PO-3', 'เต้ย Ziggy', '0811111111'),
  ])
  expect(entries).toHaveLength(2)
  const ziggy = entries.find((e) => e.kind === 'group')!
  expect(ziggy.kind === 'group' && ziggy.orders.map((x) => x.id)).toEqual(['1', '3'])
  expect(entries.find((e) => e.kind === 'single')).toMatchObject({ order: { id: '2' } })
})

test('Makro spacing/case differences in a name do not split one shop', () => {
  expect(normCustomerName('  สุวิทย์   เพชร์รัตน์ ')).toBe('สุวิทย์ เพชร์รัตน์')
  expect(normCustomerName('blue  view')).toBe('BLUE VIEW')
  const entries = groupByPhone([
    o('1', 'PO-1', 'สุวิทย์ เพชร์รัตน์', '0822222222'),
    o('2', 'PO-2', 'สุวิทย์  เพชร์รัตน์', '0822222222'),
  ])
  expect(entries).toHaveLength(1)
  expect(entries[0].kind).toBe('group')
})

test('a phone merged for the day packs as one group across its names, listed by name', () => {
  const day = [o('1', 'PO-1', 'SHOP A', '081'), o('2', 'PO-2', 'shop  b', '081'), o('3', 'PO-3', 'SHOP A', '081'), o('4', 'PO-4', 'C', '082')]
  const r = groupByPhone(day, new Set(['081']))
  expect(r).toHaveLength(2)
  expect(r[0]).toMatchObject({ kind: 'group', phone: '081', name: 'SHOP A + shop  b', merged: true })
  expect(entryOrders(r[0]).map((x) => x.makro_order_no)).toEqual(['PO-1', 'PO-2', 'PO-3'])
  // without the merge each shop stays its own customer
  expect(groupByPhone(day).filter((e) => e.kind === 'group')).toEqual([expect.objectContaining({ name: 'SHOP A', merged: false })])
})

test('a merged phone with a single PO stays a single entry', () => {
  expect(groupByPhone([o('1', 'PO-1', 'A', '081')], new Set(['081']))[0].kind).toBe('single')
})

test('mergeCandidates: phones with 2+ different shop names that day, not merged yet', () => {
  const day = [o('1', 'PO-1', 'SHOP A', '081'), o('2', 'PO-2', 'SHOP B', '081'), o('3', 'PO-3', 'X', '082'), o('4', 'PO-4', 'x ', '082'),
    o('5', 'PO-5', 'P', '083'), o('6', 'PO-6', 'Q', '083'), o('7', 'PO-7', 'M', null), o('8', 'PO-8', 'N', null)]
  expect(mergeCandidates(day, new Set(['083']))).toEqual([{ phone: '081', names: ['SHOP A', 'SHOP B'] }])
})
