import { computeCreditSummary } from './credit'

test('nets shortage and approved refunds off order value', () => {
  const r = computeCreditSummary({
    totalValue: 12000,
    items: [
      { unit_price: 425, qty_ordered: 2, status: 'short' }, // 850
      { unit_price: 100, qty_ordered: 5, status: 'ok' },
    ],
    claims: [
      { status: 'approved', resolution: 'refund', refund_amount: 300 },
      { status: 'approved', resolution: 'resend_next_day', refund_amount: 0 },
      { status: 'open', resolution: null, refund_amount: 999 },
    ],
  })
  expect(r).toEqual({ orderValue: 12000, shortageValue: 850, approvedRefund: 300, netPayable: 10850 })
})

test('never goes negative', () => {
  const r = computeCreditSummary({
    totalValue: 100,
    items: [{ unit_price: 200, qty_ordered: 1, status: 'short' }],
    claims: [],
  })
  expect(r.netPayable).toBe(0)
})
