import { customerDebts, daysOwed, isUnpaidBill, lockFor, paymentPatch, type Bill } from './payments'

const bill = (o: Partial<Bill>): Bill => ({
  id: 'b',
  makro_order_no: 'PO',
  customer_name_en: 'JJ Payam',
  customer_phone: '0826289533',
  ship_date: '2026-10-08',
  outstanding_amount: 500,
  payment_method: 'Pay On Delivery',
  payment_status: 'Unpaid',
  paid_marked_at: null,
  is_pickup: false,
  makro_order_status: 'Delivered',
  ...o,
})
const JJ = { customer_phone: '082-628-9533', customer_name_en: 'jj payam' }

test('isUnpaidBill: only unpaid cash-on-delivery bills with money owing', () => {
  expect(isUnpaidBill(bill({}))).toBe(true)
  expect(isUnpaidBill(bill({ payment_status: 'Paid' }))).toBe(false)
  expect(isUnpaidBill(bill({ outstanding_amount: 0 }))).toBe(false)
  expect(isUnpaidBill(bill({ payment_method: 'Credit Sales' }))).toBe(false)
  expect(isUnpaidBill(bill({ paid_marked_at: '2026-10-09T00:00:00Z' }))).toBe(false)
  expect(isUnpaidBill(bill({ is_pickup: true }))).toBe(false)
  expect(isUnpaidBill(bill({ makro_order_status: 'Canceled' }))).toBe(false)
})

test('daysOwed counts calendar days from the delivery', () => {
  expect(daysOwed('2026-10-08', '2026-10-12')).toBe(4)
  expect(daysOwed('2026-10-12', '2026-10-12')).toBe(0)
})

test('locked only by a bill from an EARLIER delivery; the same delivery’s bill is fine', () => {
  const today = '2026-10-12'
  expect(lockFor(JJ, '2026-10-12', [bill({ ship_date: '2026-10-12' })], new Set(), today).locked).toBe(false)
  const l = lockFor(
    JJ,
    '2026-10-12',
    [bill({ ship_date: '2026-10-08' }), bill({ id: 'c', ship_date: '2026-10-10', outstanding_amount: 300 })],
    new Set(),
    today,
  )
  expect(l).toMatchObject({ locked: true, released: false, total: 800, oldestDays: 4 })
  expect(l.priorBills).toHaveLength(2)
})

test('a release lifts the lock for that delivery only', () => {
  const key = 'phone:0826289533|name:JJ PAYAM'
  const bills = [bill({ ship_date: '2026-10-08' })]
  expect(lockFor(JJ, '2026-10-12', bills, new Set([key]), '2026-10-12')).toMatchObject({
    locked: false,
    released: true,
  })
  // releasedKeys are per ship date -- the caller passes the releases for D; another date has none
  expect(lockFor(JJ, '2026-10-13', bills, new Set(), '2026-10-13').locked).toBe(true)
})

test('another customer’s bill never locks this one', () => {
  expect(
    lockFor(JJ, '2026-10-12', [bill({ customer_name_en: 'Other Shop' })], new Set(), '2026-10-12').locked,
  ).toBe(false)
})

test('customerDebts: per customer, oldest first, flags who is locked today', () => {
  const debts = customerDebts(
    [
      bill({ id: '1', ship_date: '2026-10-11', outstanding_amount: 100 }),
      bill({ id: '2', customer_name_en: 'Sunset', customer_phone: null, ship_date: '2026-10-05', outstanding_amount: 50 }),
      bill({ id: '3', ship_date: '2026-10-12', outstanding_amount: 70 }),
      bill({ id: '4', payment_status: 'Paid' }),
    ],
    '2026-10-12',
  )
  expect(debts.map((d) => [d.name, d.total, d.oldestDays, d.lockedToday])).toEqual([
    ['Sunset', 50, 7, true],
    ['JJ Payam', 170, 1, true],
  ])
})

test('paymentPatch: Makro facts, and Makro "not paid" clears a manager mark', () => {
  expect(
    paymentPatch({ paymentMethod: 'Pay On Delivery', paymentStatus: 'Unpaid', outstandingAmount: 500, makroOrderStatus: 'Delivered' }),
  ).toEqual({
    payment_method: 'Pay On Delivery',
    payment_status: 'Unpaid',
    outstanding_amount: 500,
    makro_order_status: 'Delivered',
    paid_marked_at: null,
    paid_marked_by: null,
  })
  expect(
    paymentPatch({ paymentMethod: 'Pay On Delivery', paymentStatus: 'Paid', outstandingAmount: 0, makroOrderStatus: 'Delivered' }),
  ).toEqual({
    payment_method: 'Pay On Delivery',
    payment_status: 'Paid',
    outstanding_amount: 0,
    makro_order_status: 'Delivered',
  })
})
