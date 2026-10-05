import { unreachedCustomers } from './unreached'

const o = (id: string, name: string, phone: string | null, extra = {}) => ({
  id,
  makro_order_no: 'PO-' + id,
  customer_name_en: name,
  customer_phone: phone,
  ...extra,
})

test('lists customers not registered, with no phone, or whose push failed -- one entry per customer', () => {
  const r = unreachedCustomers(
    [
      o('1', 'REGISTERED', '081-111-1111'),
      o('2', 'NOT REG', '0822222222'),
      o('3', 'NOT REG', '082-222-2222'), // same customer, second PO
      o('4', 'NO PHONE', null),
      o('5', 'BLOCKED', '0833333333'),
    ],
    new Set(['0811111111', '0833333333']),
    new Set(['0833333333']),
  )
  expect(r).toEqual([
    { customerName: 'BLOCKED', phone: '0833333333', reason: 'push_failed', orders: [{ id: '5', makroOrderNo: 'PO-5' }] },
    { customerName: 'NO PHONE', phone: null, reason: 'no_phone', orders: [{ id: '4', makroOrderNo: 'PO-4' }] },
    {
      customerName: 'NOT REG',
      phone: '0822222222',
      reason: 'not_registered',
      orders: [
        { id: '2', makroOrderNo: 'PO-2' },
        { id: '3', makroOrderNo: 'PO-3' },
      ],
    },
  ])
})

test('store pickups never need a delivery link, so they are not listed', () => {
  expect(unreachedCustomers([o('1', 'PICKUP', null, { is_pickup: true })], new Set())).toEqual([])
})
