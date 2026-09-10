import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PackOrder from './PackOrder'

const getOrder = vi.fn()
const updateOrderStatus = vi.fn().mockResolvedValue(undefined)
const savePack = vi.fn().mockResolvedValue({ shortageValue: 0 })
const listPendingBackordersForOrder = vi.fn().mockResolvedValue([])
const markBackorderFulfilled = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/api/orders', () => ({
  getOrder: (...a: unknown[]) => getOrder(...a),
  updateOrderStatus: (...a: unknown[]) => updateOrderStatus(...a),
}))
vi.mock('../../lib/api/pack', () => ({
  savePack: (...a: unknown[]) => savePack(...a),
  computeShortageValue: () => 0,
}))
vi.mock('../../lib/api/backorders', () => ({
  listPendingBackordersForOrder: (...a: unknown[]) => listPendingBackordersForOrder(...a),
  markBackorderFulfilled: (...a: unknown[]) => markBackorderFulfilled(...a),
}))

const order = {
  id: 'ord1',
  makro_order_no: 'PO-1',
  customer_name_en: 'BLUE VIEW',
  paper_box_count: 0,
  foam_box_count: 0,
  order_items: [
    { id: 'i1', product_name: 'rice', qty_ordered: 2, unit_price: 100, status: 'ok' },
    { id: 'i2', product_name: 'oil', qty_ordered: 1, unit_price: 50, status: 'ok' },
  ],
}

beforeEach(() => {
  getOrder.mockReset().mockResolvedValue(order)
  savePack.mockClear()
  updateOrderStatus.mockClear()
  listPendingBackordersForOrder.mockReset().mockResolvedValue([])
  markBackorderFulfilled.mockClear()
})

const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={['/order/ord1/pack']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/order/:id/pack" element={<PackOrder />} />
      </Routes>
    </MemoryRouter>,
  )

test('marks an item short, records the box count, and calls savePack', async () => {
  renderPage()
  const shortToggle = await screen.findByLabelText('ของขาด rice')
  await userEvent.click(shortToggle)
  const paper = screen.getByLabelText(/ลังกระดาษ/)
  await userEvent.clear(paper)
  await userEvent.type(paper, '3')
  await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }))

  expect(savePack).toHaveBeenCalledTimes(1)
  const arg = savePack.mock.calls[0][0]
  expect(arg.orderId).toBe('ord1')
  expect(arg.paperCount).toBe(3)
  expect(arg.items[0]).toEqual({ id: 'i1', status: 'short', qtyShipped: 0 })
  expect(arg.items[1]).toEqual({ id: 'i2', status: 'ok', qtyShipped: 1 })
})

test('"บันทึก + แพ็คเสร็จ" saves first, then marks the order packed', async () => {
  renderPage()
  await screen.findByLabelText('ของขาด rice')
  await userEvent.click(screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' }))

  expect(savePack).toHaveBeenCalledTimes(1)
  expect(updateOrderStatus).toHaveBeenCalledWith('ord1', 'packed')
  expect(savePack.mock.invocationCallOrder[0]).toBeLessThan(
    updateOrderStatus.mock.invocationCallOrder[0],
  )
})

test('shows carry-over backorders and fulfils one on "ส่งแล้ว"', async () => {
  listPendingBackordersForOrder.mockResolvedValueOnce([
    {
      id: 'b1',
      source_order_id: 's1',
      reason: 'shortage',
      product_name: 'sugar',
      qty: 4,
      target_ship_date: '2026-10-01',
      target_order_id: 'ord1',
      status: 'pending',
    },
  ])
  renderPage()
  expect(await screen.findByText('ของค้างส่งจากออเดอร์ก่อนหน้า')).toBeInTheDocument()
  expect(screen.getByText('sugar x4')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'ส่งแล้ว' }))
  expect(markBackorderFulfilled).toHaveBeenCalledWith('b1')
  expect(screen.queryByText('sugar x4')).not.toBeInTheDocument()
})
