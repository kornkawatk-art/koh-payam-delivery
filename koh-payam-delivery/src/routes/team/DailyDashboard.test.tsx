import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom'
import DailyDashboard from './DailyDashboard'
import { listOrdersForDay } from '../../lib/api/shipDays'

// QrOrderScanner owns the real camera (html5-qrcode) — stub it so this file
// only exercises the dashboard's own toggle + navigate-on-found wiring.
vi.mock('../../components/QrOrderScanner', () => ({
  default: ({
    onFound,
    onClose,
  }: {
    onFound: (o: { id: string; customer_name_en: string; ship_date: string }) => void
    onClose: () => void
  }) => (
    <div>
      <p>qr scanner section</p>
      <button
        onClick={() =>
          onFound({ id: '2', customer_name_en: 'PAYAM CAFE', ship_date: '2026-10-01' })
        }
      >
        mock decode → found
      </button>
      <button onClick={onClose}>mock decode → close</button>
    </div>
  ),
}))

vi.mock('../../lib/api/shipDays', () => ({
  listOrdersForDay: vi.fn().mockResolvedValue([
    {
      id: '1',
      makro_order_no: 'PO-1',
      customer_name_en: 'BLUE VIEW',
      status: 'packed',
      boat_id: null,
      paper_box_count: 2,
      foam_box_count: 0,
      piece_count: 0,
      outstanding_amount: 6172.5,
    },
    {
      id: '2',
      makro_order_no: 'PO-2',
      customer_name_en: 'PAYAM CAFE',
      status: 'packed',
      boat_id: null,
      paper_box_count: 1,
      foam_box_count: 1,
      piece_count: 0,
      outstanding_amount: null,
    },
    {
      id: '3',
      makro_order_no: 'PO-3',
      customer_name_en: 'SUNSET',
      status: 'shipped',
      boat_id: '1',
      paper_box_count: 3,
      foam_box_count: 0,
      piece_count: 0,
      outstanding_amount: 0,
    },
  ]),
}))

const listBackordersForDay = vi.fn().mockResolvedValue([])
vi.mock('../../lib/api/backorders', () => ({
  listBackordersForDay: (...a: unknown[]) => listBackordersForDay(...a),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), unsubscribe: vi.fn() }),
    removeChannel: vi.fn(),
  },
}))

const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={['/']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/" element={<DailyDashboard />} />
        <Route path="/order/:id" element={<OrderPageStub />} />
      </Routes>
    </MemoryRouter>,
  )

function OrderPageStub() {
  const { id } = useParams()
  return <div>order detail page {id}</div>
}

test('summarises status progress for the day as three icon-labeled chips', async () => {
  renderPage()
  // "3/3" only ever appears in the packed-count chip -- unambiguous.
  const packedCount = await screen.findByText('3/3')
  const packedChip = packedCount.parentElement! // the chip <span> wrapping the icon/label/count
  expect(packedChip.textContent).toContain('แพ็คแล้ว')
  // "ถึงท่าเรือ"/"ส่งแล้ว" also label status badges in the table below, so
  // scope to the chip row specifically (the packed chip's own parent) rather
  // than asserting a page-wide unique match.
  const chipRow = packedChip.parentElement!
  expect(within(chipRow).getByText('ถึงท่าเรือ')).toBeInTheDocument()
  expect(within(chipRow).getByText('ส่งแล้ว')).toBeInTheDocument()
})

test('search filters rows client-side by customer name', async () => {
  renderPage()
  await screen.findByText('BLUE VIEW')
  await userEvent.type(
    screen.getByPlaceholderText(/ค้นหาชื่อลูกค้า/),
    'BLUE',
  )
  expect(screen.getByText('BLUE VIEW')).toBeInTheDocument()
  expect(screen.queryByText('PAYAM CAFE')).not.toBeInTheDocument()
  expect(screen.queryByText('SUNSET')).not.toBeInTheDocument()
})

test('order number links through to the order detail route', async () => {
  renderPage()
  const link = await screen.findByRole('link', { name: 'PO-1' })
  expect(link).toHaveAttribute('href', '/order/1')
})

test('shows a pending-backorder banner linking to the destination order', async () => {
  listBackordersForDay.mockResolvedValueOnce([
    {
      id: 'b1',
      source_order_id: 's1',
      reason: 'shortage',
      product_name: 'rice',
      qty: 2,
      target_ship_date: '2026-10-01',
      target_order_id: '1',
      status: 'pending',
    },
  ])
  renderPage()
  expect(await screen.findByText('ของค้างส่ง 1 รายการรอส่งวันนี้')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /rice x2/ })).toHaveAttribute('href', '/order/1')
})

test('the "รวม" column sums paper + foam + piece counts', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    {
      id: '1',
      makro_order_no: 'PO-1',
      customer_name_en: 'BLUE VIEW',
      status: 'packed',
      boat_id: null,
      paper_box_count: 2,
      foam_box_count: 1,
      piece_count: 4,
      outstanding_amount: 0,
    },
  ])
  renderPage()
  await screen.findByText('BLUE VIEW')
  expect(screen.getByRole('columnheader', { name: 'รวม' })).toBeInTheDocument()
  const row1 = screen.getByText('PO-1').closest('tr')!
  expect(within(row1).getByText('7')).toBeInTheDocument()
})

test('shows a เก็บเงิน badge only on rows with outstanding_amount > 0', async () => {
  renderPage()
  await screen.findByText('BLUE VIEW')
  const row1 = screen.getByText('PO-1').closest('tr')!
  const row2 = screen.getByText('PO-2').closest('tr')!
  const row3 = screen.getByText('PO-3').closest('tr')!
  expect(within(row1).getByText('เก็บเงิน')).toBeInTheDocument()
  expect(within(row2).queryByText('เก็บเงิน')).not.toBeInTheDocument()
  expect(within(row3).queryByText('เก็บเงิน')).not.toBeInTheDocument()
})

test('shows a หลาย PO badge only on rows sharing a customer_phone with another row', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    {
      id: '1',
      makro_order_no: 'PO-1',
      customer_name_en: 'BLUE VIEW',
      status: 'packed',
      boat_id: null,
      paper_box_count: 2,
      foam_box_count: 0,
      piece_count: 0,
      outstanding_amount: 0,
      customer_phone: '0826289533',
    },
    {
      id: '2',
      makro_order_no: 'PO-2',
      customer_name_en: 'BLUE VIEW ANNEX',
      status: 'packed',
      boat_id: null,
      paper_box_count: 1,
      foam_box_count: 1,
      piece_count: 0,
      outstanding_amount: 0,
      customer_phone: '0826289533',
    },
    {
      id: '3',
      makro_order_no: 'PO-3',
      customer_name_en: 'SUNSET',
      status: 'shipped',
      boat_id: '1',
      paper_box_count: 3,
      foam_box_count: 0,
      piece_count: 0,
      outstanding_amount: 0,
      customer_phone: null,
    },
  ])
  renderPage()
  await screen.findByText('BLUE VIEW')
  const row1 = screen.getByText('PO-1').closest('tr')!
  const row2 = screen.getByText('PO-2').closest('tr')!
  const row3 = screen.getByText('PO-3').closest('tr')!
  expect(within(row1).getByText('หลาย PO')).toBeInTheDocument()
  expect(within(row2).getByText('หลาย PO')).toBeInTheDocument()
  expect(within(row3).queryByText('หลาย PO')).not.toBeInTheDocument()
})

test('load fails → Thai error + retry re-invokes the loader', async () => {
  vi.mocked(listOrdersForDay).mockRejectedValueOnce(new Error('nope'))
  renderPage()
  await screen.findByText('โหลดงานวันนี้ไม่สำเร็จ')
  const callsBefore = vi.mocked(listOrdersForDay).mock.calls.length

  await userEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }))

  await waitFor(() =>
    expect(vi.mocked(listOrdersForDay).mock.calls.length).toBeGreaterThan(callsBefore),
  )
  expect(await screen.findByText('BLUE VIEW')).toBeInTheDocument()
})

test('the camera button toggles the scanner section open and closed', async () => {
  renderPage()
  await screen.findByText('BLUE VIEW')
  expect(screen.queryByText('qr scanner section')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'สแกน QR ออเดอร์' }))
  expect(screen.getByText('qr scanner section')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'สแกน QR ออเดอร์' }))
  expect(screen.queryByText('qr scanner section')).not.toBeInTheDocument()
})

test('closing from inside the scanner (onClose) also closes the section', async () => {
  renderPage()
  await screen.findByText('BLUE VIEW')
  await userEvent.click(screen.getByRole('button', { name: 'สแกน QR ออเดอร์' }))
  expect(screen.getByText('qr scanner section')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'mock decode → close' }))
  expect(screen.queryByText('qr scanner section')).not.toBeInTheDocument()
})

test('a found order (onFound) navigates to /order/<id> and closes the scanner', async () => {
  renderPage()
  await screen.findByText('BLUE VIEW')
  await userEvent.click(screen.getByRole('button', { name: 'สแกน QR ออเดอร์' }))

  await userEvent.click(screen.getByRole('button', { name: 'mock decode → found' }))

  expect(await screen.findByText('order detail page 2')).toBeInTheDocument()
  expect(screen.queryByText('qr scanner section')).not.toBeInTheDocument()
})
