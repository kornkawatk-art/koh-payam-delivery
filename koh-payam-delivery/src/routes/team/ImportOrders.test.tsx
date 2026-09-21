import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ImportOrders from './ImportOrders'

const parseMakroFile = vi.fn()
vi.mock('../../lib/import/parseMakroFile', () => ({
  parseMakroFile: (...a: unknown[]) => parseMakroFile(...a),
  detectFileKind: (headers: string[]) =>
    headers.includes('Item Id') ? 'detail' : headers.includes('Sub District') ? 'order' : 'unknown',
}))

const buildImportMock = vi.fn()
vi.mock('../../lib/import/buildImport', async (orig) => ({
  ...(await (orig as () => Promise<Record<string, unknown>>)()),
  buildImport: (...a: unknown[]) => buildImportMock(...a),
}))

const commitImport = vi.fn()
const listOrdersOnOtherDays = vi.fn()
vi.mock('../../lib/api/orders', () => ({
  commitImport: (...a: unknown[]) => commitImport(...a),
  listOrdersOnOtherDays: (...a: unknown[]) => listOrdersOnOtherDays(...a),
}))

// Detail file rows must expose every column the default detail mapping points at.
const detailRow = {
  'Order Number': 'P-1',
  'Product Name': 'rice',
  'Order Quantity': '2',
  'Shipped Quantity': '1',
  'Shortage Quantity': '1',
  'Cancelled Quantity': '0',
  'Item Remark': '',
  'Item Id': '100001',
}
const orderRow = {
  'Order Number': 'P-1',
  'Customer Name': 'PAYAM MART',
  'Sub District': 'เกาะพยาม',
  'Shipping Address': 'x',
  'Original Expected Date': '11-Sep-2026 - 11-Sep-2026',
  'Order Status': 'Completed',
}

const baseResult = {
  orders: [
    {
      makroOrderNo: 'P-1',
      customerName: 'PAYAM MART',
      subDistrict: 'เกาะพยาม',
      shippingAddress: 'x',
      expectedDate: '2026-09-11',
      makroOrderStatus: 'Completed',
      items: [
        { productName: 'rice', isShort: true },
        { productName: 'oil', isShort: false },
      ],
    },
  ],
  skippedNoItems: ['P-9'],
  skippedNotPayam: 1,
  cancelledLinesDropped: 2,
  shippedAllZero: false,
}

beforeEach(() => {
  localStorage.clear()
  parseMakroFile.mockReset()
  buildImportMock.mockReset().mockReturnValue(baseResult)
  commitImport.mockReset().mockResolvedValue({ created: 1, synced: 0, skipped: [] })
  listOrdersOnOtherDays.mockReset().mockResolvedValue([])
})

async function uploadBoth() {
  render(<ImportOrders />)
  parseMakroFile.mockResolvedValueOnce([detailRow]).mockResolvedValueOnce([orderRow])
  await userEvent.upload(
    screen.getByLabelText(/รายการสินค้า/i),
    new File(['d'], 'detail.csv', { type: 'text/csv' }),
  )
  await userEvent.upload(
    screen.getByLabelText(/ไฟล์ที่อยู่/i),
    new File(['o'], 'order.csv', { type: 'text/csv' }),
  )
}

test('renders two separate file inputs', () => {
  render(<ImportOrders />)
  expect(screen.getByLabelText(/รายการสินค้า/i)).toHaveAttribute('type', 'file')
  expect(screen.getByLabelText(/ไฟล์ที่อยู่/i)).toHaveAttribute('type', 'file')
})

test('rejects a file dropped in the wrong slot', async () => {
  render(<ImportOrders />)
  parseMakroFile.mockResolvedValueOnce([orderRow]) // order file into the detail slot
  await userEvent.upload(
    screen.getByLabelText(/รายการสินค้า/i),
    new File(['x'], 'wrong.csv', { type: 'text/csv' }),
  )
  expect(await screen.findByText(/ไม่ใช่ไฟล์รายการสินค้า/i)).toBeInTheDocument()
})

test('preview shows the payam count and the skip lines', async () => {
  await uploadBoth()
  await userEvent.click(await screen.findByRole('button', { name: /ดูตัวอย่าง/i }))

  expect(await screen.findByText(/เจอออเดอร์เกาะพยาม 1 เจ้า/i)).toBeInTheDocument()
  expect(screen.getByText(/ข้าม 1 ออเดอร์ .*P-9/)).toBeInTheDocument()
  expect(screen.getByText(/ข้ามรายการที่ยกเลิก 2 รายการ/)).toBeInTheDocument()
  // preview row: #ของขาด = 1
  expect(screen.getByText('P-1')).toBeInTheDocument()
})

test('preview surfaces the shippedAllZero warning', async () => {
  buildImportMock.mockReturnValue({ ...baseResult, shippedAllZero: true })
  await uploadBoth()
  await userEvent.click(await screen.findByRole('button', { name: /ดูตัวอย่าง/i }))
  expect(await screen.findByText(/ยังไม่มีข้อมูลจัดส่งจากแม็คโคร/i)).toBeInTheDocument()
})

test('import calls commitImport(shipDate, orders) and reports created/synced', async () => {
  commitImport.mockResolvedValue({ created: 3, synced: 2, skipped: [] })
  await uploadBoth()
  await userEvent.click(await screen.findByRole('button', { name: /ดูตัวอย่าง/i }))
  await userEvent.click(await screen.findByRole('button', { name: /นำเข้า 1 ออเดอร์/i }))

  expect(commitImport).toHaveBeenCalledWith('2026-09-11', baseResult.orders)
  expect(await screen.findByText(/นำเข้า 3 ใหม่ · sync 2/i)).toBeInTheDocument()
})

test('preview warns which POs were already imported on another day, and the import button counts only the ones that will be created', async () => {
  listOrdersOnOtherDays.mockResolvedValue([
    { makro_order_no: 'P-1', ship_date: '2026-09-09', status: 'shipped' },
  ])
  await uploadBoth()
  await userEvent.click(await screen.findByRole('button', { name: /ดูตัวอย่าง/i }))
  expect(await screen.findByText('จะข้าม 1 ออเดอร์ที่เคยนำเข้าแล้วในวันอื่น')).toBeInTheDocument()
  expect(screen.getByText('P-1 (2026-09-09)')).toBeInTheDocument()
  // the only order in the file is already imported elsewhere -> nothing left to import
  expect(screen.getByRole('button', { name: /นำเข้า 0 ออเดอร์/i })).toBeDisabled()
  expect(listOrdersOnOtherDays).toHaveBeenCalledWith(['P-1'], '2026-09-11')
})

test('no already-imported warning when none of the POs exist on another day', async () => {
  await uploadBoth()
  await userEvent.click(await screen.findByRole('button', { name: /ดูตัวอย่าง/i }))
  await screen.findByRole('button', { name: /นำเข้า 1 ออเดอร์/i })
  expect(screen.queryByText(/จะข้าม/)).not.toBeInTheDocument()
})

test('a failed already-imported lookup never blocks the preview (commit re-checks anyway)', async () => {
  listOrdersOnOtherDays.mockRejectedValue(new Error('offline'))
  await uploadBoth()
  await userEvent.click(await screen.findByRole('button', { name: /ดูตัวอย่าง/i }))
  expect(await screen.findByRole('button', { name: /นำเข้า 1 ออเดอร์/i })).toBeEnabled()
})

test('the result message reports how many POs were skipped as already imported', async () => {
  commitImport.mockResolvedValue({
    created: 1,
    synced: 0,
    skipped: [{ makroOrderNo: 'P-9', shipDate: '2026-09-08' }],
  })
  await uploadBoth()
  await userEvent.click(await screen.findByRole('button', { name: /ดูตัวอย่าง/i }))
  await userEvent.click(await screen.findByRole('button', { name: /นำเข้า 1 ออเดอร์/i }))
  expect(await screen.findByText('นำเข้า 1 ใหม่ · sync 0 · ข้าม 1 ที่เคยนำเข้าแล้ว')).toBeInTheDocument()
})
