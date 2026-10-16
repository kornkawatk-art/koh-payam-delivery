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

vi.mock('../../components/BulkStickerPrint', () => ({
  BulkStickerDialog: ({ jobs }: { jobs: { name: string }[] }) => (
    <div role="dialog" aria-label="พิมพ์สติ๊กเกอร์ทั้งหมด">{jobs.map((j) => j.name).join(', ')}</div>
  ),
}))

vi.mock('../../lib/api/shipDays', () => ({
  listOrdersForDay: vi.fn().mockResolvedValue([
    {
      id: '1',
      makro_order_no: 'PO-1',
      customer_name_en: 'BLUE VIEW',
      island: 'payam',
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
      island: 'payam',
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
      island: 'payam',
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
  sendOrderLinks: vi.fn().mockResolvedValue({ sent: 0, failed: 0, skipped: false, unreached: [] }),
}))

const listBackordersForDay = vi.fn().mockResolvedValue([])
const authRole = { current: 'packer' }
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ profile: { id: 'u1', name: 'x', role: authRole.current } }) }))
const getDayLocks = vi.fn().mockResolvedValue(new Map())
const releaseCustomer = vi.fn().mockResolvedValue(undefined)
vi.mock('../../lib/api/payments', () => ({
  getDayLocks: (...a: unknown[]) => getDayLocks(...a),
  releaseCustomer: (...a: unknown[]) => releaseCustomer(...a),
}))

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

test('summarises status progress for the day as icon-labeled count tiles', async () => {
  renderPage()
  // "3/3" only ever appears in the packed-count chip -- unambiguous.
  const packedCount = await screen.findByText('3/3')
  const packedChip = packedCount.parentElement! // the tile wrapping the icon/label/count
  expect(packedChip.textContent).toContain('แพ็คแล้ว')
  // "ถึงท่าเรือ"/"ส่งแล้ว" also label status badges in the table below, so
  // scope to the chip row specifically (the packed chip's own parent) rather
  // than asserting a page-wide unique match.
  const chipRow = packedChip.parentElement!
  expect(within(chipRow).getByText('ถึงท่าเรือ')).toBeInTheDocument()
  expect(within(chipRow).getByText('ส่งแล้ว')).toBeInTheDocument()
  expect(within(chipRow).getByText('ออเดอร์ทั้งหมด')).toBeInTheDocument()
  // ถึงท่าเรือ / ส่งแล้ว get the same X/total + bar (fixture: 3 POs, 1 shipped,
  // and a shipped PO has necessarily passed the pier too).
  expect(within(chipRow).getByRole('progressbar', { name: 'ความคืบหน้าถึงท่าเรือ' })).toHaveAttribute(
    'aria-valuenow',
    '1',
  )
  expect(within(chipRow).getByRole('progressbar', { name: 'ความคืบหน้าการส่ง' })).toHaveAttribute(
    'aria-valuemax',
    '3',
  )
  expect(within(chipRow).getAllByText('1/3')).toHaveLength(2)
  expect(within(chipRow).getByRole('progressbar', { name: 'ความคืบหน้าการแพ็ค' })).toHaveAttribute(
    'aria-valuenow',
    '3',
  )
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

test("lists only this day's short lines, each linking to its order", async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    {
      id: '1',
      makro_order_no: 'PO-1',
      customer_name_en: 'BLUE VIEW',
      island: 'payam',
      status: 'imported',
      item_statuses: [
        { status: 'ok', product_name: 'rice', qty_ordered: 2, qty_shipped: 2, shortage_qty: 0 },
        { status: 'short', product_name: 'coconut', qty_ordered: 1, qty_shipped: 0, shortage_qty: 0 },
        { status: 'short', product_name: 'chili', qty_ordered: 5, qty_shipped: 2, shortage_qty: 3 },
      ],
    },
  ])
  renderPage()
  expect(await screen.findByText('ของขาดวันนี้ 2 รายการ')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'coconut x1' })).toHaveAttribute('href', '/order/1')
  expect(screen.getByRole('link', { name: 'chili x3' })).toHaveAttribute('href', '/order/1')
  expect(screen.queryByRole('link', { name: /rice/ })).not.toBeInTheDocument()
})

test('the "รวม" column sums paper + foam + piece counts', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    {
      id: '1',
      makro_order_no: 'PO-1',
      customer_name_en: 'BLUE VIEW',
      island: 'payam',
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
    island: 'payam',
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
    customer_name_en: 'Blue  View',
    island: 'payam', // same shop, Makro spacing/case differs
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
    island: 'payam',
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
    expect.stringMatching(/^\/customer\/\d{4}-\d{2}-\d{2}\/0826289533\/pack\?name=BLUE%20VIEW$/),
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
      island: 'payam',
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
      island: 'payam',
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
      island: 'payam',
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

  vi.mocked(sendOrderLinks).mockResolvedValueOnce({ sent: 3, failed: 0, skipped: false, unreached: [] })
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

const withStatuses = (o: any, statuses: string[]) => ({
  ...o,
  item_statuses: statuses.map((status) => ({ status })),
})

test('a PO with Makro shortages shows a red "ขาด N" badge; a PO without shows none', async () => {
  const [a, b, c] = groupOrders()
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    withStatuses({ ...a, customer_phone: null }, ['ok', 'short', 'short']),
    withStatuses({ ...b, customer_phone: null }, ['ok', 'ok']),
    c, // older payload without item_statuses: no badge, no crash
  ])
  renderPage()
  const row1 = (await screen.findByText('PO-1')).closest('tr')!
  expect(within(row1).getByText('ขาด 2')).toHaveClass('badge-danger')
  expect(within(screen.getByText('PO-2').closest('tr')!).queryByText(/^ขาด/)).not.toBeInTheDocument()
  expect(within(screen.getByText('PO-3').closest('tr')!).queryByText(/^ขาด/)).not.toBeInTheDocument()
})

test('a customer group row sums the shortages of its POs', async () => {
  const [a, b, c] = groupOrders()
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    withStatuses(a, ['short']),
    withStatuses(b, ['short', 'short', 'ok']),
    c,
  ])
  renderPage()
  const groupRow = (await screen.findByText('2 PO')).closest('tr')!
  expect(within(groupRow).getByText('ขาด 3')).toBeInTheDocument()
})

test('the same owner (same phone) with a different shop name is NOT grouped -- each shop packs and ships on its own', async () => {
  const [a, b, c] = groupOrders()
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([a, { ...b, customer_name_en: 'ZIGGY RESORT' }, c])
  renderPage()
  await screen.findByText('SUNSET')
  expect(screen.queryByText('2 PO')).not.toBeInTheDocument()
  expect(screen.getByText('PO-1')).toBeInTheDocument()
  expect(screen.getByText('PO-2')).toBeInTheDocument()
})

test('the combined-pack link carries the shop name so only that shop\u2019s POs load', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce(groupOrders())
  renderPage()
  const link = await screen.findByRole('link', { name: 'แพ็ครวม' })
  expect(link.getAttribute('href')).toMatch(/\/pack\?name=BLUE%20VIEW$/)
})

test('island chips appear on a mixed day; an untagged order stays visible under every island', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    { id: '1', makro_order_no: 'PO-1', customer_name_en: 'PAYAM ONE', island: 'payam', status: 'imported', boat_id: null, paper_box_count: 0, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '01' },
    { id: '2', makro_order_no: 'PO-2', customer_name_en: 'CHANG ONE', island: 'chang', status: 'imported', boat_id: null, paper_box_count: 0, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '02' },
    { id: '3', makro_order_no: 'PO-3', customer_name_en: 'PIER ONLY', island: null, status: 'imported', boat_id: null, paper_box_count: 0, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '03' },
  ])
  renderPage()
  expect(await screen.findByText('PIER ONLY')).toBeInTheDocument()
  expect(screen.getByText('เลือกเกาะ')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'เกาะช้าง' }))
  expect(screen.getByText('CHANG ONE')).toBeInTheDocument()
  expect(screen.getByText('PIER ONLY')).toBeInTheDocument()
  expect(screen.queryByText('PAYAM ONE')).not.toBeInTheDocument()
})

test('a single-island day shows no island chips or badges', async () => {
  renderPage()
  await screen.findByText('BLUE VIEW')
  expect(screen.queryByRole('group', { name: 'กรองตามเกาะ' })).not.toBeInTheDocument()
  expect(screen.queryByText('เกาะพยาม')).not.toBeInTheDocument()
})

test('a pick-up-at-store order carries a "รับเองที่สาขา" badge', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    { id: '1', makro_order_no: 'PO-1', customer_name_en: 'STORE PICKUP', island: 'payam', is_pickup: true, status: 'imported', boat_id: null, paper_box_count: 0, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '01' },
    { id: '2', makro_order_no: 'PO-2', customer_name_en: 'BY BOAT', island: 'payam', is_pickup: false, status: 'imported', boat_id: null, paper_box_count: 0, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '02' },
  ])
  renderPage()
  const row = (await screen.findByText('STORE PICKUP')).closest('tr') as HTMLElement
  expect(within(row).getByText('รับเองที่สาขา')).toBeInTheDocument()
  expect(within(screen.getByText('BY BOAT').closest('tr') as HTMLElement).queryByText('รับเองที่สาขา')).not.toBeInTheDocument()
})

test('after sending, a popup lists the customers LINE did not reach, linking to their orders', async () => {
  vi.mocked(getShipDayLinksSentAt).mockResolvedValueOnce(null)
  renderPage()
  await screen.findByText('BLUE VIEW')
  vi.mocked(sendOrderLinks).mockResolvedValueOnce({
    sent: 2,
    failed: 0,
    skipped: false,
    unreached: [
      { customerName: 'PAYAM CAFE', phone: '0822222222', reason: 'not_registered', orders: [{ id: '2', makroOrderNo: 'PO-2' }] },
      { customerName: 'NO PHONE SHOP', phone: null, reason: 'no_phone', orders: [{ id: '9', makroOrderNo: 'PO-9' }] },
    ],
  })
  await userEvent.click(screen.getByRole('button', { name: 'ส่งลิงก์ไลน์เลย' }))

  const dialog = await screen.findByRole('dialog', { name: 'ลูกค้าที่ยังไม่ได้รับลิงก์ทางไลน์' })
  expect(within(dialog).getByText('ยังไม่ได้รับลิงก์ทางไลน์ 2 ราย')).toBeInTheDocument()
  expect(within(dialog).getByText(/ยังไม่ได้ลงทะเบียน LINE/)).toBeInTheDocument()
  expect(within(dialog).getByText(/ไม่มีเบอร์โทรในออเดอร์/)).toBeInTheDocument()
  expect(within(dialog).getByRole('link', { name: 'PO-2' })).toHaveAttribute('href', '/order/2')
  expect(screen.getByText('ส่งลิงก์ไลน์ 2 ฉบับ · ยังไม่ได้รับ 2 ราย')).toBeInTheDocument()

  await userEvent.click(within(dialog).getByRole('button', { name: 'รับทราบ' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('no popup when everyone was reached', async () => {
  vi.mocked(getShipDayLinksSentAt).mockResolvedValueOnce(null)
  renderPage()
  await screen.findByText('BLUE VIEW')
  vi.mocked(sendOrderLinks).mockResolvedValueOnce({ sent: 3, failed: 0, skipped: false, unreached: [] })
  await userEvent.click(screen.getByRole('button', { name: 'ส่งลิงก์ไลน์เลย' }))
  await screen.findByText('ส่งลิงก์ไลน์ 3 ฉบับ')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('a Makro-returned order carries a red badge; a collected pickup shows on the pickup line, not the boat tiles', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    { id: '1', makro_order_no: 'PO-1', customer_name_en: 'RETURNED SHOP', island: 'payam', makro_order_status: 'Returned', status: 'imported', boat_id: null, paper_box_count: 0, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '01' },
    { id: '2', makro_order_no: 'PO-2', customer_name_en: 'PICKED SHOP', island: 'payam', is_pickup: true, status: 'picked_up', boat_id: null, paper_box_count: 0, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '02' },
  ])
  renderPage()
  const row = (await screen.findByText('RETURNED SHOP')).closest('tr') as HTMLElement
  expect(within(row).getByText('แม็คโคร: คืนสินค้า')).toHaveClass('badge-danger')
  // boat tiles: only the returned (unpacked) boat order; the pickup is on its own line
  expect(screen.getAllByText('0/1').length).toBeGreaterThan(0)
  expect(screen.getByText('รับเองที่สาขา 1 (รับแล้ว 1)')).toBeInTheDocument()
})

test('"print all stickers" counts customers and stickers still due, and opens the batch dialog', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    { id: '1', makro_order_no: 'PO-1', customer_name_en: 'DUE ONE', island: 'payam', status: 'packed', boat_id: null, paper_box_count: 2, foam_box_count: 1, piece_count: 0, outstanding_amount: 0, customer_phone: '01', stickers_printed: null },
    { id: '2', makro_order_no: 'PO-2', customer_name_en: 'DONE', island: 'payam', status: 'packed', boat_id: null, paper_box_count: 1, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '02', stickers_printed: '1,0,0' },
    { id: '3', makro_order_no: 'PO-3', customer_name_en: 'NOT PACKED', island: 'payam', status: 'imported', boat_id: null, paper_box_count: 0, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '03' },
  ])
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'พิมพ์สติ๊กเกอร์ (1 เจ้า · 3 ดวง)' }))
  expect(screen.getByRole('dialog', { name: 'พิมพ์สติ๊กเกอร์ทั้งหมด' })).toHaveTextContent('DONE, DUE ONE') // island, then name
})

test('the sticker button explains a zero: nothing packed yet, or everything already printed', async () => {
  const row = (id: string, status: string, printed: string | null) => ({
    id, makro_order_no: 'PO-' + id, customer_name_en: 'SHOP ' + id, island: 'payam', status, boat_id: null,
    paper_box_count: 1, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '0' + id, stickers_printed: printed,
  })
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([row('1', 'shipped', null), row('2', 'imported', null)])
  const { unmount } = renderPage()
  expect(await screen.findByText('ยังไม่มีออเดอร์ที่แพ็คเสร็จรอพิมพ์')).toBeInTheDocument()
  unmount()

  vi.mocked(listOrdersForDay).mockResolvedValueOnce([row('3', 'packed', '1,0,0')])
  renderPage()
  expect(await screen.findByText('พิมพ์ครบทุกเจ้าแล้ว')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'พิมพ์สติ๊กเกอร์ (0 เจ้า · 0 ดวง)' })).toBeEnabled() // still opens, for a reprint
})

test('store pickups stay out of the boat tiles: own line under them, own section at the end of the table', async () => {
  const row = (id: string, name: string, status: string, is_pickup = false) => ({
    id, makro_order_no: 'PO-' + id, customer_name_en: name, island: 'payam', status, is_pickup, boat_id: null,
    paper_box_count: 1, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '0' + id,
  })
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    row('1', 'BOAT SHIPPED', 'shipped'),
    row('2', 'BOAT PACKED', 'packed'),
    row('3', 'PICKUP WAITING', 'imported', true),
    row('4', 'PICKUP DONE', 'picked_up', true),
  ])
  renderPage()
  await screen.findByText('BOAT SHIPPED')
  // tiles count the 2 boat orders only
  expect(screen.getByText('2/2')).toBeInTheDocument() // packed
  expect(screen.getAllByText('1/2')).toHaveLength(2) // at pier, shipped
  expect(screen.getByText('รับเองที่สาขา 2 (รับแล้ว 1)')).toBeInTheDocument()

  const cells = Array.from(screen.getByRole('table').querySelectorAll('td')).map((c) => c.textContent ?? '')
  const pickupHeader = cells.findIndex((t) => t === 'รับเองที่สาขา (2)')
  expect(pickupHeader).toBeGreaterThan(cells.findIndex((t) => t.startsWith('BOAT PACKED')))
  expect(cells.findIndex((t) => t.startsWith('PICKUP WAITING'))).toBeGreaterThan(pickupHeader)
  expect(cells.findIndex((t) => t.startsWith('PICKUP DONE'))).toBeGreaterThan(pickupHeader)
  // a waiting pickup is not part of the "ยังไม่แพ็ค" boat queue
  expect(cells).not.toContain('ยังไม่แพ็ค (1)')
})

const lockedRows = () => [
  { id: '1', makro_order_no: 'PO-1', customer_name_en: 'OWES MONEY', island: 'payam', status: 'imported', boat_id: null, paper_box_count: 0, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '0811111111' },
  { id: '2', makro_order_no: 'PO-2', customer_name_en: 'ALL PAID', island: 'payam', status: 'imported', boat_id: null, paper_box_count: 0, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '0822222222' },
]
const OWES_KEY = 'phone:0811111111|name:OWES MONEY'
const lockOf = (o: Record<string, unknown>) => ({ locked: false, released: false, priorBills: [], total: 0, oldestDays: 0, ...o })

test('a customer owing an earlier bill moves to a red "do not pack" section', async () => {
  authRole.current = 'packer'
  vi.mocked(listOrdersForDay).mockResolvedValueOnce(lockedRows())
  getDayLocks.mockResolvedValueOnce(new Map([[OWES_KEY, lockOf({ locked: true, priorBills: [{}, {}], total: 900, oldestDays: 4 })]]))
  renderPage()
  expect(await screen.findByText('ค้างชำระ — ห้ามแพ็ค (1)')).toBeInTheDocument()
  expect(screen.getByText('ค้างชำระ 2 บิล · 4 วัน')).toBeInTheDocument()
  expect(screen.getByText('ยังไม่แพ็ค (1)')).toBeInTheDocument() // only ALL PAID
  expect(screen.queryByRole('button', { name: 'ปลดให้แพ็ค' })).not.toBeInTheDocument() // packer
})

test('a manager releases a locked customer for this delivery with a reason', async () => {
  authRole.current = 'manager'
  vi.mocked(listOrdersForDay).mockResolvedValueOnce(lockedRows())
  getDayLocks.mockResolvedValue(new Map([[OWES_KEY, lockOf({ locked: true, priorBills: [{}], total: 500, oldestDays: 2 })]]))
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'ปลดให้แพ็ค' }))
  await userEvent.type(screen.getByLabelText('เหตุผลที่ปลด'), 'โอนแล้ว')
  await userEvent.click(screen.getByRole('button', { name: 'ยืนยันปลด' }))
  expect(releaseCustomer).toHaveBeenCalledWith(
    expect.objectContaining({ customer_phone: '0811111111', customer_name_en: 'OWES MONEY' }),
    todayLocalISO(),
    'โอนแล้ว',
  )
  getDayLocks.mockResolvedValue(new Map())
})

test('a released customer is back in the normal queue with a "ปลดแล้ว" badge', async () => {
  authRole.current = 'packer'
  vi.mocked(listOrdersForDay).mockResolvedValueOnce(lockedRows())
  getDayLocks.mockResolvedValueOnce(new Map([[OWES_KEY, lockOf({ released: true, priorBills: [{}] })]]))
  renderPage()
  expect(await screen.findByText('ปลดแล้ว')).toBeInTheDocument()
  expect(screen.queryByText(/ค้างชำระ — ห้ามแพ็ค/)).not.toBeInTheDocument()
  expect(screen.getByText('ยังไม่แพ็ค (2)')).toBeInTheDocument()
})

test('sale reads the day (orders, progress, links to each order) without the buttons that write', async () => {
  authRole.current = 'sale'
  try {
    vi.mocked(getShipDayLinksSentAt).mockResolvedValueOnce(null)
    vi.mocked(listOrdersForDay).mockResolvedValueOnce(groupOrders())
    renderPage()
    await screen.findByText('SUNSET')
    expect(screen.getByRole('link', { name: 'PO-3' })).toBeInTheDocument()
    expect(screen.queryByText('ยังไม่ได้ส่งลิงก์ไลน์ให้ลูกค้าวันนี้')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ส่งลิงก์ไลน์เลย' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /พิมพ์สติ๊กเกอร์/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'แพ็ครวม' })).not.toBeInTheDocument()
  } finally {
    authRole.current = 'packer'
  }
})

test("Makro's picking shows on orders not packed yet, with a summary for the day", async () => {
  const o = (id: string, name: string, status: string, makro: string) => ({
    id, makro_order_no: `PO-${id}`, customer_name_en: name, island: 'payam', makro_order_status: makro, status,
    boat_id: null, paper_box_count: 0, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: `0${id}`,
  })
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    o('1', 'READY SHOP', 'imported', 'Ready for ship'),
    o('2', 'PICKING SHOP', 'imported', 'Picking and packing'),
    o('3', 'PACKED SHOP', 'packed', 'Delivered'),
  ])
  renderPage()
  const ready = (await screen.findByText('READY SHOP')).closest('tr') as HTMLElement
  expect(within(ready).getByText('จัดเสร็จแล้ว')).toHaveClass('badge-ok')
  const picking = screen.getByText('PICKING SHOP').closest('tr') as HTMLElement
  expect(within(picking).getByText('กำลังจัด')).toHaveClass('badge-warn')
  // once packed by the island team, Makro's picking no longer shows
  const packed = screen.getByText('PACKED SHOP').closest('tr') as HTMLElement
  expect(within(packed).queryByText(/จัดเสร็จแล้ว/)).not.toBeInTheDocument()
  expect(screen.getByLabelText('การจัดสินค้าของแม็คโคร')).toHaveTextContent(/ยังไม่แพ็ค 2 ออเดอร์ · จัดเสร็จแล้ว 1 · กำลังจัด 1/)
})

test("a customer's POs show how many Makro finished picking", async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce(
    groupOrders().map((x: any) => ({ ...x, status: 'imported', makro_order_status: x.id === '1' ? 'Ready for ship' : 'Picking and packing' })),
  )
  renderPage()
  const row = (await screen.findByText('2 PO')).closest('tr') as HTMLElement
  expect(within(row).getByText('จัดเสร็จแล้ว 1/2')).toHaveClass('badge-warn')
})

test('an order not packed yet carries no "นำเข้าแล้ว" badge (it is already under ยังไม่แพ็ค)', async () => {
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    { id: '1', makro_order_no: 'PO-1', customer_name_en: 'NEW SHOP', island: 'payam', status: 'imported', boat_id: null, paper_box_count: 0, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '01' },
    { id: '2', makro_order_no: 'PO-2', customer_name_en: 'DONE SHOP', island: 'payam', status: 'packed', boat_id: null, paper_box_count: 1, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: '02' },
  ])
  renderPage()
  const row = (await screen.findByText('NEW SHOP')).closest('tr') as HTMLElement
  expect(within(row).queryByText('นำเข้าแล้ว')).not.toBeInTheDocument()
  expect(within(screen.getByText('DONE SHOP').closest('tr') as HTMLElement).getByText('แพ็คแล้ว')).toBeInTheDocument()
})

test('combined orders (one customer, several POs) come first, then the single POs', async () => {
  const single = (id: string, name: string, phone: string) => ({
    id, makro_order_no: `PO-${id}`, customer_name_en: name, island: 'payam', status: 'imported',
    boat_id: null, paper_box_count: 0, foam_box_count: 0, piece_count: 0, outstanding_amount: 0, customer_phone: phone,
  })
  vi.mocked(listOrdersForDay).mockResolvedValueOnce([
    single('1', 'ALONE FIRST', '01'),
    single('2', 'TWIN SHOP', '09'),
    single('3', 'ALONE SECOND', '02'),
    single('4', 'TWIN SHOP', '09'),
  ])
  renderPage()
  await screen.findByText('2 PO')
  const order = ['2 PO', 'ALONE FIRST', 'ALONE SECOND'].map((t) => screen.getByText(t).closest('tr')!)
  expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})
