import { refreshPayments } from './paymentRefresh'

const current = { payment_method: 'Pay On Delivery', payment_status: 'Unpaid', outstanding_amount: 300, makro_order_status: 'Delivered', paid_marked_at: null }
let existing: Record<string, unknown>[] = []
const updates: { patch: any; no: string }[] = []
const inserts: unknown[] = []
vi.mock('../supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ data: existing, error: null }) }),
      update: (patch: any) => ({
        eq: (_c: string, no: string) => (updates.push({ patch, no }), Promise.resolve({ error: null })),
      }),
      insert: (r: unknown) => (inserts.push(r), Promise.resolve({ error: null })),
    }),
  },
}))
beforeEach(() => {
  existing = [{ makro_order_no: 'P-1', ...current }, { makro_order_no: 'P-2', ...current }]
  updates.length = 0
  inserts.length = 0
})

const row = (no: string, status: string, owe: number) => ({
  makroOrderNo: no,
  paymentMethod: 'Pay On Delivery',
  paymentStatus: status,
  outstandingAmount: owe,
  makroOrderStatus: 'Delivered',
})

test('updates only POs already in the app, never creates one', async () => {
  const r = await refreshPayments([row('P-1', 'Paid', 0), row('P-9', 'Unpaid', 100)])
  expect(r).toEqual({ refreshed: 1, unchanged: 0, notInApp: ['P-9'] })
  expect(updates.map((u) => u.no)).toEqual(['P-1'])
  expect(inserts).toEqual([])
})

test('Makro still unpaid -> the manager’s paid mark is cleared', async () => {
  existing = [{ makro_order_no: 'P-2', ...current, paid_marked_at: '2026-11-02T03:00:00Z' }]
  await refreshPayments([row('P-2', 'Unpaid', 300)])
  expect(updates[0].patch).toMatchObject({ payment_status: 'Unpaid', paid_marked_at: null, paid_marked_by: null })
})

test('a PO whose payment facts did not change is not written again (the hourly import sends ~8 days every time)', async () => {
  const r = await refreshPayments([row('P-1', 'Unpaid', 300), row('P-2', 'Paid', 0)])
  expect(updates.map((u) => u.no)).toEqual(['P-2'])
  expect(r).toEqual({ refreshed: 1, unchanged: 1, notInApp: [] })
})

test("a manager's paid mark on a still-unpaid PO counts as a change (the import clears it)", async () => {
  existing = [{ makro_order_no: 'P-1', ...current, paid_marked_at: '2026-11-02T03:00:00Z' }]
  await refreshPayments([row('P-1', 'Unpaid', 300)])
  expect(updates.map((u) => u.no)).toEqual(['P-1'])
})

test("with keepPaidMark, a marked PO Makro still calls unpaid is left as it is", async () => {
  existing = [{ makro_order_no: 'P-1', ...current, paid_marked_at: '2026-11-02T03:00:00Z' }]
  const r = await refreshPayments([row('P-1', 'Unpaid', 300)], { keepPaidMark: true })
  expect(updates).toEqual([])
  expect(r).toEqual({ refreshed: 0, unchanged: 1, notInApp: [] })
})
