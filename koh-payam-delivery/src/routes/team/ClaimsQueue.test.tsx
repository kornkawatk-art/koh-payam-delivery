import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ClaimsQueue from './ClaimsQueue'

const listClaims = vi.fn()
vi.mock('../../lib/api/claims', () => ({
  listClaims: (...a: unknown[]) => listClaims(...a),
}))

const listUnmatchedBackorders = vi.fn()
vi.mock('../../lib/api/backorders', () => ({
  listUnmatchedBackorders: (...a: unknown[]) => listUnmatchedBackorders(...a),
}))

const past = '2000-01-01T00:00:00.000Z'
const future = '2999-01-01T00:00:00.000Z'

const rows = [
  {
    id: 'c1',
    order_id: 'o1',
    makro_order_no: 'PO-OVERDUE',
    customer_name_en: 'BLUE VIEW',
    type: 'damaged',
    itemCount: 1,
    status: 'open',
    deadline_at: past,
    created_at: past,
  },
  {
    id: 'c2',
    order_id: 'o2',
    makro_order_no: 'PO-FRESH',
    customer_name_en: 'SUNSET',
    type: 'missing_in_box',
    itemCount: 3,
    status: 'open',
    deadline_at: future,
    created_at: past,
  },
  {
    id: 'c3',
    order_id: 'o3',
    makro_order_no: 'PO-DONE',
    customer_name_en: 'CORAL',
    type: 'damaged',
    itemCount: 1,
    status: 'approved',
    deadline_at: past,
    created_at: past,
  },
]

beforeEach(() => {
  listClaims.mockReset().mockResolvedValue(rows)
  listUnmatchedBackorders.mockReset().mockResolvedValue([])
})

const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={['/claims']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/claims" element={<ClaimsQueue />} />
        <Route path="/claims/:id" element={<div>claim detail</div>} />
      </Routes>
    </MemoryRouter>,
  )

test('lists claims and links each row to its detail page', async () => {
  renderPage()
  const link = await screen.findByRole('link', { name: 'PO-OVERDUE' })
  expect(link).toHaveAttribute('href', '/claims/c1')
  expect(listClaims).toHaveBeenCalledWith({})
})

test('renders the item-count column as "N รายการ" per row', async () => {
  renderPage()
  await screen.findByText('PO-OVERDUE')
  expect(screen.getByText('จำนวนรายการ')).toBeInTheDocument()
  expect(screen.getAllByText('1 รายการ')).toHaveLength(2)
  expect(screen.getByText('3 รายการ')).toBeInTheDocument()
})

test('highlights an open row whose deadline has already passed', async () => {
  renderPage()
  const overdue = (await screen.findByText('PO-OVERDUE')).closest('tr')
  const fresh = screen.getByText('PO-FRESH').closest('tr')
  const done = screen.getByText('PO-DONE').closest('tr')
  expect(overdue?.className).toContain('bg-red-50')
  expect(fresh?.className).not.toContain('bg-red-50')
  expect(done?.className).not.toContain('bg-red-50')
})

test('changing the filter refetches with the chosen status', async () => {
  renderPage()
  await screen.findByText('PO-OVERDUE')
  await userEvent.click(screen.getByRole('button', { name: 'เปิด' }))
  expect(listClaims).toHaveBeenLastCalledWith({ status: 'open' })
  await userEvent.click(screen.getByRole('button', { name: 'อนุมัติ' }))
  expect(listClaims).toHaveBeenLastCalledWith({ status: 'approved' })
  await userEvent.click(screen.getByRole('button', { name: 'ทั้งหมด' }))
  expect(listClaims).toHaveBeenLastCalledWith({})
})

test('shows a Thai error when the queue fails to load', async () => {
  listClaims.mockReset().mockRejectedValueOnce(new Error('nope'))
  renderPage()
  expect(await screen.findByText('โหลดคิวเคลมไม่สำเร็จ')).toBeInTheDocument()
})

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()

const unmatched = [
  {
    id: 'ub-old',
    customerName: 'PALM BEACH',
    productName: 'rice',
    qty: 2,
    reason: 'shortage' as const,
    createdAt: daysAgo(10),
  },
  {
    id: 'ub-fresh',
    customerName: 'REEF LODGE',
    productName: 'fish sauce',
    qty: 1,
    reason: 'claim_resend' as const,
    createdAt: daysAgo(1),
  },
]

test('renders every unmatched backorder row with customer/product/qty/reason label', async () => {
  listUnmatchedBackorders.mockReset().mockResolvedValue(unmatched)
  renderPage()
  await screen.findByText('PALM BEACH')
  expect(screen.getByText('rice x2')).toBeInTheDocument()
  expect(screen.getByText('ของขาด')).toBeInTheDocument()
  expect(screen.getByText('REEF LODGE')).toBeInTheDocument()
  expect(screen.getByText('fish sauce x1')).toBeInTheDocument()
  expect(screen.getByText('ส่งชดเชยวันถัดไป')).toBeInTheDocument()
})

test('highlights an unmatched backorder waiting more than 7 days, not one waiting less', async () => {
  listUnmatchedBackorders.mockReset().mockResolvedValue(unmatched)
  renderPage()
  const old = (await screen.findByText('PALM BEACH')).closest('tr')
  const fresh = screen.getByText('REEF LODGE').closest('tr')
  expect(old?.className).toContain('bg-red-50')
  expect(fresh?.className).not.toContain('bg-red-50')
})

test('shows the empty state when there are zero unmatched backorders', async () => {
  listUnmatchedBackorders.mockReset().mockResolvedValue([])
  renderPage()
  expect(
    await screen.findByText('ไม่มีรายการค้างส่งที่ยังจับคู่ไม่สำเร็จ'),
  ).toBeInTheDocument()
})

test('a failure loading unmatched backorders does not blank the claims table', async () => {
  listUnmatchedBackorders.mockReset().mockRejectedValueOnce(new Error('nope'))
  renderPage()
  await screen.findByText('PO-OVERDUE')
  expect(
    await screen.findByText('โหลดรายการค้างส่งที่ยังจับคู่ไม่สำเร็จ'),
  ).toBeInTheDocument()
})

test('a failure loading claims does not blank the unmatched backorders table', async () => {
  listClaims.mockReset().mockRejectedValueOnce(new Error('nope'))
  listUnmatchedBackorders.mockReset().mockResolvedValue(unmatched)
  renderPage()
  await screen.findByText('โหลดคิวเคลมไม่สำเร็จ')
  expect(await screen.findByText('PALM BEACH')).toBeInTheDocument()
})
