import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import BoatSetup from './BoatSetup'
import { todayLocalISO } from '../../lib/format'

const getOrCreateShipDay = vi.fn()
const setBoats = vi.fn().mockResolvedValue(undefined)
const sendOrderLinks = vi.fn().mockResolvedValue({ sent: 0, failed: 0, skipped: false })

vi.mock('../../lib/api/shipDays', () => ({
  getOrCreateShipDay: (...a: unknown[]) => getOrCreateShipDay(...a),
  setBoats: (...a: unknown[]) => setBoats(...a),
  sendOrderLinks: (...a: unknown[]) => sendOrderLinks(...a),
}))

// Reconfigurable per test: the orders count-query result that removeBoat sees.
const countResult = vi.hoisted(() => ({ current: { count: 0, error: null } as any }))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve(countResult.current),
        }),
      }),
    }),
  },
}))

beforeEach(() => {
  getOrCreateShipDay.mockReset().mockResolvedValue({
    id: 'sd1',
    boats: [
      { id: 'b1', name: 'เรือเช้า' },
      { id: 'b2', name: 'เรือบ่าย' },
    ],
  })
  setBoats.mockClear()
  sendOrderLinks.mockReset().mockResolvedValue({ sent: 0, failed: 0, skipped: false })
  countResult.current = { count: 0, error: null }
})

const renderPage = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <BoatSetup />
    </MemoryRouter>,
  )

test('adds a boat row, renames it, and saves the longer list', async () => {
  renderPage()
  expect(await screen.findByDisplayValue('เรือเช้า')).toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: '+ เพิ่มเรือ' }))
  const added = await screen.findByDisplayValue('เรือ 3')
  await userEvent.clear(added)
  await userEvent.type(added, 'เรือเย็น')

  await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }))

  expect(setBoats).toHaveBeenCalledTimes(1)
  const [shipDayId, boats] = setBoats.mock.calls[0]
  expect(shipDayId).toBe('sd1')
  expect(boats).toHaveLength(3)
  expect(boats[0].name).toBe('เรือเช้า')
  expect(boats[2].name).toBe('เรือเย็น')
})

test('keeps a boat that still has orders bound to it and warns', async () => {
  countResult.current = { count: 2, error: null }
  renderPage()
  await screen.findByDisplayValue('เรือเช้า')

  await userEvent.click(screen.getAllByRole('button', { name: 'ลบ' })[0])

  expect(await screen.findByText('ลบไม่ได้: มี 2 ออเดอร์ผูกกับเรือนี้แล้ว')).toBeInTheDocument()
  expect(screen.getByDisplayValue('เรือเช้า')).toBeInTheDocument()
})

test('removes a boat with no bound orders and saves the shorter list', async () => {
  countResult.current = { count: 0, error: null }
  renderPage()
  await screen.findByDisplayValue('เรือเช้า')

  await userEvent.click(screen.getAllByRole('button', { name: 'ลบ' })[0])
  expect(screen.queryByDisplayValue('เรือเช้า')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
  expect(setBoats).toHaveBeenCalledTimes(1)
  const [, boats] = setBoats.mock.calls[0]
  expect(boats).toHaveLength(1)
  expect(boats[0].name).toBe('เรือบ่าย')
})

test('load fails → Thai error + retry re-invokes the loader', async () => {
  getOrCreateShipDay
    .mockReset()
    .mockRejectedValueOnce(new Error('nope'))
    .mockResolvedValue({ id: 'sd1', boats: [{ id: 'b1', name: 'เรือเช้า' }] })
  renderPage()
  await screen.findByText('โหลดข้อมูลเรือไม่สำเร็จ')
  const callsBefore = getOrCreateShipDay.mock.calls.length

  await userEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }))

  await waitFor(() =>
    expect(getOrCreateShipDay.mock.calls.length).toBeGreaterThan(callsBefore),
  )
  expect(await screen.findByDisplayValue('เรือเช้า')).toBeInTheDocument()
})

test('save() shows a Thai error message when persisting fails', async () => {
  setBoats.mockRejectedValueOnce(new Error('boom'))
  renderPage()
  await screen.findByDisplayValue('เรือเช้า')
  await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }))
  expect(
    await screen.findByText('บันทึกรายการเรือไม่สำเร็จ ลองใหม่อีกครั้ง'),
  ).toBeInTheDocument()
})

test('saving boats successfully also sends LINE links for the same date and folds the count into the success message', async () => {
  sendOrderLinks.mockResolvedValueOnce({ sent: 5, failed: 1, skipped: false })
  renderPage()
  await screen.findByDisplayValue('เรือเช้า')

  await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }))

  expect(sendOrderLinks).toHaveBeenCalledTimes(1)
  expect(sendOrderLinks).toHaveBeenCalledWith(todayLocalISO())
  expect(
    await screen.findByText('บันทึกรายการเรือแล้ว · ส่งลิงก์ไลน์ 5 ฉบับ'),
  ).toBeInTheDocument()
})

test('a sendOrderLinks failure still shows the boat-save success, distinctly, not the whole save reported as failed', async () => {
  sendOrderLinks.mockRejectedValueOnce(new Error('LINE API ล่ม'))
  renderPage()
  await screen.findByDisplayValue('เรือเช้า')

  await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }))

  const msg = await screen.findByText(/บันทึกรายการเรือแล้ว/)
  expect(msg).toBeInTheDocument()
  expect(msg.textContent).toMatch(/ส่งลิงก์ไลน์ไม่สำเร็จ/)
  expect(screen.queryByText('บันทึกรายการเรือไม่สำเร็จ ลองใหม่อีกครั้ง')).not.toBeInTheDocument()
})

test('fails closed when the count query errors — boat stays, warning shown', async () => {
  countResult.current = { count: null, error: { message: 'boom' } }
  renderPage()
  await screen.findByDisplayValue('เรือเช้า')

  await userEvent.click(screen.getAllByRole('button', { name: 'ลบ' })[0])

  expect(
    await screen.findByText('ตรวจสอบออเดอร์ที่ผูกกับเรือไม่สำเร็จ ลองใหม่อีกครั้ง'),
  ).toBeInTheDocument()
  expect(screen.getByDisplayValue('เรือเช้า')).toBeInTheDocument()
})
