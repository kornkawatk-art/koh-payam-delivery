import { dedupOrdersByPhone } from './dedup'

test('keeps only the first order per phone group, preserving input order', () => {
  const orders = [
    { id: 'o1', customer_phone: '0810000001' },
    { id: 'o2', customer_phone: '0810000002' },
    { id: 'o3', customer_phone: '0810000001' }, // same customer, second PO same day
  ]
  expect(dedupOrdersByPhone(orders)).toEqual([
    { id: 'o1', customer_phone: '0810000001' },
    { id: 'o2', customer_phone: '0810000002' },
  ])
})

test('drops orders with no phone on file — they can never match a line_contacts row', () => {
  const orders = [
    { id: 'o1', customer_phone: null },
    { id: 'o2', customer_phone: '0810000002' },
  ]
  expect(dedupOrdersByPhone(orders)).toEqual([{ id: 'o2', customer_phone: '0810000002' }])
})

test('empty input returns empty output', () => {
  expect(dedupOrdersByPhone([])).toEqual([])
})

test('no duplicate phones — every order passes through unchanged', () => {
  const orders = [
    { id: 'o1', customer_phone: '0810000001' },
    { id: 'o2', customer_phone: '0810000002' },
    { id: 'o3', customer_phone: '0810000003' },
  ]
  expect(dedupOrdersByPhone(orders)).toEqual(orders)
})
