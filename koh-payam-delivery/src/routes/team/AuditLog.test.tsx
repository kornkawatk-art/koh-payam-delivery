import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import AuditLog from './AuditLog'

const listAuditLogs = vi.fn()
vi.mock('../../lib/api/auditLogs', () => ({
  listAuditLogs: (...a: unknown[]) => listAuditLogs(...a),
}))

const H = 60 * 60 * 1000
const today = new Date()
today.setHours(10, 30, 0, 0)
const yesterday = new Date(today.getTime() - 24 * H)

const row = (o: Record<string, unknown>) => ({
  createdAt: today.toISOString(),
  action: 'regen_link',
  category: 'order',
  actor: 'สมชาย',
  link: null,
  message: 'x',
  text: 'x',
  ...o,
})

const rows = [
  row({ id: 1, text: 'สร้างลิงก์ลูกค้าใหม่ให้ออเดอร์ PO-1', link: '/order/o1' }),
  row({ id: 2, category: 'claim', actor: 'ลูกค้า', text: 'ลูกค้ายื่นเคลม — ออเดอร์ PO-2', link: '/claims/c2' }),
  row({ id: 3, category: 'foam', actor: 'มานี', text: 'รับคืนลังโฟม 2 ใบ จาก JJ', createdAt: yesterday.toISOString() }),
]

beforeEach(() => {
  listAuditLogs.mockReset().mockResolvedValue(rows)
})

const renderPage = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuditLog />
    </MemoryRouter>,
  )

const entries = () => screen.getAllByRole('listitem')

test('grouped by day with a count, each entry showing time, what happened and who', async () => {
  renderPage()
  const todayGroup = await screen.findByRole('region', { name: /วันนี้/ })
  expect(todayGroup).toHaveTextContent('2 รายการ')
  expect(screen.getByRole('region', { name: /เมื่อวาน/ })).toHaveTextContent('รับคืนลังโฟม 2 ใบ จาก JJ')
  const first = within(todayGroup).getAllByRole('listitem')[0]
  expect(first).toHaveTextContent('10:30')
  expect(first).toHaveTextContent('สร้างลิงก์ลูกค้าใหม่ให้ออเดอร์ PO-1')
  expect(first).toHaveTextContent('สมชาย')
})

test('an entry about an order or claim links to it', async () => {
  renderPage()
  await screen.findByText('สร้างลิงก์ลูกค้าใหม่ให้ออเดอร์ PO-1')
  expect(screen.getByRole('link', { name: /PO-1/ })).toHaveAttribute('href', '/order/o1')
  expect(screen.getByRole('link', { name: /PO-2/ })).toHaveAttribute('href', '/claims/c2')
  expect(screen.queryByRole('link', { name: /ลังโฟม/ })).not.toBeInTheDocument()
})

test('filter by type, by person, and search', async () => {
  renderPage()
  await screen.findByText('สร้างลิงก์ลูกค้าใหม่ให้ออเดอร์ PO-1')
  await userEvent.click(screen.getByRole('button', { name: 'เคลม' }))
  expect(entries()).toHaveLength(1)
  expect(entries()[0]).toHaveTextContent('PO-2')
  await userEvent.click(screen.getByRole('button', { name: 'ทั้งหมด' }))
  await userEvent.selectOptions(screen.getByLabelText('คนทำ'), 'มานี')
  expect(entries()).toHaveLength(1)
  expect(entries()[0]).toHaveTextContent('ลังโฟม')
  await userEvent.selectOptions(screen.getByLabelText('คนทำ'), 'ทุกคน')
  await userEvent.type(screen.getByPlaceholderText('ค้นหาเลข PO / ชื่อลูกค้า / เบอร์'), 'po-1')
  expect(entries()).toHaveLength(1)
  expect(entries()[0]).toHaveTextContent('PO-1')
})

test('nothing matching says so', async () => {
  renderPage()
  await screen.findByText('สร้างลิงก์ลูกค้าใหม่ให้ออเดอร์ PO-1')
  await userEvent.type(screen.getByPlaceholderText('ค้นหาเลข PO / ชื่อลูกค้า / เบอร์'), 'zzz')
  expect(screen.getByText('ไม่พบรายการที่ตรงกับที่เลือก')).toBeInTheDocument()
})

test('shows the empty state when there are zero rows', async () => {
  listAuditLogs.mockResolvedValue([])
  renderPage()
  expect(await screen.findByText('ยังไม่มีประวัติการใช้งาน')).toBeInTheDocument()
})

test('shows a Thai error on a load failure, with no crash', async () => {
  listAuditLogs.mockRejectedValue(new Error('x'))
  renderPage()
  expect(await screen.findByText('โหลดประวัติการใช้งานไม่สำเร็จ')).toBeInTheDocument()
})
