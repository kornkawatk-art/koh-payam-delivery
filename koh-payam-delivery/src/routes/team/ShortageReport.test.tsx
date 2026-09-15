import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ShortageReport from './ShortageReport'

const getShortageReport = vi.fn()
vi.mock('../../lib/api/shortageReport', () => ({
  getShortageReport: (...a: unknown[]) => getShortageReport(...a),
}))

const rows = [
  {
    productName: 'มะพร้าว',
    totalQty: 8,
    orderCount: 2,
    details: [
      {
        orderId: 'o-b',
        makroOrderNo: 'PO-B',
        customerNameEn: 'Bob',
        shipDate: '2026-09-02',
        qty: 3,
      },
      {
        orderId: 'o-a',
        makroOrderNo: 'PO-A',
        customerNameEn: 'Alice',
        shipDate: '2026-09-05',
        qty: 5,
      },
    ],
  },
  {
    productName: 'มะม่วง',
    totalQty: 2,
    orderCount: 1,
    details: [
      {
        orderId: 'o-c',
        makroOrderNo: 'PO-C',
        customerNameEn: 'Cindy',
        shipDate: '2026-09-03',
        qty: 2,
      },
    ],
  },
]

beforeEach(() => {
  getShortageReport.mockReset().mockResolvedValue(rows)
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

test('renders the ranked product list in the order returned by getShortageReport', async () => {
  renderPage()
  await screen.findByText('มะพร้าว')
  const names = screen.getAllByText(/มะพร้าว|มะม่วง/).map((el) => el.textContent)
  expect(names).toEqual(['มะพร้าว', 'มะม่วง'])
  expect(screen.getByText('ขาดจาก 2 ออเดอร์')).toBeInTheDocument()
  expect(screen.getByText('ขาดจาก 1 ออเดอร์')).toBeInTheDocument()
})

test('clicking a product row expands its accordion with order-level rows and a working link, a second click collapses it', async () => {
  renderPage()
  await screen.findByText('มะพร้าว')
  expect(screen.queryByText('PO-A')).not.toBeInTheDocument()

  await userEvent.click(screen.getByText('มะพร้าว'))
  const link = await screen.findByRole('link', { name: 'PO-A' })
  expect(link).toHaveAttribute('href', '/order/o-a')
  expect(screen.getByRole('link', { name: 'PO-B' })).toHaveAttribute('href', '/order/o-b')
  expect(screen.getByText('Alice')).toBeInTheDocument()
  expect(screen.getByText('Bob')).toBeInTheDocument()
  // The other product's accordion stays closed.
  expect(screen.queryByText('PO-C')).not.toBeInTheDocument()

  await userEvent.click(screen.getByText('มะพร้าว'))
  expect(screen.queryByText('PO-A')).not.toBeInTheDocument()
})

test('changing either date input re-fetches with the new range', async () => {
  renderPage()
  await screen.findByText('มะพร้าว')
  expect(getShortageReport).toHaveBeenCalledTimes(1)
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

test('shows the empty state when the range has zero shortages', async () => {
  getShortageReport.mockReset().mockResolvedValue([])
  renderPage()
  expect(await screen.findByText('ไม่มีของขาดในช่วงที่เลือก')).toBeInTheDocument()
})

test('shows a Thai error on a load failure', async () => {
  getShortageReport.mockReset().mockRejectedValueOnce(new Error('nope'))
  renderPage()
  expect(await screen.findByText('โหลดรายงานของขาดไม่สำเร็จ')).toBeInTheDocument()
})
