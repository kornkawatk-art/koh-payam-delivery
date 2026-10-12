import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Debts from './Debts'
import { todayLocalISO } from '../../lib/format'

const listCustomerDebts = vi.fn()
const listReleasedKeys = vi.fn()
const markBillPaid = vi.fn().mockResolvedValue(undefined)
const releaseCustomer = vi.fn().mockResolvedValue(undefined)
vi.mock('../../lib/api/payments', () => ({
  listCustomerDebts: (...a: unknown[]) => listCustomerDebts(...a),
  listReleasedKeys: (...a: unknown[]) => listReleasedKeys(...a),
  markBillPaid: (...a: unknown[]) => markBillPaid(...a),
  releaseCustomer: (...a: unknown[]) => releaseCustomer(...a),
}))

const b = (id: string, ship: string, amt: number) => ({
  id, makro_order_no: 'PO-' + id, customer_name_en: 'x', customer_phone: null, ship_date: ship,
  outstanding_amount: amt, payment_method: 'Pay On Delivery', payment_status: 'Unpaid',
})
const debts = [
  { key: 'phone:0811111111|name:OLD DEBT', name: 'Old Debt', phone: '0811111111', bills: [b('1', '2026-10-01', 1000), b('2', '2026-10-05', 500)], total: 1500, oldestDays: 11, lockedToday: true },
  { key: 'name:TODAY ONLY', name: 'Today Only', phone: null, bills: [b('3', todayLocalISO(), 200)], total: 200, oldestDays: 0, lockedToday: false },
]

beforeEach(() => {
  listCustomerDebts.mockReset().mockResolvedValue(debts)
  listReleasedKeys.mockReset().mockResolvedValue(new Set())
  markBillPaid.mockClear()
  releaseCustomer.mockClear()
})

const renderPage = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Debts />
    </MemoryRouter>,
  )

test('lists customers oldest first with totals, the overall total, and who is locked', async () => {
  renderPage()
  const rows = await screen.findAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Old Debt')
  expect(rows[0]).toHaveTextContent('2 บิล')
  expect(rows[0]).toHaveTextContent('ค้าง 11 วัน')
  expect(within(rows[0]).getByText('ล็อกแพ็ค')).toBeInTheDocument()
  expect(within(rows[1]).queryByText('ล็อกแพ็ค')).not.toBeInTheDocument()
  expect(screen.getByText(/ยอดค้างรวม/)).toHaveTextContent('1,700')
})

test('search narrows by name or phone', async () => {
  renderPage()
  await screen.findByText('Old Debt')
  await userEvent.type(screen.getByPlaceholderText('ค้นหาชื่อหรือเบอร์'), '0811')
  expect(screen.queryByText('Today Only')).not.toBeInTheDocument()
})

test('open a customer: bills link to orders; mark one paid; release with a reason', async () => {
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: /Old Debt/ }))
  expect(screen.getByRole('link', { name: 'PO-1' })).toHaveAttribute('href', '/order/1')
  await userEvent.click(screen.getAllByRole('button', { name: 'รับเงินแล้ว' })[0])
  expect(markBillPaid).toHaveBeenCalledWith('1')
  await userEvent.click(screen.getByRole('button', { name: 'ปลดให้แพ็ค' }))
  await userEvent.type(screen.getByLabelText('เหตุผลที่ปลด'), 'ลูกค้าโอนแล้ว')
  await userEvent.click(screen.getByRole('button', { name: 'ยืนยันปลด' }))
  expect(releaseCustomer).toHaveBeenCalledWith(
    { customer_phone: '0811111111', customer_name_en: 'Old Debt' },
    todayLocalISO(),
    'ลูกค้าโอนแล้ว',
  )
})

test('a customer released for today shows so instead of the lock', async () => {
  listReleasedKeys.mockResolvedValue(new Set(['phone:0811111111|name:OLD DEBT']))
  renderPage()
  expect(await screen.findByText('ปลดแล้ววันนี้')).toBeInTheDocument()
  expect(screen.queryByText('ล็อกแพ็ค')).not.toBeInTheDocument()
})

test('money shows in the monospace number style', async () => {
  renderPage()
  const rows = await screen.findAllByRole('listitem')
  expect(within(rows[0]).getByText(/1,500/)).toHaveClass('num')
})
