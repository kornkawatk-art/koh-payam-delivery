import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom'
import DailyDashboard from './DailyDashboard'
import { listOrdersForDay, getShipDayLinksSentAt, sendOrderLinks } from '../../lib/api/shipDays'
import { todayLocalISO } from '../../lib/format'

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
  // Non-null by default so the new "ยังไม่ได้ส่งลิงก์ไลน์" banner stays out of
  // every pre-existing test's way; tests that care override it explicitly.
  getShipDayLinksSentAt: vi.fn().mockResolvedValue('2026-01-01T00:00:00.000Z'),
  sendOrderLinks: vi.fn().mockResolvedValue({ sent: 0, failed: 0, skipped: false }),
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

const groupOrders = () => [
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
    packer_name: 'สมชาย',
  },
  {
    id: '2',
    makro_order_no: 'PO-2',
    customer_name_en: 'BLUE VIEW ANNEX',
    status: 'imported',
    boat_id: null,
    paper_box_count: 0,
    foam_box_count: 0,
    piece_count: 3,
    outstanding_amount: 100,
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
]

test('POs sharing a customer_phone collapse into one group row (N PO, progress, summed boxes) with a link to the combined pack page', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce(groupOrders())
  renderPage()
  await screen.findByText('SUNSET')
  const badge = screen.getByText('2 PO')
  const row = badge.closest('tr')!
  expect(within(row).getByText('แพ็คแล้ว 1/2')).toBeInTheDocument()
  expect(within(row).getByText('เก็บเงิน')).toBeInTheDocument()
  expect(within(row).getByText('5')).toBeInTheDocument() // PO-1: 2 boxes, PO-2: 3 pieces
  expect(within(row).getByRole('link', { name: 'แพ็ครวม' })).toHaveAttribute(
    'href',
    expect.stringMatching(/^\/customer\/\d{4}-\d{2}-\d{2}\/0826289533\/pack$/),
  )
  // collapsed by default: the member POs are hidden, the lone PO-3 is a normal row
  expect(screen.queryByRole('link', { name: 'PO-1' })).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'PO-3' })).toBeInTheDocument()
})

test('expanding a group shows its member POs with links to their own detail pages', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce(groupOrders())
  renderPage()
  await screen.findByText('SUNSET')
  await userEvent.click(screen.getByRole('button', { name: /ขยายออเดอร์ของ/ }))
  expect(screen.getByRole('link', { name: 'PO-1' })).toHaveAttribute('href', '/order/1')
  expect(screen.getByRole('link', { name: 'PO-2' })).toHaveAttribute('href', '/order/2')
  await userEvent.click(screen.getByRole('button', { name: /ยุบออเดอร์ของ/ }))
  expect(screen.queryByRole('link', { name: 'PO-1' })).not.toBeInTheDocument()
})

test('a group stays under "ยังไม่แพ็ค" while any PO is still imported, and moves to "แพ็คแล้ว" once all are past it', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce(groupOrders())
  const { unmount } = renderPage()
  await screen.findByText('SUNSET')
  let cells = Array.from(screen.getByRole('table').querySelectorAll('td, th')).map((c) => c.textContent)
  expect(cells.indexOf('ยังไม่แพ็ค (1)')).toBeLessThan(cells.findIndex((c) => c?.includes('2 PO')))
  expect(cells.findIndex((c) => c?.includes('2 PO'))).toBeLessThan(cells.indexOf('แพ็คแล้ว (1)'))
  unmount()

  vi.mocked(listOrdersForDay).mockResolvedValueOnce(
    groupOrders().map((o) => (o.id === '2' ? { ...o, status: 'packed' } : o)),
  )
  renderPage()
  await screen.findByText('SUNSET')
  cells = Array.from(screen.getByRole('table').querySelectorAll('td, th')).map((c) => c.textContent)
  expect(cells.indexOf('ยังไม่แพ็ค (1)')).toBe(-1)
  expect(cells.indexOf('แพ็คแล้ว (2)')).toBeGreaterThanOrEqual(0)
})

test('searching a member PO number keeps the whole group visible', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce(groupOrders())
  renderPage()
  await screen.findByText('SUNSET')
  await userEvent.type(screen.getByPlaceholderText(/ค้นหาชื่อลูกค้า/), 'PO-2')
  expect(screen.getByText('2 PO')).toBeInTheDocument()
  expect(screen.queryByText('SUNSET')).not.toBeInTheDocument()
})

test('orders with a blank phone are never grouped, even with the same customer name', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce(
    groupOrders().map((o) => ({ ...o, customer_phone: '', customer_name_en: 'SAME' })),
  )
  renderPage()
  await screen.findByRole('link', { name: 'PO-1' })
  expect(screen.queryByText(/\d+ PO$/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'PO-2' })).toBeInTheDocument()
})

test('splits the table into "ยังไม่แพ็ค" (not-yet-packed) on top and "แพ็คแล้ว" below, each under its own divider', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    {
      id: '1',
      makro_order_no: 'PO-1',
      customer_name_en: 'ALREADY PACKED',
      status: 'packed',
      boat_id: null,
      paper_box_count: 1,
      foam_box_count: 0,
      piece_count: 0,
      outstanding_amount: 0,
    },
    {
      id: '2',
      makro_order_no: 'PO-2',
      customer_name_en: 'NOT PACKED YET',
      status: 'imported',
      boat_id: null,
      paper_box_count: 0,
      foam_box_count: 0,
      piece_count: 0,
      outstanding_amount: 0,
    },
    {
      id: '3',
      makro_order_no: 'PO-3',
      customer_name_en: 'ON THE PIER',
      status: 'at_pier',
      boat_id: '1',
      paper_box_count: 2,
      foam_box_count: 0,
      piece_count: 0,
      outstanding_amount: 0,
    },
  ])
  renderPage()
  await screen.findByText('NOT PACKED YET')

  const table = screen.getByRole('table')
  const cellText = Array.from(table.querySelectorAll('td, th')).map((c) => c.textContent)
  const idxNotPackedHeader = cellText.indexOf('ยังไม่แพ็ค (1)')
  const idxNotPackedYet = cellText.indexOf('NOT PACKED YET')
  const idxPackedHeader = cellText.indexOf('แพ็คแล้ว (2)')
  const idxAlreadyPacked = cellText.indexOf('ALREADY PACKED')
  const idxOnThePier = cellText.indexOf('ON THE PIER')

  expect(idxNotPackedHeader).toBeGreaterThanOrEqual(0)
  expect(idxPackedHeader).toBeGreaterThanOrEqual(0)
  // "ยังไม่แพ็ค" section (header + its row) comes entirely before "แพ็คแล้ว"
  expect(idxNotPackedHeader).toBeLessThan(idxNotPackedYet)
  expect(idxNotPackedYet).toBeLessThan(idxPackedHeader)
  expect(idxPackedHeader).toBeLessThan(idxAlreadyPacked)
  expect(idxPackedHeader).toBeLessThan(idxOnThePier)
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

test('prompts to send LINE links when they have not been sent yet for today, and the prompt clears once sent', async () => {
  vi.mocked(getShipDayLinksSentAt).mockResolvedValueOnce(null)
  renderPage()
  await screen.findByText('BLUE VIEW')
  expect(await screen.findByText('ยังไม่ได้ส่งลิงก์ไลน์ให้ลูกค้าวันนี้')).toBeInTheDocument()

  vi.mocked(sendOrderLinks).mockResolvedValueOnce({ sent: 3, failed: 0, skipped: false })
  await userEvent.click(screen.getByRole('button', { name: 'ส่งลิงก์ไลน์เลย' }))

  expect(sendOrderLinks).toHaveBeenCalledWith(todayLocalISO())
  expect(await screen.findByText('ส่งลิงก์ไลน์ 3 ฉบับ')).toBeInTheDocument()
  expect(
    screen.queryByText('ยังไม่ได้ส่งลิงก์ไลน์ให้ลูกค้าวันนี้'),
  ).not.toBeInTheDocument()
})

test('no send-links prompt when links were already sent for today', async () => {
  renderPage()
  await screen.findByText('BLUE VIEW')
  expect(
    screen.queryByText('ยังไม่ได้ส่งลิงก์ไลน์ให้ลูกค้าวันนี้'),
  ).not.toBeInTheDocument()
})

test('shows a Thai error inline when sending fails, and keeps the prompt so it can be retried', async () => {
  vi.mocked(getShipDayLinksSentAt).mockResolvedValueOnce(null)
  vi.mocked(sendOrderLinks).mockRejectedValueOnce(new Error('ยังไม่ได้ตั้งค่า LINE'))
  renderPage()
  await screen.findByText('BLUE VIEW')
  await screen.findByText('ยังไม่ได้ส่งลิงก์ไลน์ให้ลูกค้าวันนี้')

  await userEvent.click(screen.getByRole('button', { name: 'ส่งลิงก์ไลน์เลย' }))

  expect(await screen.findByText('ยังไม่ได้ตั้งค่า LINE')).toBeInTheDocument()
  expect(screen.getByText('ยังไม่ได้ส่งลิงก์ไลน์ให้ลูกค้าวันนี้')).toBeInTheDocument()
})

test('never checks or offers to send links for a date other than today', async () => {
  vi.mocked(getShipDayLinksSentAt).mockClear()
  renderPage()
  await screen.findByText('BLUE VIEW')
  await waitFor(() => expect(getShipDayLinksSentAt).toHaveBeenCalledTimes(1))

  const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
  await userEvent.clear(dateInput)
  await userEvent.type(dateInput, '2020-01-15')

  await waitFor(() => expect(dateInput.value).toBe('2020-01-15'))
  expect(
    screen.queryByText('ยังไม่ได้ส่งลิงก์ไลน์ให้ลูกค้าวันนี้'),
  ).not.toBeInTheDocument()
  // still just the one call from the initial (today) render -- never re-queried for the past date
  expect(getShipDayLinksSentAt).toHaveBeenCalledTimes(1)
})
