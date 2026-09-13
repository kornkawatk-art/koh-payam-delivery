import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LineContacts from './LineContacts'

const listLineContacts = vi.fn()
const listPendingLineContactRequests = vi.fn()
const resolveLineContactRequest = vi.fn()
vi.mock('../../lib/api/lineContacts', () => ({
  listLineContacts: (...a: unknown[]) => listLineContacts(...a),
  listPendingLineContactRequests: (...a: unknown[]) => listPendingLineContactRequests(...a),
  resolveLineContactRequest: (...a: unknown[]) => resolveLineContactRequest(...a),
}))

const rows = [
  { phone: '0812345678', displayName: 'Somchai', createdAt: '2026-09-10T03:00:00.000Z' },
  { phone: '0899999999', displayName: 'Malee', createdAt: '2026-09-01T03:00:00.000Z' },
]

const pendingRows = [
  {
    phone: '0888888888',
    oldDisplayName: 'Somsri (old)',
    pendingDisplayName: 'Somsri (new)',
    requestedAt: '2026-09-12T03:00:00.000Z',
  },
]

beforeEach(() => {
  listLineContacts.mockReset().mockResolvedValue(rows)
  listPendingLineContactRequests.mockReset().mockResolvedValue([])
  resolveLineContactRequest.mockReset().mockResolvedValue(undefined)
})

test('renders every contact row with phone, display name, and formatted date', async () => {
  render(<LineContacts />)
  await screen.findByText('0812345678')
  expect(screen.getByText('Somchai')).toBeInTheDocument()
  expect(screen.getByText('0899999999')).toBeInTheDocument()
  expect(screen.getByText('Malee')).toBeInTheDocument()
  // formatDateTimeTH renders a th-TH medium date+time string -- assert the
  // Thai year digits show up rather than pinning the exact formatted string.
  expect(screen.getAllByText(/2569/)).toHaveLength(2)
})

test('search box filters by phone substring, case-insensitively', async () => {
  render(<LineContacts />)
  await screen.findByText('0812345678')
  await userEvent.type(screen.getByPlaceholderText('ค้นหาเบอร์โทร / ชื่อ LINE'), '8999')
  expect(screen.queryByText('0812345678')).not.toBeInTheDocument()
  expect(screen.getByText('0899999999')).toBeInTheDocument()
})

test('search box filters by display name substring, case-insensitively', async () => {
  render(<LineContacts />)
  await screen.findByText('0812345678')
  await userEvent.type(screen.getByPlaceholderText('ค้นหาเบอร์โทร / ชื่อ LINE'), 'somchai')
  expect(screen.getByText('0812345678')).toBeInTheDocument()
  expect(screen.queryByText('0899999999')).not.toBeInTheDocument()
})

test('shows the empty state when there are zero contacts', async () => {
  listLineContacts.mockReset().mockResolvedValue([])
  render(<LineContacts />)
  expect(await screen.findByText('ยังไม่มีลูกค้าลงทะเบียน')).toBeInTheDocument()
})

test('shows a Thai error on a load failure, with no crash', async () => {
  listLineContacts.mockReset().mockRejectedValueOnce(new Error('nope'))
  render(<LineContacts />)
  expect(
    await screen.findByText('โหลดรายชื่อผู้ลงทะเบียน LINE ไม่สำเร็จ'),
  ).toBeInTheDocument()
})

test('the pending-requests section is absent when there are no pending rows', async () => {
  render(<LineContacts />)
  await screen.findByText('0812345678')
  expect(screen.queryByText('คำขอรออนุมัติ')).not.toBeInTheDocument()
})

test('renders a pending row with both display names, the phone, and formatted request date', async () => {
  listPendingLineContactRequests.mockResolvedValue(pendingRows)
  render(<LineContacts />)
  expect(await screen.findByText('คำขอรออนุมัติ')).toBeInTheDocument()
  expect(screen.getByText('0888888888')).toBeInTheDocument()
  expect(screen.getByText('Somsri (old)')).toBeInTheDocument()
  expect(screen.getByText('Somsri (new)')).toBeInTheDocument()
  expect(screen.getAllByText(/2569/).length).toBeGreaterThan(0)
})

test('approve button calls resolveLineContactRequest(phone, "approve") and removes the row on success', async () => {
  listPendingLineContactRequests.mockResolvedValueOnce(pendingRows).mockResolvedValueOnce([])
  render(<LineContacts />)
  await screen.findByText('0888888888')

  await userEvent.click(screen.getByRole('button', { name: 'อนุมัติ' }))

  expect(resolveLineContactRequest).toHaveBeenCalledWith('0888888888', 'approve')
  await waitFor(() => expect(screen.queryByText('0888888888')).not.toBeInTheDocument())
  expect(listLineContacts).toHaveBeenCalledTimes(2) // initial + refresh after decision
})

test('reject button calls resolveLineContactRequest(phone, "reject") and removes the row on success', async () => {
  listPendingLineContactRequests.mockResolvedValueOnce(pendingRows).mockResolvedValueOnce([])
  render(<LineContacts />)
  await screen.findByText('0888888888')

  await userEvent.click(screen.getByRole('button', { name: 'ปฏิเสธ' }))

  expect(resolveLineContactRequest).toHaveBeenCalledWith('0888888888', 'reject')
  await waitFor(() => expect(screen.queryByText('0888888888')).not.toBeInTheDocument())
})

test('a failed decision shows a Thai error and keeps the row in the pending section', async () => {
  listPendingLineContactRequests.mockResolvedValue(pendingRows)
  resolveLineContactRequest.mockRejectedValueOnce(new Error('บันทึกผลคำขอไม่สำเร็จ: boom'))
  render(<LineContacts />)
  await screen.findByText('0888888888')

  await userEvent.click(screen.getByRole('button', { name: 'อนุมัติ' }))

  expect(await screen.findByText('บันทึกผลคำขอไม่สำเร็จ: boom')).toBeInTheDocument()
  expect(screen.getByText('0888888888')).toBeInTheDocument()
})
