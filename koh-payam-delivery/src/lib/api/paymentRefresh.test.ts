import { refreshPayments } from './paymentRefresh'

const existing = [{ makro_order_no: 'P-1' }, { makro_order_no: 'P-2' }]
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
  expect(r).toEqual({ refreshed: 1, notInApp: ['P-9'] })
  expect(updates.map((u) => u.no)).toEqual(['P-1'])
  expect(inserts).toEqual([])
})

test('Makro still unpaid -> the manager’s paid mark is cleared', async () => {
  await refreshPayments([row('P-2', 'Unpaid', 300)])
  expect(updates[0].patch).toMatchObject({ payment_status: 'Unpaid', paid_marked_at: null, paid_marked_by: null })
})
