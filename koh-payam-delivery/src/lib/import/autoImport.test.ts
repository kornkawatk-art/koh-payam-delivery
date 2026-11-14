import { autoImport } from './autoImport'
import type { RawRow } from './parseMakroFile'

const commitImport = vi.fn()
const listOrdersOnOtherDays = vi.fn()
const applyVoided = vi.fn()
vi.mock('../api/orders', () => ({
  applyVoided: (...a: unknown[]) => applyVoided(...a),
  commitImport: (...a: unknown[]) => commitImport(...a),
  listOrdersOnOtherDays: (...a: unknown[]) => listOrdersOnOtherDays(...a),
}))
let boxLabels = new Map<string, string>()
vi.mock('../api/boxLabels', () => ({ listBoxLabelMap: () => Promise.resolve(boxLabels) }))
const refreshPayments = vi.fn()
vi.mock('../api/paymentRefresh', () => ({ refreshPayments: (...a: unknown[]) => refreshPayments(...a) }))
const recordImport = vi.fn()
vi.mock('../api/dataImports', () => ({ recordImport: (...a: unknown[]) => recordImport(...a) }))

const TODAY = '2026-10-29'
const DETAIL_HEADERS = ['Order Number', 'Item Id', 'Product Name', 'Order Quantity', 'Shipped Quantity', 'Shortage Quantity', 'Cancelled Quantity', 'Item Remark', 'Dept']
const ORDER_HEADERS = ['Order Number', 'Customer Name', 'Sub District', 'Shipping Address', 'Original Expected Date', 'Order Status', 'Payment Method', 'Payment Status', 'Outstanding Amount', 'Customer Phone', 'Order Type', 'New Expected Delivery Date']
const blank = (hs: string[]) => Object.fromEntries(hs.map((h) => [h, ''])) as RawRow

const item = (no: string): RawRow => ({
  ...blank(DETAIL_HEADERS),
  'Order Number': no,
  'Item Id': '1',
  'Product Name': 'น้ำดื่ม',
  'Order Quantity': '2',
  'Shipped Quantity': '2',
  'Cancelled Quantity': '0',
})
const order = (no: string, date: string, o: Partial<RawRow> = {}): RawRow => ({
  ...blank(ORDER_HEADERS),
  'Order Number': no,
  'Customer Name': 'SHOP ' + no,
  'Sub District': 'เกาะพยาม',
  'Shipping Address': 'บ้าน',
  'Original Expected Date': `${date} - ${date}`,
  'Order Status': 'Packed',
  ...o,
})

beforeEach(() => {
  commitImport.mockReset().mockResolvedValue({ created: 1, synced: 0, moved: 0, skipped: [], refreshed: 0, dropped: [], flagged: [] })
  applyVoided.mockReset().mockResolvedValue({ dropped: [], flagged: [] })
  listOrdersOnOtherDays.mockReset().mockResolvedValue([])
  recordImport.mockReset()
  refreshPayments.mockReset().mockResolvedValue({ refreshed: 1, notInApp: [] })
})

test("only today's and tomorrow's island orders are imported, each on its own day, never moving postponed ones", async () => {
  const r = await autoImport(
    ['P1', 'P2', 'P3', 'P4'].map(item),
    [order('P1', '28-Oct-2026'), order('P2', '29-Oct-2026'), order('P3', '30-Oct-2026'), order('P4', '31-Oct-2026')],
    TODAY,
  )
  expect(commitImport.mock.calls.map((c) => [c[0], (c[1] as { makroOrderNo: string }[]).map((o) => o.makroOrderNo), c[3]])).toEqual([
    ['2026-10-29', ['P2'], []],
    ['2026-10-30', ['P3'], []],
  ])
  expect(r.days.map((d) => d.shipDate)).toEqual(['2026-10-29', '2026-10-30'])
})

test("an order Makro moved goes to its new day", async () => {
  await autoImport(
    [item('P1')],
    [order('P1', '29-Oct-2026', { 'New Expected Delivery Date': '30-Oct-2026 - 30-Oct-2026' })],
    TODAY,
  )
  expect(commitImport.mock.calls.map((c) => c[0])).toEqual(['2026-10-30'])
})

test('city orders are left out', async () => {
  const r = await autoImport([item('C1')], [order('C1', '29-Oct-2026', { 'Sub District': 'บางริ้น', 'Shipping Address': 'ระนอง' })], TODAY)
  expect(commitImport).not.toHaveBeenCalled()
  expect(r.notIsland).toBe(1)
})

test('a PO Makro postponed to this day moves here by itself when it has not reached the pier', async () => {
  listOrdersOnOtherDays.mockResolvedValue([{ id: 'o1', makro_order_no: 'P2', ship_date: '2026-10-28', status: 'imported' }])
  commitImport.mockResolvedValue({ created: 0, synced: 0, moved: 1, skipped: [], refreshed: 0, dropped: [], flagged: [] })
  const r = await autoImport([item('P2')], [order('P2', '29-Oct-2026')], TODAY)
  expect(commitImport.mock.calls[0][3]).toEqual(['P2'])
  expect(r.days[0]).toMatchObject({ moved: 1, postponed: [] })
})

test('a postponed PO already at the pier stays for a manager to decide, and is reported', async () => {
  listOrdersOnOtherDays.mockResolvedValue([{ id: 'o1', makro_order_no: 'P2', ship_date: '2026-10-28', status: 'at_pier' }])
  const r = await autoImport([item('P2')], [order('P2', '29-Oct-2026')], TODAY)
  expect(commitImport.mock.calls[0][3]).toEqual([])
  expect(r.days[0].postponed).toEqual(['P2'])
})

test('a PO that already went out on an earlier day, or one the team postponed to a later day, never moves', async () => {
  listOrdersOnOtherDays.mockResolvedValue([
    { id: 'o1', makro_order_no: 'P2', ship_date: '2026-10-28', status: 'shipped' },
    { id: 'o2', makro_order_no: 'P3', ship_date: '2026-11-02', status: 'packed' },
  ])
  await autoImport(['P2', 'P3'].map(item), [order('P2', '29-Oct-2026'), order('P3', '29-Oct-2026')], TODAY)
  expect(commitImport.mock.calls[0][3]).toEqual([])
})

test('a run with nothing for today or tomorrow still notes the import, so it does not read as late', async () => {
  await autoImport([item('P1')], [order('P1', '25-Oct-2026')], TODAY)
  expect(commitImport).not.toHaveBeenCalled()
  expect(recordImport).toHaveBeenCalledWith(0, 0)
})

test('a file without the expected columns stops before anything is saved', async () => {
  await expect(autoImport([{ foo: '1' }], [order('P1', '29-Oct-2026')], TODAY)).rejects.toThrow('ไฟล์จาก AO ไม่ตรงรูปแบบ')
  expect(commitImport).not.toHaveBeenCalled()
})

test("orders delivered on earlier days get Makro's latest payment status, so a bill paid since then stops locking the customer", async () => {
  const r = await autoImport(
    ['P1', 'P2'].map(item),
    [
      order('P1', '27-Oct-2026', { 'Payment Method': 'Pay on Delivery', 'Payment Status': 'Paid', 'Outstanding Amount': '0' }),
      order('P2', '29-Oct-2026', { 'Payment Method': 'Pay on Delivery', 'Payment Status': 'Unpaid', 'Outstanding Amount': '500' }),
    ],
    TODAY,
  )
  // today's P2 is kept current by its own import; the earlier P1 only by the refresh
  expect(refreshPayments).toHaveBeenCalledTimes(1)
  expect(refreshPayments.mock.calls[0][0]).toEqual([
    { makroOrderNo: 'P1', paymentMethod: 'Pay on Delivery', paymentStatus: 'Paid', outstandingAmount: 0, makroOrderStatus: 'Packed' },
  ])
  expect(r.paymentsRefreshed).toBe(1)
})

test('the payment refresh runs even when nothing is due today or tomorrow', async () => {
  await autoImport([item('P1')], [order('P1', '25-Oct-2026', { 'Payment Status': 'Paid' })], TODAY)
  expect(commitImport).not.toHaveBeenCalled()
  expect(refreshPayments.mock.calls[0][0].map((p: { makroOrderNo: string }) => p.makroOrderNo)).toEqual(['P1'])
})

test("the automatic import never clears a manager's paid mark: both its own sync and the refresh keep it", async () => {
  await autoImport(['P1', 'P2'].map(item), [order('P1', '27-Oct-2026'), order('P2', '29-Oct-2026')], TODAY)
  expect(commitImport.mock.calls[0][4]).toEqual({ keepPaidMark: true })
  expect(refreshPayments.mock.calls[0][1]).toEqual({ keepPaidMark: true })
})

test("a PO sale named in O2O Desk is imported for its day as a Myanmar-bound order with its box name", async () => {
  boxLabels = new Map([['M1', 'ครูวิทย์']])
  await autoImport([item('M1')], [order('M1', '29-Oct-2026', { 'Sub District': 'บางริ้น', 'Shipping Address': 'ระนอง' })], TODAY)
  expect(commitImport.mock.calls[0][1]).toEqual([expect.objectContaining({ makroOrderNo: 'M1', island: 'myanmar', boxLabel: 'ครูวิทย์' })])
  boxLabels = new Map()
})

test('POs Makro canceled are cleared out even when no day had anything to import', async () => {
  applyVoided.mockResolvedValue({ dropped: ['P9'], flagged: [] })
  const r = await autoImport([item('P9')], [order('P9', '29-Oct-2026', { 'Order Status': 'Canceled' })], TODAY)
  expect(commitImport).not.toHaveBeenCalled()
  expect(applyVoided).toHaveBeenCalledWith([{ makroOrderNo: 'P9', status: 'Canceled' }])
  expect(r.voidedDropped).toEqual(['P9'])
})

test('canceled POs go along with the first day imported, and are not cleared twice', async () => {
  commitImport.mockResolvedValue({ created: 1, synced: 0, moved: 0, skipped: [], refreshed: 0, dropped: ['P9'], flagged: [] })
  const r = await autoImport(['P2', 'P9'].map(item), [order('P2', '29-Oct-2026'), order('P9', '29-Oct-2026', { 'Order Status': 'Canceled' })], TODAY)
  expect(commitImport.mock.calls[0][2]).toEqual([{ makroOrderNo: 'P9', status: 'Canceled' }])
  expect(applyVoided).not.toHaveBeenCalled()
  expect(r.voidedDropped).toEqual(['P9'])
})
