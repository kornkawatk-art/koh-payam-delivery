import { autoImport } from './autoImport'
import type { RawRow } from './parseMakroFile'

const commitImport = vi.fn()
const listOrdersOnOtherDays = vi.fn()
vi.mock('../api/orders', () => ({
  commitImport: (...a: unknown[]) => commitImport(...a),
  listOrdersOnOtherDays: (...a: unknown[]) => listOrdersOnOtherDays(...a),
}))
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
  commitImport.mockReset().mockResolvedValue({ created: 1, synced: 0, moved: 0, skipped: [], refreshed: 0 })
  listOrdersOnOtherDays.mockReset().mockResolvedValue([])
  recordImport.mockReset()
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

test('postponed orders still on an earlier day are reported for a manager to tick, not moved', async () => {
  listOrdersOnOtherDays.mockResolvedValue([{ id: 'o1', makro_order_no: 'P2', ship_date: '2026-10-28', status: 'packed' }])
  const r = await autoImport([item('P2')], [order('P2', '29-Oct-2026')], TODAY)
  expect(commitImport.mock.calls[0][3]).toEqual([])
  expect(r.days[0].postponed).toEqual(['P2'])
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
