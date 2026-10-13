import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ClaimsQueue from './ClaimsQueue'

const listClaims = vi.fn()
vi.mock('../../lib/api/claims', () => ({
  listClaims: (...a: unknown[]) => listClaims(...a),
}))

const listUnmatchedBackorders = vi.fn()
vi.mock('../../lib/api/backorders', async (importOriginal) => ({
  backorderQty: (await importOriginal<typeof import('../../lib/api/backorders')>()).backorderQty,
  listUnmatchedBackorders: (...a: unknown[]) => listUnmatchedBackorders(...a),
}))

const H = 60 * 60 * 1000
const hoursAgo = (n: number) => new Date(Date.now() - n * H).toISOString()
const daysAgo = (n: number) => hoursAgo(n * 24)

const claim = (o: Record<string, unknown>) => ({
  order_id: 'o',
  type: 'damaged',
  itemCount: 1,
  status: 'open',
  resolution: null,
  refund_amount: 0,
  deadline_at: hoursAgo(-10),
  ...o,
})

const rows = [
  claim({ id: 'c-fresh', makro_order_no: 'PO-FRESH', customer_name_en: 'SUNSET', type: 'missing_in_box', itemCount: 3, created_at: hoursAgo(1.5) }),
  claim({ id: 'c-late', makro_order_no: 'PO-LATE', customer_name_en: 'BLUE VIEW', created_at: hoursAgo(30) }),
  claim({ id: 'c-refund', makro_order_no: 'PO-REFUND', customer_name_en: 'CORAL', status: 'closed', resolution: 'refund', created_at: daysAgo(3) }),
  claim({ id: 'c-resend', makro_order_no: 'PO-RESEND', customer_name_en: 'MOON BAR', status: 'approved', resolution: 'resend_next_day', created_at: daysAgo(2) }),
  claim({ id: 'c-no', makro_order_no: 'PO-NO', customer_name_en: 'REEF', status: 'rejected', created_at: daysAgo(4) }),
]

const unmatched = [
  { id: 'ub-old', customerName: 'PALM BEACH', productName: 'rice', qty: 2, createdAt: daysAgo(10) },
  { id: 'ub-fresh', customerName: 'REEF LODGE', productName: 'fish sauce', qty: 1, createdAt: daysAgo(1) },
]

beforeEach(() => {
  listClaims.mockReset().mockResolvedValue(rows)
  listUnmatchedBackorders.mockReset().mockResolvedValue(unmatched)
})

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/claims']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/claims" element={<ClaimsQueue />} />
        <Route path="/claims/:id" element={<div>claim detail</div>} />
      </Routes>
    </MemoryRouter>,
  )

const claimLinks = () => screen.getAllByRole('link')

test('summary on top: waiting for a decision, past the 24h reply time, backorders to match', async () => {
  renderPage()
  const summary = await screen.findByRole('region', { name: 'สรุปคิวเคลม' })
  expect(within(summary).getByText('รอตัดสิน').closest('div')).toHaveTextContent('2')
  expect(within(summary).getByText('เกินเวลาตอบ').closest('div')).toHaveTextContent('1')
  expect(within(summary).getByText('ค้างส่งชดเชย').closest('div')).toHaveTextContent('2')
})

test('opens on the claims waiting for a decision, oldest first, each row a link to the claim', async () => {
  renderPage()
  await screen.findByText('BLUE VIEW')
  expect(screen.getByRole('tab', { name: /รอตัดสิน/ })).toHaveAttribute('aria-selected', 'true')
  const links = claimLinks()
  expect(links).toHaveLength(2)
  expect(links[0]).toHaveTextContent('BLUE VIEW') // reported 30h ago: late, first
  expect(links[0]).toHaveTextContent('เกินมา 6 ชม.')
  expect(links[0]).toHaveAttribute('href', '/claims/c-late')
  expect(links[1]).toHaveTextContent('SUNSET')
  expect(links[1]).toHaveTextContent('เหลือ 22 ชม.')
  expect(links[1]).toHaveTextContent('ของขาดในกล่อง')
  expect(links[1]).toHaveTextContent('3 รายการ')
  expect(links[1]).toHaveTextContent('PO-FRESH')
  expect(screen.queryByText('CORAL')).not.toBeInTheDocument()
})

test('tabs show their counts, and statuses read in Thai', async () => {
  renderPage()
  await screen.findByText('BLUE VIEW')
  expect(screen.getByRole('tab', { name: /อนุมัติแล้ว/ })).toHaveTextContent('2')
  await userEvent.click(screen.getByRole('tab', { name: /อนุมัติแล้ว/ }))
  expect(claimLinks().map((l) => l.textContent)).toEqual([
    expect.stringContaining('อนุมัติ · รอส่งชดเชย'),
    expect.stringContaining('อนุมัติ · คืนเงิน'),
  ])
  await userEvent.click(screen.getByRole('tab', { name: /ปฏิเสธ/ }))
  expect(claimLinks()).toHaveLength(1)
  expect(claimLinks()[0]).toHaveTextContent('ปฏิเสธ')
  await userEvent.click(screen.getByRole('tab', { name: /ทั้งหมด/ }))
  expect(claimLinks()).toHaveLength(5)
  expect(listClaims).toHaveBeenCalledTimes(1) // tabs filter what is already loaded
})

test('the backorders tab lists unmatched resends and flags ones waiting over 7 days', async () => {
  renderPage()
  await screen.findByText('BLUE VIEW')
  await userEvent.click(screen.getByRole('tab', { name: /ค้างส่งชดเชย/ }))
  const old = screen.getByText('PALM BEACH').closest('tr')!
  const fresh = screen.getByText('REEF LODGE').closest('tr')!
  expect(old).toHaveTextContent('rice')
  expect(old).toHaveTextContent('10 วัน')
  expect(old.className).toContain('bg-danger-soft')
  expect(fresh.className).not.toContain('bg-danger-soft')
})

test('an empty tab says so', async () => {
  listClaims.mockResolvedValue(rows.filter((r) => r.status !== 'open'))
  renderPage()
  expect(await screen.findByText('ไม่มีเคลมรอตัดสิน')).toBeInTheDocument()
})

test('a claims failure shows a Thai error but keeps the backorders tab working', async () => {
  listClaims.mockRejectedValue(new Error('x'))
  renderPage()
  expect(await screen.findByText('โหลดคิวเคลมไม่สำเร็จ')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('tab', { name: /ค้างส่งชดเชย/ }))
  expect(await screen.findByText('PALM BEACH')).toBeInTheDocument()
})

test('a backorders failure does not blank the claims', async () => {
  listUnmatchedBackorders.mockRejectedValue(new Error('x'))
  renderPage()
  expect(await screen.findByText('BLUE VIEW')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('tab', { name: /ค้างส่งชดเชย/ }))
  expect(screen.getByText('โหลดรายการค้างส่งที่ยังจับคู่ไม่สำเร็จ')).toBeInTheDocument()
})

test('the late count turns red only when something is past the reply time', async () => {
  renderPage()
  const summary = await screen.findByRole('region', { name: 'สรุปคิวเคลม' })
  expect(within(summary).getByText('เกินเวลาตอบ').closest('div')).toHaveClass('bg-danger-soft')
})

test('nothing late, no red', async () => {
  listClaims.mockResolvedValue(rows.filter((r) => (r as { id?: string }).id !== 'c-late'))
  renderPage()
  const summary = await screen.findByRole('region', { name: 'สรุปคิวเคลม' })
  expect(within(summary).getByText('เกินเวลาตอบ').closest('div')).not.toHaveClass('bg-danger-soft')
})
