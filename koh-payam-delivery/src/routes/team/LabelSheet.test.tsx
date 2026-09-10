import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import LabelSheet from './LabelSheet'

const getOrder = vi.fn()
vi.mock('../../lib/api/orders', () => ({
  getOrder: (...a: unknown[]) => getOrder(...a),
}))

beforeEach(() => {
  getOrder.mockReset().mockResolvedValue({
    id: 'ord1',
    makro_order_no: 'PO-1',
    customer_name_en: 'BLUE VIEW',
    ship_date: '2026-10-01',
    paper_box_count: 3,
    foam_box_count: 2,
  })
})

const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={['/order/ord1/label']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/order/:id/label" element={<LabelSheet />} />
      </Routes>
    </MemoryRouter>,
  )

test('renders the customer name and per-box sequence lines for paper and foam', async () => {
  renderPage()
  expect(await screen.findByText('BLUE VIEW')).toBeInTheDocument()
  expect(screen.getByText(/1\/3/)).toBeInTheDocument()
  expect(screen.getByText(/3\/3/)).toBeInTheDocument()
  expect(screen.getByText(/1\/2/)).toBeInTheDocument()
  expect(screen.getByText(/2\/2/)).toBeInTheDocument()
})

test('the print button calls window.print', async () => {
  const print = vi.fn()
  vi.stubGlobal('print', print)
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'สั่งพิมพ์' }))
  expect(print).toHaveBeenCalled()
  vi.unstubAllGlobals()
})
