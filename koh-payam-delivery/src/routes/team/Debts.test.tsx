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
  { key: 'phone:0822222222|name:MID WEEK', name: 'Mid Week', phone: '0822222222', bills: [b('4', '2026-10-07', 3000)], total: 3000, oldestDays: 5, lockedToday: true },
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

const rowNames = async () =>
  (await screen.findAllByRole('listitem')).map((li) => within(li).getByRole('button', { expanded: false }).textContent)

test('summary on top: total owed, how many customers, how many over 7 days', async () => {
  renderPage()
  await screen.findByText('Old Debt')
  const summary = screen.getByRole('region', { name: 'สรุปยอดค้าง' })
  expect(within(summary).getByText('ยอดค้างรวม').closest('div')).toHaveTextContent('4,700')
  expect(within(summary).getByText('ลูกค้าค้างจ่าย').closest('div')).toHaveTextContent('3 ราย')
  expect(within(summary).getByText('ค้างเกิน 7 วัน').closest('div')).toHaveTextContent('1 ราย')
})

test('each customer shows bills, amount, age coloured by urgency, and lock state', async () => {
  renderPage()
  const rows = await screen.findAllByRole('listitem')
  expect(rows[0]).toHaveTextContent('Old Debt')
  expect(rows[0]).toHaveTextContent('2 บิล')
  expect(within(rows[0]).getByText(/1,500/)).toHaveClass('num')
  expect(within(rows[0]).getByText('ค้าง 11 วัน')).toHaveClass('badge-danger') // over 7 days
  expect(within(rows[1]).getByText('ค้าง 5 วัน')).toHaveClass('badge-warn') // 4-7 days
  expect(within(rows[2]).getByText('ค้าง 0 วัน')).toHaveClass('badge-neutral')
  expect(within(rows[0]).getByText('ล็อกอยู่')).toBeInTheDocument()
  expect(within(rows[2]).queryByText('ล็อกอยู่')).not.toBeInTheDocument() // only today's bill
})

test('search narrows by name or phone', async () => {
  renderPage()
  await screen.findByText('Old Debt')
  await userEvent.type(screen.getByPlaceholderText('ค้นหาชื่อหรือเบอร์'), '0811')
  expect(screen.queryByText('Today Only')).not.toBeInTheDocument()
  expect(screen.queryByText('Mid Week')).not.toBeInTheDocument()
})

test('filters: over 7 days, and released today', async () => {
  listReleasedKeys.mockResolvedValue(new Set(['phone:0822222222|name:MID WEEK']))
  renderPage()
  await screen.findByText('Old Debt')
  await userEvent.click(screen.getByRole('button', { name: /เกิน 7 วัน/ }))
  expect(await rowNames()).toEqual([expect.stringContaining('Old Debt')])
  await userEvent.click(screen.getByRole('button', { name: /ปลดแล้ววันนี้/ }))
  expect(await rowNames()).toEqual([expect.stringContaining('Mid Week')])
  await userEvent.click(screen.getByRole('button', { name: /ทั้งหมด/ }))
  expect(await rowNames()).toHaveLength(3)
})

test('sort by largest amount', async () => {
  renderPage()
  await screen.findByText('Old Debt')
  await userEvent.selectOptions(screen.getByLabelText('เรียง'), 'ยอดมากสุด')
  const names = await rowNames()
  expect(names[0]).toContain('Mid Week')
  expect(names[1]).toContain('Old Debt')
})

test('open a customer: bills link to orders; marking paid asks first; release with a reason', async () => {
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: /Old Debt/ }))
  expect(screen.getByRole('link', { name: 'PO-1' })).toHaveAttribute('href', '/order/1')
  await userEvent.click(screen.getAllByRole('button', { name: 'รับเงินแล้ว' })[0])
  expect(markBillPaid).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'ยืนยัน รับเงินแล้ว' }))
  expect(markBillPaid).toHaveBeenCalledWith('1')
  await userEvent.click(screen.getByRole('button', { name: 'ปลดให้แพ็ครอบวันนี้' }))
  await userEvent.type(screen.getByLabelText('เหตุผลที่ปลด'), 'ลูกค้าโอนแล้ว')
  await userEvent.click(screen.getByRole('button', { name: 'ยืนยันปลด' }))
  expect(releaseCustomer).toHaveBeenCalledWith(
    { customer_phone: '0811111111', customer_name_en: 'Old Debt' },
    todayLocalISO(),
    'ลูกค้าโอนแล้ว',
  )
})

test('a customer released for today shows so instead of the lock, and has no release button', async () => {
  listReleasedKeys.mockResolvedValue(new Set(['phone:0811111111|name:OLD DEBT']))
  renderPage()
  const rows = await screen.findAllByRole('listitem')
  expect(within(rows[0]).getByText('ปลดแล้ววันนี้')).toBeInTheDocument()
  expect(within(rows[0]).queryByText('ล็อกอยู่')).not.toBeInTheDocument()
  await userEvent.click(within(rows[0]).getByRole('button', { name: /Old Debt/ }))
  expect(screen.queryByRole('button', { name: 'ปลดให้แพ็ครอบวันนี้' })).not.toBeInTheDocument()
})
