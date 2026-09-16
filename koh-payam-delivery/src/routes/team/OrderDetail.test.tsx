import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import OrderDetail from './OrderDetail'

const getOrder = vi.fn()
const regenTokenLink = vi.fn().mockResolvedValue('o_new')
const deleteOrder = vi.fn().mockResolvedValue(undefined)
const listRelatedBackordersForOrder = vi.fn().mockResolvedValue([])
const useAuthMock = vi.fn()

vi.mock('../../lib/api/orders', () => ({
  getOrder: (...a: unknown[]) => getOrder(...a),
  regenTokenLink: (...a: unknown[]) => regenTokenLink(...a),
  deleteOrder: (...a: unknown[]) => deleteOrder(...a),
}))
vi.mock('../../lib/api/backorders', () => ({
  listRelatedBackordersForOrder: (...a: unknown[]) => listRelatedBackordersForOrder(...a),
}))
vi.mock('../../lib/auth', () => ({
  useAuth: () => useAuthMock(),
}))

const order = {
  id: 'ord1',
  makro_order_no: 'PO-1',
  customer_name_en: 'BLUE VIEW',
  ship_date: '2026-10-01',
  status: 'imported',
  link_token: 'o_test123',
  sub_district: 'เกาะพยาม',
  paper_box_count: 2,
  foam_box_count: 1,
  piece_count: 3,
  order_items: [
    {
      id: 'i1',
      product_name: 'rice',
      makro_item_id: '100001',
      qty_ordered: 2,
      qty_shipped: 2,
      status: 'ok',
      item_remark: '',
      is_fresh: null,
      packed: false,
    },
  ],
  claims: [],
  evidence_photos: [],
}

beforeEach(() => {
  getOrder.mockReset().mockResolvedValue(order)
  regenTokenLink.mockClear().mockResolvedValue('o_new')
  deleteOrder.mockClear().mockResolvedValue(undefined)
  listRelatedBackordersForOrder.mockReset().mockResolvedValue([])
  useAuthMock.mockReset().mockReturnValue({ profile: { id: 'u1', name: 'ผจก', role: 'manager' } })
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
        <Route path="/" element={<div>home page</div>} />
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

test('the manual status-advance button is gone -- แพ็คของ / ใบเขียนหน้าลัง are the only big action buttons, colored green/amber', async () => {
  renderPage()
  await screen.findByText(order.customer_name_en, { exact: false })
  expect(screen.queryByText(/^เปลี่ยนเป็น /)).not.toBeInTheDocument()

  const pack = screen.getByRole('link', { name: 'แพ็คของ' })
  expect(pack).toHaveAttribute('href', '/order/ord1/pack')
  expect(pack.className).toContain('btn-ok')
  expect(pack.className).toContain('text-lg')

  const label = screen.getByRole('link', { name: 'ใบเขียนหน้าลัง' })
  expect(label).toHaveAttribute('href', '/order/ord1/label')
  expect(label.className).toContain('btn-warn')
  expect(label.className).toContain('text-lg')
})

test('shows the box/piece count summary line', async () => {
  renderPage()
  expect(
    await screen.findByText('ลังกระดาษ 2 · ลังโฟม 1 · ชิ้น 3 · รวม 6'),
  ).toBeInTheDocument()
})

test('shows the makro item code per line item', async () => {
  renderPage()
  expect(await screen.findByText('rice')).toBeInTheDocument()
  expect(screen.getByText('100001')).toBeInTheDocument()
})

test('shows a disabled, read-only pack-tick checkbox per item reflecting its saved "packed" value', async () => {
  getOrder.mockReset().mockResolvedValue({
    ...order,
    order_items: [{ ...order.order_items[0], packed: true }],
  })
  renderPage()
  await screen.findByText('rice')
  const cb = screen.getByRole('checkbox') as HTMLInputElement
  expect(cb.checked).toBe(true)
  expect(cb).toBeDisabled()
})

test('an order with no Dept data on any item (is_fresh null, or the field simply absent) stays flat -- no ของสด/ของแห้ง headers', async () => {
  renderPage()
  await screen.findByText('rice')
  expect(screen.queryByText(/ของสด/)).not.toBeInTheDocument()
  expect(screen.queryByText(/ของแห้ง/)).not.toBeInTheDocument()
})

test('splits items under ของสด/ของแห้ง headers once the order carries Dept data', async () => {
  getOrder.mockReset().mockResolvedValue({
    ...order,
    order_items: [
      { ...order.order_items[0], id: 'i1', product_name: 'rice', is_fresh: false },
      { ...order.order_items[0], id: 'i2', product_name: 'tomato', is_fresh: true },
    ],
  })
  renderPage()
  await screen.findByText('rice')
  expect(screen.getByText('ของสด (1)')).toBeInTheDocument()
  expect(screen.getByText('ของแห้ง (1)')).toBeInTheDocument()
  expect(screen.getByText('tomato')).toBeInTheDocument()
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

test('shows the collect-cash alert when outstanding_amount > 0', async () => {
  getOrder.mockReset().mockResolvedValue({
    ...order,
    outstanding_amount: 6172.5,
    payment_method: 'Pay On Delivery',
  })
  renderPage()
  expect(
    await screen.findByText('เก็บเงินปลายทาง ฿6,172.50 (Pay On Delivery)'),
  ).toBeInTheDocument()
})

test('hides the collect-cash alert when outstanding_amount is 0 or null', async () => {
  getOrder.mockReset().mockResolvedValue({ ...order, outstanding_amount: 0, payment_method: null })
  renderPage()
  await screen.findByText(order.customer_name_en, { exact: false })
  expect(screen.queryByText(/เก็บเงินปลายทาง/)).not.toBeInTheDocument()
})

test('a non-manager does not see the delete button', async () => {
  useAuthMock.mockReset().mockReturnValue({ profile: { id: 'u1', name: 'แพ็ค', role: 'packer' } })
  renderPage()
  await screen.findByText(order.customer_name_en, { exact: false })
  expect(screen.queryByRole('button', { name: 'ลบออเดอร์นี้' })).not.toBeInTheDocument()
})

test('a manager sees the delete button', async () => {
  renderPage()
  expect(await screen.findByRole('button', { name: 'ลบออเดอร์นี้' })).toBeInTheDocument()
})

test('the confirm-delete button stays disabled until the order number is typed exactly', async () => {
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'ลบออเดอร์นี้' }))
  const confirmBtn = screen.getByRole('button', { name: 'ลบถาวร' })
  expect(confirmBtn).toBeDisabled()

  const input = screen.getByRole('textbox')
  await userEvent.type(input, 'PO-1 ')
  expect(confirmBtn).toBeDisabled()

  await userEvent.clear(input)
  await userEvent.type(input, 'PO-1')
  expect(confirmBtn).toBeEnabled()
})

test('confirming the delete calls deleteOrder with the snapshot then navigates home', async () => {
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'ลบออเดอร์นี้' }))
  await userEvent.type(screen.getByRole('textbox'), 'PO-1')
  await userEvent.click(screen.getByRole('button', { name: 'ลบถาวร' }))

  expect(deleteOrder).toHaveBeenCalledWith('ord1', {
    makroOrderNo: 'PO-1',
    customerNameEn: 'BLUE VIEW',
    status: 'imported',
    shipDate: '2026-10-01',
  })
  expect(await screen.findByText('home page')).toBeInTheDocument()
})

test('a failed delete shows the Thai error and stays on the page', async () => {
  deleteOrder.mockReset().mockRejectedValue(new Error('ลบออเดอร์ไม่สำเร็จ: boom'))
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'ลบออเดอร์นี้' }))
  await userEvent.type(screen.getByRole('textbox'), 'PO-1')
  await userEvent.click(screen.getByRole('button', { name: 'ลบถาวร' }))

  expect(await screen.findByText('ลบออเดอร์ไม่สำเร็จ: boom')).toBeInTheDocument()
  expect(screen.queryByText('home page')).not.toBeInTheDocument()
})

test('shows a distinctly stronger warning when the order is already shipped', async () => {
  getOrder.mockReset().mockResolvedValue({ ...order, status: 'shipped' })
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'ลบออเดอร์นี้' }))
  expect(screen.getByText(/ส่งขึ้นเรือแล้ว/)).toBeInTheDocument()
})

test('does not show the shipped warning for a non-shipped order', async () => {
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'ลบออเดอร์นี้' }))
  expect(screen.queryByText(/ส่งขึ้นเรือแล้ว/)).not.toBeInTheDocument()
  expect(screen.getByText(/พิมพ์เลขออเดอร์ PO-1 เพื่อยืนยันการลบถาวร/)).toBeInTheDocument()
})
