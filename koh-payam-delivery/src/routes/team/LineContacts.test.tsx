import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LineContacts from './LineContacts'

const listLineContacts = vi.fn()
vi.mock('../../lib/api/lineContacts', () => ({
  listLineContacts: (...a: unknown[]) => listLineContacts(...a),
}))

const rows = [
  { phone: '0812345678', displayName: 'Somchai', createdAt: '2026-09-10T03:00:00.000Z' },
  { phone: '0899999999', displayName: 'Malee', createdAt: '2026-09-01T03:00:00.000Z' },
]

beforeEach(() => {
  listLineContacts.mockReset().mockResolvedValue(rows)
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
