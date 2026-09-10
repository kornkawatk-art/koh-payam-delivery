import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import ClaimsQueue from './ClaimsQueue'

const listClaims = vi.fn()
vi.mock('../../lib/api/claims', () => ({
  listClaims: (...a: unknown[]) => listClaims(...a),
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
    qty: 2,
    status: 'open',
    deadline_at: past,
    created_at: past,
  },
  {
    id: 'c2',
    order_id: 'o2',
    makro_order_no: 'PO-FRESH',
    customer_name_en: 'SUNSET',
    type: 'missing',
    qty: 1,
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
    qty: 1,
    status: 'approved',
    deadline_at: past,
    created_at: past,
  },
]

beforeEach(() => {
  listClaims.mockReset().mockResolvedValue(rows)
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
