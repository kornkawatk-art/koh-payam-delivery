import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MoveShipDay } from './MoveShipDay'

const moveOrdersToDay = vi.fn().mockResolvedValue(2)
vi.mock('../lib/api/moveShipDay', () => ({ moveOrdersToDay: (...a: unknown[]) => moveOrdersToDay(...a) }))

const orders = [
  { id: 'a', makro_order_no: 'PO-a', ship_date: '2026-10-26', status: 'packed' },
  { id: 'b', makro_order_no: 'PO-b', ship_date: '2026-10-26', status: 'imported' },
]

beforeEach(() => moveOrdersToDay.mockClear())

test('picks tomorrow by default, needs a reason, then moves every order and reports the new day', async () => {
  const onMoved = vi.fn()
  render(<MoveShipDay orders={orders} today="2026-10-26" onMoved={onMoved} />)
  await userEvent.click(screen.getByRole('button', { name: 'เลื่อนวันส่ง' }))
  const day = screen.getByLabelText('วันส่งใหม่') as HTMLInputElement
  expect(day.value).toBe('2026-10-27')
  expect(day.min).toBe('2026-10-27')
  const confirm = screen.getByRole('button', { name: 'ยืนยันเลื่อน' })
  expect(confirm).toBeDisabled()
  await userEvent.type(screen.getByLabelText('เหตุผลที่เลื่อน'), 'รอลูกค้าโอน')
  await userEvent.click(confirm)
  expect(moveOrdersToDay).toHaveBeenCalledWith(orders, '2026-10-27', 'รอลูกค้าโอน', '2026-10-26')
  expect(onMoved).toHaveBeenCalledWith('2026-10-27')
})

test('a failed move says why and stays open', async () => {
  moveOrdersToDay.mockRejectedValueOnce(new Error('เลื่อนวันส่งออเดอร์ PO-a ไม่สำเร็จ'))
  const onMoved = vi.fn()
  render(<MoveShipDay orders={orders} today="2026-10-26" onMoved={onMoved} />)
  await userEvent.click(screen.getByRole('button', { name: 'เลื่อนวันส่ง' }))
  await userEvent.type(screen.getByLabelText('เหตุผลที่เลื่อน'), 'x')
  await userEvent.click(screen.getByRole('button', { name: 'ยืนยันเลื่อน' }))
  expect(await screen.findByText('เลื่อนวันส่งออเดอร์ PO-a ไม่สำเร็จ')).toBeInTheDocument()
  expect(onMoved).not.toHaveBeenCalled()
})

test('nothing to offer once every order has gone out', () => {
  const { container } = render(
    <MoveShipDay orders={[{ ...orders[0], status: 'shipped' }]} today="2026-10-26" onMoved={() => {}} />,
  )
  expect(container).toBeEmptyDOMElement()
})
