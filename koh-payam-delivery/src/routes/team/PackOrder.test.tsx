import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PackOrder from './PackOrder'

const getOrder = vi.fn()
const updateOrderStatus = vi.fn().mockResolvedValue(undefined)
const savePack = vi.fn().mockResolvedValue(undefined)
const listPendingBackordersForOrder = vi.fn().mockResolvedValue([])
const markBackorderFulfilled = vi.fn().mockResolvedValue(undefined)
const attachEvidencePhoto = vi.fn().mockResolvedValue(undefined)

vi.mock('../../lib/api/orders', () => ({
  getOrder: (...a: unknown[]) => getOrder(...a),
  updateOrderStatus: (...a: unknown[]) => updateOrderStatus(...a),
}))
vi.mock('../../lib/api/pack', () => ({
  savePack: (...a: unknown[]) => savePack(...a),
}))
vi.mock('../../lib/api/photos', () => ({
  attachEvidencePhoto: (...a: unknown[]) => attachEvidencePhoto(...a),
}))
vi.mock('../../components/PhotoCapture', () => ({
  default: ({ onUploaded }: { onUploaded: (k: string) => void }) => (
    <button onClick={() => onUploaded('evidence/ord1/key-1.jpg')}>mock-upload</button>
  ),
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
    {
      id: 'i1',
      product_name: 'rice',
      qty_ordered: 2,
      qty_shipped: 1.5,
      item_remark: 'แยกถุง',
      status: 'short',
    },
    {
      id: 'i2',
      product_name: 'oil',
      qty_ordered: 1,
      qty_shipped: 1,
      item_remark: '',
      status: 'ok',
    },
  ],
}

beforeEach(() => {
  getOrder.mockReset().mockResolvedValue(order)
  savePack.mockClear()
  updateOrderStatus.mockClear()
  attachEvidencePhoto.mockClear()
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

test('renders the makro items read-only (ordered / shipped / short badge / remark, no inputs)', async () => {
  renderPage()
  expect(await screen.findByText('rice')).toBeInTheDocument()
  // shipped quantity from the file is shown
  expect(screen.getByText('1.5')).toBeInTheDocument()
  // short line carries the "ขาด" badge, ok line does not
  expect(screen.getByText('ขาด')).toBeInTheDocument()
  expect(screen.getByText('แยกถุง')).toBeInTheDocument()
  // no per-item editing controls
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  expect(screen.queryByLabelText(/ของขาด/)).not.toBeInTheDocument()
})

test('"บันทึก" records the box count via savePack', async () => {
  renderPage()
  await screen.findByText('rice')
  const paper = screen.getByLabelText(/ลังกระดาษ/)
  await userEvent.clear(paper)
  await userEvent.type(paper, '3')
  await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }))

  expect(savePack).toHaveBeenCalledTimes(1)
  expect(savePack.mock.calls[0][0]).toEqual({ orderId: 'ord1', paperCount: 3, foamCount: 0 })
  expect(updateOrderStatus).not.toHaveBeenCalled()
})

const satisfyPackGate = async () => {
  const paper = screen.getByLabelText(/ลังกระดาษ/)
  await userEvent.clear(paper)
  await userEvent.type(paper, '2')
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() =>
    expect(attachEvidencePhoto).toHaveBeenCalledWith('ord1', 'evidence/ord1/key-1.jpg', {
      stage: 'pack',
    }),
  )
}

test('"บันทึก + แพ็คเสร็จ" is gated on a pack photo AND at least one box', async () => {
  renderPage()
  await screen.findByText('rice')
  const packBtn = screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' })
  expect(packBtn).toBeDisabled()
  expect(
    screen.getByText(
      'ต้องถ่ายรูปลังที่แพ็คเสร็จอย่างน้อย 1 รูป และกรอกจำนวนลังอย่างน้อย 1 ลัง',
    ),
  ).toBeInTheDocument()

  // a box count alone does not open the gate
  const paper = screen.getByLabelText(/ลังกระดาษ/)
  await userEvent.clear(paper)
  await userEvent.type(paper, '2')
  expect(packBtn).toBeDisabled()

  // a pack photo as well opens it
  await userEvent.click(screen.getByRole('button', { name: 'mock-upload' }))
  await waitFor(() => expect(packBtn).toBeEnabled())
  expect(
    screen.queryByText(
      'ต้องถ่ายรูปลังที่แพ็คเสร็จอย่างน้อย 1 รูป และกรอกจำนวนลังอย่างน้อย 1 ลัง',
    ),
  ).not.toBeInTheDocument()

  // plain "บันทึก" is never gated by photos/boxes
  expect(screen.getByRole('button', { name: 'บันทึก' })).toBeEnabled()
})

test('a revisit seeds the pack-photo count from existing stage:"pack" photos', async () => {
  getOrder.mockReset().mockResolvedValue({
    ...order,
    paper_box_count: 1,
    evidence_photos: [{ id: 'e1', r2_key: 'evidence/ord1/a.jpg', stage: 'pack' }],
  })
  renderPage()
  await screen.findByText('rice')
  expect(screen.getByRole('button', { name: 'บันทึก + แพ็คเสร็จ' })).toBeEnabled()
})

test('"บันทึก + แพ็คเสร็จ" saves first, then marks the order packed', async () => {
  renderPage()
  await screen.findByText('rice')
  await satisfyPackGate()
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
