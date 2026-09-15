import { render, screen } from '@testing-library/react'
import AuditLog from './AuditLog'

const listAuditLogs = vi.fn()
vi.mock('../../lib/api/auditLogs', () => ({
  listAuditLogs: (...a: unknown[]) => listAuditLogs(...a),
}))

const rows = [
  { id: 2, createdAt: '2026-09-10T03:00:00.000Z', message: 'นำเข้าออเดอร์วันที่ 2026-09-10 — ใหม่ 5 รายการ · sync 2 รายการ โดย สมชาย' },
  { id: 1, createdAt: '2026-09-01T03:00:00.000Z', message: 'สร้างลิงก์ลูกค้าใหม่ให้ออเดอร์ PO-1 โดย สมชาย' },
]

beforeEach(() => {
  listAuditLogs.mockReset().mockResolvedValue(rows)
})

test('renders every row message with its formatted time', async () => {
  render(<AuditLog />)
  await screen.findByText(
    'นำเข้าออเดอร์วันที่ 2026-09-10 — ใหม่ 5 รายการ · sync 2 รายการ โดย สมชาย',
  )
  expect(
    screen.getByText('สร้างลิงก์ลูกค้าใหม่ให้ออเดอร์ PO-1 โดย สมชาย'),
  ).toBeInTheDocument()
  // formatDateTimeTH renders a th-TH medium date+time string -- assert the
  // Thai year digits show up rather than pinning the exact formatted string.
  expect(screen.getAllByText(/2569/)).toHaveLength(2)
})

test('shows the empty state when there are zero rows', async () => {
  listAuditLogs.mockReset().mockResolvedValue([])
  render(<AuditLog />)
  expect(await screen.findByText('ยังไม่มีประวัติการใช้งาน')).toBeInTheDocument()
})

test('shows a Thai error on a load failure, with no crash', async () => {
  listAuditLogs.mockReset().mockRejectedValueOnce(new Error('nope'))
  render(<AuditLog />)
  expect(await screen.findByText('โหลดประวัติการใช้งานไม่สำเร็จ')).toBeInTheDocument()
})
