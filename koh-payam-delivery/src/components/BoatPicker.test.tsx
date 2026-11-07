import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BoatPicker, nextHour } from './BoatPicker'

const addTimedBoat = vi.fn()
vi.mock('../lib/api/shipDays', () => ({
  addTimedBoat: (...a: unknown[]) => addTimedBoat(...a),
}))

const boats = [
  { id: 'taikhaek-1', name: 'ไต๋แขก 1' },
  { id: 'speed', name: 'Speed boat', timed: true },
  { id: 'speed-0900', name: 'Speed boat 09:00', of: 'speed' },
]

function renderPicker(selectedId: string | null = null) {
  const onChoose = vi.fn()
  const onBoatAdded = vi.fn()
  const onError = vi.fn()
  render(
    <BoatPicker shipDayId="sd1" boats={boats} selectedId={selectedId} onChoose={onChoose} onBoatAdded={onBoatAdded} onError={onError} />,
  )
  return { onChoose, onBoatAdded, onError }
}

beforeEach(() => addTimedBoat.mockReset())

test('a plain boat is chosen straight away', async () => {
  const { onChoose } = renderPicker()
  await userEvent.click(screen.getByRole('button', { name: 'ไต๋แขก 1' }))
  expect(onChoose).toHaveBeenCalledWith('taikhaek-1')
})

test("runs already added are not separate buttons; the timed boat's button shows the chosen run", () => {
  renderPicker('speed-0900')
  expect(screen.queryByRole('button', { name: 'Speed boat' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Speed boat 09:00' })).toBeInTheDocument()
})

test('a timed boat asks for the time, adds that run and picks it', async () => {
  addTimedBoat.mockResolvedValueOnce({ id: 'speed-1430', name: 'Speed boat 14:30', of: 'speed' })
  const { onChoose, onBoatAdded } = renderPicker()
  await userEvent.click(screen.getByRole('button', { name: 'Speed boat' }))
  expect(onChoose).not.toHaveBeenCalled()
  const time = screen.getByLabelText('เวลาออกของ Speed boat')
  await userEvent.clear(time)
  await userEvent.type(time, '14:30')
  await userEvent.click(screen.getByRole('button', { name: 'เลือกรอบนี้' }))
  expect(addTimedBoat).toHaveBeenCalledWith('sd1', 'speed', '14:30')
  expect(onBoatAdded).toHaveBeenCalledWith({ id: 'speed-1430', name: 'Speed boat 14:30', of: 'speed' })
  expect(onChoose).toHaveBeenCalledWith('speed-1430')
})

test('picking a run the day already has does not add it twice', async () => {
  addTimedBoat.mockResolvedValueOnce({ id: 'speed-0900', name: 'Speed boat 09:00', of: 'speed' })
  const { onChoose, onBoatAdded } = renderPicker()
  await userEvent.click(screen.getByRole('button', { name: 'Speed boat' }))
  const time = screen.getByLabelText('เวลาออกของ Speed boat')
  await userEvent.clear(time)
  await userEvent.type(time, '09:00')
  await userEvent.click(screen.getByRole('button', { name: 'เลือกรอบนี้' }))
  expect(onBoatAdded).not.toHaveBeenCalled()
  expect(onChoose).toHaveBeenCalledWith('speed-0900')
})

test('a failed add reports the error and picks nothing', async () => {
  addTimedBoat.mockRejectedValueOnce(new Error('เพิ่มรอบเรือไม่สำเร็จ: x'))
  const { onChoose, onError } = renderPicker()
  await userEvent.click(screen.getByRole('button', { name: 'Speed boat' }))
  await userEvent.click(screen.getByRole('button', { name: 'เลือกรอบนี้' }))
  expect(onError).toHaveBeenCalledWith('เพิ่มรอบเรือไม่สำเร็จ: x')
  expect(onChoose).not.toHaveBeenCalled()
})

test('nextHour is the next whole hour in Bangkok', () => {
  expect(nextHour(new Date('2026-11-07T07:20:00Z'))).toBe('15:00')
  expect(nextHour(new Date('2026-11-07T16:59:00Z'))).toBe('00:00')
})
