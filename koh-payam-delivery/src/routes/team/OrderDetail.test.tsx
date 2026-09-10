import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import OrderDetail from './OrderDetail'

const getOrder = vi.fn()
const updateOrderStatus = vi.fn().mockResolvedValue(undefined)
const regenTokenLink = vi.fn().mockResolvedValue('o_new')
const listRelatedBackordersForOrder = vi.fn().mockResolvedValue([])

vi.mock('../../lib/api/orders', () => ({
  getOrder: (...a: unknown[]) => getOrder(...a),
  updateOrderStatus: (...a: unknown[]) => updateOrderStatus(...a),
  regenTokenLink: (...a: unknown[]) => regenTokenLink(...a),
}))
vi.mock('../../lib/api/backorders', () => ({
  listRelatedBackordersForOrder: (...a: unknown[]) => listRelatedBackordersForOrder(...a),
}))

const order = {
  id: 'ord1',
  makro_order_no: 'PO-1',
  customer_name_en: 'BLUE VIEW',
  ship_date: '2026-10-01',
  status: 'imported',
  link_token: 'o_test123',
  sub_district: 'เกาะพยาม',
  order_items: [
    {
      id: 'i1',
      product_name: 'rice',
      qty_ordered: 2,
      qty_shipped: 2,
      status: 'ok',
      item_remark: '',
    },
  ],
  claims: [],
  evidence_photos: [],
}

beforeEach(() => {
  getOrder.mockReset().mockResolvedValue(order)
  updateOrderStatus.mockClear()
  regenTokenLink.mockClear().mockResolvedValue('o_new')
  listRelatedBackordersForOrder.mockReset().mockResolvedValue([])
  Object.assign(navigator, { clipboard: { writeText: vi.fn() } })
})

const renderPage = () =>
  render(
    <MemoryRouter
      initialEntries={['/order/ord1']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/order/:id" element={<OrderDetail />} />
        <Route path="/order/:id/pack" element={<div>pack page</div>} />
      </Routes>
    </MemoryRouter>,
  )

test('shows the customer link and copies it to the clipboard', async () => {
  renderPage()
  const link = `${location.origin}/o/o_test123`
  expect(await screen.findByText(link)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'คัดลอก' }))
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith(link)
})

test('"สร้างลิงก์ใหม่" regenerates the token then refetches', async () => {
  renderPage()
  await screen.findByText(`${location.origin}/o/o_test123`)
  getOrder.mockResolvedValueOnce({ ...order, link_token: 'o_new' })
  await userEvent.click(screen.getByRole('button', { name: 'สร้างลิงก์ใหม่' }))
  expect(regenTokenLink).toHaveBeenCalledWith('ord1')
  expect(await screen.findByText(`${location.origin}/o/o_new`)).toBeInTheDocument()
})

test('renders a Thai error when the order fails to load', async () => {
  getOrder.mockReset().mockRejectedValueOnce(new Error('nope'))
  renderPage()
  expect(await screen.findByText('โหลดออเดอร์ไม่สำเร็จ')).toBeInTheDocument()
})

test('blocks the pier transition until a boat and an evidence photo exist', async () => {
  getOrder
    .mockReset()
    .mockResolvedValue({ ...order, status: 'packed', boat_id: null, evidence_photos: [] })
  renderPage()
  const btn = await screen.findByRole('button', { name: 'เปลี่ยนเป็น ถึงท่าเรือ' })
  expect(btn).toBeDisabled()
  expect(
    screen.getByText('ต้องเลือกเรือและถ่ายรูปหลักฐานที่หน้า "ที่ท่าเรือ" ก่อน'),
  ).toBeInTheDocument()
})

test('allows the pier transition once a boat and handoff photo are present', async () => {
  getOrder.mockReset().mockResolvedValue({
    ...order,
    status: 'packed',
    boat_id: '1',
    evidence_photos: [{ id: 'p1', r2_key: 'evidence/ord1/a.jpg', stage: 'handoff' }],
  })
  renderPage()
  const btn = await screen.findByRole('button', { name: 'เปลี่ยนเป็น ถึงท่าเรือ' })
  expect(btn).toBeEnabled()
  expect(
    screen.queryByText('ต้องเลือกเรือและถ่ายรูปหลักฐานที่หน้า "ที่ท่าเรือ" ก่อน'),
  ).not.toBeInTheDocument()
})

test('a pack-stage photo alone does NOT open the pier gate', async () => {
  getOrder.mockReset().mockResolvedValue({
    ...order,
    status: 'packed',
    boat_id: '1',
    evidence_photos: [{ id: 'p1', r2_key: 'evidence/ord1/pack.jpg', stage: 'pack' }],
  })
  renderPage()
  const btn = await screen.findByRole('button', { name: 'เปลี่ยนเป็น ถึงท่าเรือ' })
  expect(btn).toBeDisabled()
  expect(
    screen.getByText('ต้องเลือกเรือและถ่ายรูปหลักฐานที่หน้า "ที่ท่าเรือ" ก่อน'),
  ).toBeInTheDocument()
})
