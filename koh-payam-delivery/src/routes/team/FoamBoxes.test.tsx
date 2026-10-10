import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FoamBoxes from './FoamBoxes'

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

const jj = {
  key: 'phone:0826289533|name:JJ PAYAM',
  name: 'JJ Payam',
  phone: '0826289533',
  balance: 4,
  lastSentAt: '2026-10-11T00:00:00+00:00',
  events: [{ at: '2026-10-11T00:00:00+00:00', kind: 'sent', qty: 4, label: 'PO-1' }],
}
const zero = { key: 'name:QUIET', name: 'Quiet', phone: null, balance: 0, lastSentAt: null, events: [] }

beforeEach(() => {
  role.current = 'manager'
  listFoamCustomers.mockReset().mockResolvedValue([jj, zero])
  recordFoamReturn.mockClear()
  setFoamBalance.mockClear()
})

test('lists only customers holding boxes; "show all" reveals the rest; search filters', async () => {
  render(<FoamBoxes />)
  expect(await screen.findByText('JJ Payam')).toBeInTheDocument()
  expect(screen.queryByText('Quiet')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('checkbox', { name: 'แสดงลูกค้าทั้งหมด' }))
  expect(screen.getByText('Quiet')).toBeInTheDocument()
  await userEvent.type(screen.getByPlaceholderText('ค้นหาชื่อหรือเบอร์'), 'qui')
  expect(screen.queryByText('JJ Payam')).not.toBeInTheDocument()
})

test('record a return; more than outstanding asks to confirm first', async () => {
  render(<FoamBoxes />)
  const row = (await screen.findByText('JJ Payam')).closest('li') as HTMLElement
  await userEvent.click(within(row).getByRole('button', { name: 'รับคืน' }))
  const qty = within(row).getByLabelText('จำนวนที่รับคืน')
  await userEvent.clear(qty)
  await userEvent.type(qty, '6')
  expect(within(row).getByText(/มากกว่ายอดค้าง \(4 ใบ\)/)).toBeInTheDocument()
  await userEvent.click(within(row).getByRole('button', { name: 'บันทึกรับคืน' }))
  expect(recordFoamReturn).toHaveBeenCalledWith({ key: jj.key, name: 'JJ Payam' }, 6, '')
  expect(listFoamCustomers).toHaveBeenCalledTimes(2) // reloaded after saving
})

test('only managers see "ตั้งยอด"; a manager can set a balance', async () => {
  role.current = 'pier'
  const { unmount } = render(<FoamBoxes />)
  const row = (await screen.findByText('JJ Payam')).closest('li') as HTMLElement
  expect(within(row).queryByRole('button', { name: 'ตั้งยอด' })).not.toBeInTheDocument()
  unmount()

  role.current = 'manager'
  render(<FoamBoxes />)
  const row2 = (await screen.findByText('JJ Payam')).closest('li') as HTMLElement
  await userEvent.click(within(row2).getByRole('button', { name: 'ตั้งยอด' }))
  const qty = within(row2).getByLabelText('ยอดค้างตอนนี้')
  await userEvent.clear(qty)
  await userEvent.type(qty, '2')
  await userEvent.click(within(row2).getByRole('button', { name: 'บันทึกยอด' }))
  expect(setFoamBalance).toHaveBeenCalledWith({ key: jj.key, name: 'JJ Payam' }, 2, '')
})

test('the name opens the history', async () => {
  render(<FoamBoxes />)
  await userEvent.click(await screen.findByRole('button', { name: /JJ Payam/ }))
  expect(screen.getByText(/ส่งไป 4 ใบ · PO-1/)).toBeInTheDocument()
})

test('not enabled yet (migration not run) -> a Thai notice, no crash', async () => {
  listFoamCustomers.mockResolvedValue(null)
  render(<FoamBoxes />)
  expect(await screen.findByText(/ยังไม่ได้เปิดใช้ระบบติดตามลังโฟม/)).toBeInTheDocument()
})
