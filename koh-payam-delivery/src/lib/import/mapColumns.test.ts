import { applyMapping, validateMapping, DEFAULT_MAPPING } from './mapColumns'

const rows = [
  { 'Order No': 'PO-1', Customer: 'A RESORT', Product: 'rice', Qty: '2', 'Unit Price': '100' },
  { 'Order No': 'PO-1', Customer: 'A RESORT', Product: 'oil', Qty: '3', 'Unit Price': '50.5' },
  { 'Order No': 'PO-2', Customer: 'B CAFE', Product: 'milk', Qty: '1', 'Unit Price': '20' },
]

test('validateMapping flags missing header', () => {
  const problems = validateMapping(['Order No', 'Customer'], DEFAULT_MAPPING)
  expect(problems.length).toBeGreaterThan(0)
})

test('applyMapping groups by order and sums totals', () => {
  const orders = applyMapping(rows, DEFAULT_MAPPING)
  expect(orders).toHaveLength(2)
  const po1 = orders.find((o) => o.makroOrderNo === 'PO-1')!
  expect(po1.items).toHaveLength(2)
  expect(po1.totalValue).toBe(351.5) // 2*100 + 3*50.5
  expect(po1.customerNameEn).toBe('A RESORT')
})

test('applyMapping rejects rows with non-numeric qty', () => {
  const bad = [{ 'Order No': 'PO-3', Customer: 'C', Product: 'x', Qty: 'abc', 'Unit Price': '1' }]
  expect(() => applyMapping(bad, DEFAULT_MAPPING)).toThrow(/PO-3/)
})

test('applyMapping skips rows whose orderNo cell is blank', () => {
  const withBlank = [
    { 'Order No': '   ', Customer: 'X', Product: 'p', Qty: '1', 'Unit Price': '1' },
    { 'Order No': 'PO-9', Customer: 'Y', Product: 'q', Qty: '2', 'Unit Price': '3' },
  ]
  const orders = applyMapping(withBlank, DEFAULT_MAPPING)
  expect(orders).toHaveLength(1)
  expect(orders[0].makroOrderNo).toBe('PO-9')
})

test('applyMapping parses comma-separated numeric values', () => {
  const grouped = [
    { 'Order No': 'PO-10', Customer: 'Z', Product: 'bulk', Qty: '1,000', 'Unit Price': '2,500' },
  ]
  const orders = applyMapping(grouped, DEFAULT_MAPPING)
  expect(orders[0].totalValue).toBe(2_500_000)
})
