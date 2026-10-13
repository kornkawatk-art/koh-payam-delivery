import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FoamBoxes from './FoamBoxes'
import { formatDateTimeTH } from '../../lib/format'

const listFoamCustomers = vi.fn()
const recordFoamReturn = vi.fn().mockResolvedValue(undefined)
const setFoamBalance = vi.fn().mockResolvedValue(undefined)
vi.mock('../../lib/api/foamBoxes', () => ({
  listFoamCustomers: (...a: unknown[]) => listFoamCustomers(...a),
  recordFoamReturn: (...a: unknown[]) => recordFoamReturn(...a),
  setFoamBalance: (...a: unknown[]) => setFoamBalance(...a),
}))
const role = { current: 'manager' }
vi.mock('../../lib/auth', () => ({
  useAuth: () => ({ profile: { id: 'u1', name: 'x', role: role.current } }),
}))

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (n: number) => new Date(Date.now() - n * DAY - 60 * 60 * 1000).toISOString()

const jj = {
  key: 'phone:0826289533|name:JJ PAYAM',
  name: 'JJ Payam',
  phone: '0826289533',
  balance: 4,
  lastSentAt: daysAgo(3),
  events: [{ at: daysAgo(3), kind: 'sent', qty: 4, label: 'PO-1' }],
}
const old = {
  key: 'name:OLD HOLDER',
  name: 'Old Holder',
  phone: '0811111111',
  balance: 2,
  lastSentAt: daysAgo(20),
  events: [
    { at: daysAgo(20), kind: 'sent', qty: 5, label: 'PO-2' },
    { at: daysAgo(2), kind: 'return', qty: 3, by: 'สมชาย' },
  ],
}
const zero = { key: 'name:QUIET', name: 'Quiet', phone: null, balance: 0, lastSentAt: null, events: [] }

beforeEach(() => {
  role.current = 'manager'
  listFoamCustomers.mockReset().mockResolvedValue([jj, old, zero])
  recordFoamReturn.mockClear()
  setFoamBalance.mockClear()
})

const rowOf = async (name: string) => (await screen.findByText(name)).closest('li') as HTMLElement

test('summary: boxes out, customers holding, held over 14 days, returned in the last 7 days', async () => {
  render(<FoamBoxes />)
  const summary = await screen.findByRole('region', { name: 'สรุปลังโฟม' })
  expect(within(summary).getByText('ลังที่อยู่กับลูกค้า').closest('div')).toHaveTextContent('6 ใบ')
  expect(within(summary).getByText('ลูกค้าที่ถือลัง').closest('div')).toHaveTextContent('2 ราย')
  expect(within(summary).getByText('ค้างเกิน 14 วัน').closest('div')).toHaveTextContent('1 ราย')
  expect(within(summary).getByText('รับคืน 7 วันล่าสุด').closest('div')).toHaveTextContent('3 ใบ')
})

test('each row: boxes held, how long (coloured), last sent and last returned', async () => {
  render(<FoamBoxes />)
  const oldRow = await rowOf('Old Holder')
  expect(oldRow).toHaveTextContent('2 ใบ')
  expect(within(oldRow).getByText('ถือมา 20 วัน')).toHaveClass('badge-danger')
  expect(oldRow).toHaveTextContent('คืนล่าสุด')
  expect(within(await rowOf('JJ Payam')).getByText('ถือมา 3 วัน')).toHaveClass('badge-neutral')
})

test('opens on customers holding boxes, longest held first; filters and search', async () => {
  render(<FoamBoxes />)
  await screen.findByText('JJ Payam')
  const names = () => screen.getAllByRole('listitem').map((li) => li.textContent)
  expect(names()[0]).toContain('Old Holder')
  expect(screen.queryByText('Quiet')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /ค้างเกิน 14 วัน/ }))
  expect(names()).toHaveLength(1)
  await userEvent.click(screen.getByRole('button', { name: /^ทั้งหมด/ }))
  expect(screen.getByText('Quiet')).toBeInTheDocument()
  await userEvent.type(screen.getByPlaceholderText('ค้นหาชื่อหรือเบอร์'), 'qui')
  expect(screen.queryByText('JJ Payam')).not.toBeInTheDocument()
})

test('sort by most boxes held', async () => {
  render(<FoamBoxes />)
  await screen.findByText('JJ Payam')
  await userEvent.selectOptions(screen.getByLabelText('เรียง'), 'ถือมากสุด')
  expect(screen.getAllByRole('listitem')[0]).toHaveTextContent('JJ Payam')
})

test('record a return with the steppers or "return all"; more than held warns first', async () => {
  render(<FoamBoxes />)
  const row = await rowOf('JJ Payam')
  await userEvent.click(within(row).getByRole('button', { name: 'รับคืน' }))
  const qty = within(row).getByLabelText('จำนวนที่รับคืน')
  expect(qty).toHaveValue(1)
  await userEvent.click(within(row).getByRole('button', { name: 'เพิ่มจำนวน' }))
  expect(qty).toHaveValue(2)
  await userEvent.click(within(row).getByRole('button', { name: 'คืนครบ 4 ใบ' }))
  expect(qty).toHaveValue(4)
  await userEvent.clear(qty)
  await userEvent.type(qty, '6')
  expect(within(row).getByText(/มากกว่ายอดค้าง \(4 ใบ\)/)).toBeInTheDocument()
  await userEvent.click(within(row).getByRole('button', { name: 'บันทึกรับคืน 6 ใบ' }))
  expect(recordFoamReturn).toHaveBeenCalledWith({ key: jj.key, name: 'JJ Payam' }, 6, '')
  expect(listFoamCustomers).toHaveBeenCalledTimes(2) // reloaded after saving
})

test('only managers see "ตั้งยอด"; a manager can set a balance', async () => {
  role.current = 'pier'
  const { unmount } = render(<FoamBoxes />)
  expect(within(await rowOf('JJ Payam')).queryByRole('button', { name: 'ตั้งยอด' })).not.toBeInTheDocument()
  unmount()

  role.current = 'manager'
  render(<FoamBoxes />)
  const row = await rowOf('JJ Payam')
  await userEvent.click(within(row).getByRole('button', { name: 'ตั้งยอด' }))
  const qty = within(row).getByLabelText('ยอดค้างตอนนี้')
  await userEvent.clear(qty)
  await userEvent.type(qty, '2')
  await userEvent.click(within(row).getByRole('button', { name: 'บันทึกยอด' }))
  expect(setFoamBalance).toHaveBeenCalledWith({ key: jj.key, name: 'JJ Payam' }, 2, '')
})

test('the name opens a timeline, newest first, with who, the exact local time and the balance after', async () => {
  render(<FoamBoxes />)
  const row = await rowOf('Old Holder')
  await userEvent.click(within(row).getByRole('button', { name: /Old Holder/ }))
  const steps = within(within(row).getByRole('list', { name: 'ประวัติ' })).getAllByRole('listitem')
  expect(steps[0]).toHaveTextContent('รับคืน 3 ใบ')
  expect(steps[0]).toHaveTextContent('โดย สมชาย')
  expect(steps[0]).toHaveTextContent(formatDateTimeTH(old.events[1].at))
  expect(steps[0]).toHaveTextContent('คงเหลือ 2')
  expect(steps[1]).toHaveTextContent('ส่งไป 5 ใบ')
  expect(steps[1]).toHaveTextContent('PO-2')
  expect(steps[1]).toHaveTextContent('คงเหลือ 5')
})

test('not enabled yet (migration not run) -> a Thai notice, no crash', async () => {
  listFoamCustomers.mockResolvedValue(null)
  render(<FoamBoxes />)
  expect(await screen.findByText(/ยังไม่ได้เปิดใช้ระบบติดตามลังโฟม/)).toBeInTheDocument()
})
