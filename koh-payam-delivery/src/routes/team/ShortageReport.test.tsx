import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ShortageReport from './ShortageReport'
import type { ShortageReport as Report } from '../../lib/api/shortageReport'

const getShortageReport = vi.fn()
vi.mock('../../lib/api/shortageReport', () => ({
  getShortageReport: (...a: unknown[]) => getShortageReport(...a),
}))

const downloadShortageExcel = vi.fn()
vi.mock('../../lib/shortageExport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/shortageExport')>()),
  downloadShortageExcel: (...a: unknown[]) => downloadShortageExcel(...a),
}))

const report: Report = {
  productCount: 3,
  occurrenceCount: 4,
  affectedOrderCount: 3,
  groups: [
    {
      code: 'FV',
      label: 'FV',
      occurrenceCount: 3,
      products: [
        {
          key: '100001',
          itemId: '100001',
          productName: 'มะพร้าว',
          dept: 'FV',
          totalQty: 8,
          orderCount: 2,
          details: [
            { orderId: 'o-b', makroOrderNo: 'PO-B', customerNameEn: 'Bob', shipDate: '2026-09-02', qty: 3 },
            { orderId: 'o-a', makroOrderNo: 'PO-A', customerNameEn: 'Alice', shipDate: '2026-09-05', qty: 5 },
          ],
        },
        {
          key: '100002',
          itemId: '100002',
          productName: 'มะม่วง',
          dept: 'FV',
          totalQty: 2,
          orderCount: 1,
          details: [
            { orderId: 'o-c', makroOrderNo: 'PO-C', customerNameEn: 'Cindy', shipDate: '2026-09-03', qty: 2 },
          ],
        },
      ],
    },
    {
      code: 'UNKNOWN',
      label: 'ไม่ทราบแผนก',
      occurrenceCount: 1,
      products: [
        {
          key: '200001',
          itemId: '200001',
          productName: 'สบู่',
          dept: 'UNKNOWN',
          totalQty: 1,
          orderCount: 1,
          details: [
            { orderId: 'o-a', makroOrderNo: 'PO-A', customerNameEn: 'Alice', shipDate: '2026-09-05', qty: 1 },
          ],
        },
      ],
    },
  ],
}

beforeEach(() => {
  getShortageReport.mockReset().mockResolvedValue(report)
  downloadShortageExcel.mockReset().mockResolvedValue(undefined)
})

const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={['/shortage-report']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/shortage-report" element={<ShortageReport />} />
        <Route path="/order/:id" element={<div>order detail</div>} />
      </Routes>
    </MemoryRouter>,
  )

test('shows the three summary tiles', async () => {
  renderPage()
  await screen.findByText('มะพร้าว')
  const value = (label: string) =>
    screen.getByText(label, { selector: 'dt' }).parentElement!.querySelector('dd')
  expect(value('สินค้าที่ขาด')).toHaveTextContent(/^3$/)
  expect(value('ขาดทั้งหมด (ครั้ง)')).toHaveTextContent(/^4$/)
  expect(value('ออเดอร์ที่ได้รับผลกระทบ')).toHaveTextContent(/^3$/)
})

test('renders one section per department, products in ranked order with item code and "ขาด N ครั้ง"', async () => {
  renderPage()
  const fv = await screen.findByRole('region', { name: 'แผนก FV' })
  const names = within(fv)
    .getAllByText(/มะพร้าว|มะม่วง/)
    .map((el) => el.textContent)
  expect(names).toEqual(['มะพร้าว', 'มะม่วง'])
  expect(within(fv).getByText('100001')).toBeInTheDocument()
  const first = within(fv).getAllByRole('button', { expanded: false })[0]
  expect(first).toHaveTextContent('ขาด 2 ครั้ง')
  expect(first).toHaveTextContent('รวม 8')
  expect(screen.getByRole('region', { name: 'แผนก ไม่ทราบแผนก' })).toBeInTheDocument()
})

test('the unknown-department section explains how to fill in the department', async () => {
  renderPage()
  const unknown = await screen.findByRole('region', { name: 'แผนก ไม่ทราบแผนก' })
  expect(within(unknown).getByText(/นำเข้าไฟล์ของวันนั้นซ้ำ/)).toBeInTheDocument()
})

test('department filter chips narrow the page to one department', async () => {
  renderPage()
  await screen.findByText('มะพร้าว')
  const chips = screen.getByRole('group', { name: 'กรองตามแผนก' })
  await userEvent.click(within(chips).getByRole('button', { name: /^FV/ }))
  expect(screen.getByRole('region', { name: 'แผนก FV' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'แผนก ไม่ทราบแผนก' })).not.toBeInTheDocument()
  await userEvent.click(within(chips).getByRole('button', { name: /^ทั้งหมด/ }))
  expect(screen.getByRole('region', { name: 'แผนก ไม่ทราบแผนก' })).toBeInTheDocument()
})

test('clicking a product row expands its orders with working links; a second click collapses it', async () => {
  renderPage()
  await screen.findByText('มะพร้าว')
  expect(screen.queryByText('PO-B')).not.toBeInTheDocument()

  await userEvent.click(screen.getByText('มะพร้าว'))
  expect(await screen.findByRole('link', { name: 'PO-A' })).toHaveAttribute('href', '/order/o-a')
  expect(screen.getByRole('link', { name: 'PO-B' })).toHaveAttribute('href', '/order/o-b')
  expect(screen.getByText('Bob')).toBeInTheDocument()
  expect(screen.queryByText('PO-C')).not.toBeInTheDocument() // other products stay closed

  await userEvent.click(screen.getByText('มะพร้าว'))
  expect(screen.queryByText('PO-B')).not.toBeInTheDocument()
})

test('period presets re-fetch with their range and show as pressed', async () => {
  renderPage()
  await screen.findByText('มะพร้าว')
  const periods = screen.getByRole('group', { name: 'ช่วงเวลา' })
  expect(within(periods).getByRole('button', { name: '30 วัน' })).toHaveAttribute('aria-pressed', 'true')

  await userEvent.click(within(periods).getByRole('button', { name: '7 วัน' }))
  const [from, to] = getShortageReport.mock.lastCall!
  const days = (Date.parse(to) - Date.parse(from)) / 86_400_000
  expect(days).toBe(6)
  expect(within(periods).getByRole('button', { name: '7 วัน' })).toHaveAttribute('aria-pressed', 'true')
})

test('changing either date input re-fetches with the new range', async () => {
  renderPage()
  await screen.findByText('มะพร้าว')
  const [, initialTo] = getShortageReport.mock.calls[0]

  const fromField = screen.getByLabelText('จาก') as HTMLInputElement
  await userEvent.clear(fromField)
  await userEvent.type(fromField, '2026-01-01')
  expect(getShortageReport).toHaveBeenLastCalledWith('2026-01-01', initialTo)

  const toField = screen.getByLabelText('ถึง') as HTMLInputElement
  await userEvent.clear(toField)
  await userEvent.type(toField, '2026-01-31')
  expect(getShortageReport).toHaveBeenLastCalledWith('2026-01-01', '2026-01-31')
})

test('"คัดลอกสรุป" copies that department as LINE-ready text and confirms', async () => {
  const user = userEvent.setup()
  renderPage()
  const fv = await screen.findByRole('region', { name: 'แผนก FV' })
  await user.click(within(fv).getByRole('button', { name: 'คัดลอกสรุป' }))
  const text = await navigator.clipboard.readText()
  expect(text.split('\n')[0]).toBe('รายงานของขาด — แผนก FV')
  expect(text).toContain('1. [100001] มะพร้าว — ขาด 2 ครั้ง (รวม 8)')
  expect(text).toContain('รวม 2 รายการ')
  expect(within(fv).getByText(/คัดลอกแล้ว/)).toBeInTheDocument()
})

test('"ดาวน์โหลด Excel" exports the loaded report for the chosen range', async () => {
  renderPage()
  await screen.findByText('มะพร้าว')
  await userEvent.click(screen.getByRole('button', { name: 'ดาวน์โหลด Excel' }))
  const [from, to] = getShortageReport.mock.lastCall!
  expect(downloadShortageExcel).toHaveBeenCalledWith(report, from, to)
})

test('shows the empty state (and disables export) when the range has zero shortages', async () => {
  getShortageReport
    .mockReset()
    .mockResolvedValue({ groups: [], productCount: 0, occurrenceCount: 0, affectedOrderCount: 0 })
  renderPage()
  expect(await screen.findByText('ไม่มีของขาดในช่วงที่เลือก')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'ดาวน์โหลด Excel' })).toBeDisabled()
})

test('shows a Thai error on a load failure', async () => {
  getShortageReport.mockReset().mockRejectedValueOnce(new Error('nope'))
  renderPage()
  expect(await screen.findByText('โหลดรายงานของขาดไม่สำเร็จ')).toBeInTheDocument()
})

test('tapping a department bar in the chart filters the list to that department', async () => {
  renderPage()
  await screen.findByText('มะพร้าว')
  await userEvent.click(screen.getByRole('button', { name: /^FV: ขาด 3 ครั้ง/ }))
  expect(screen.getByRole('region', { name: 'แผนก FV' })).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: 'แผนก ไม่ทราบแผนก' })).not.toBeInTheDocument()
})

test('changing the range keeps the previous report on screen (marked busy) until the new one arrives', async () => {
  renderPage()
  await screen.findByText('มะพร้าว')
  let resolve!: (r: Report) => void
  getShortageReport.mockImplementationOnce(() => new Promise<Report>((r) => (resolve = r)))

  await userEvent.click(screen.getByRole('button', { name: '7 วัน' }))
  expect(screen.getByText('มะพร้าว')).toBeInTheDocument() // no skeleton flash
  expect(screen.getByText('มะพร้าว').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true')

  resolve(report)
  await vi.waitFor(() =>
    expect(screen.getByText('มะพร้าว').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'false'),
  )
})
