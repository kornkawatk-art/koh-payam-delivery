import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BoatDefaults, presetProblem } from './BoatDefaults'

const getBoatDefaults = vi.fn()
const setBoatDefaults = vi.fn()
vi.mock('../../lib/api/shipDays', () => ({
  getBoatDefaults: (...a: unknown[]) => getBoatDefaults(...a),
  setBoatDefaults: (...a: unknown[]) => setBoatDefaults(...a),
}))

beforeEach(() => {
  getBoatDefaults.mockReset().mockResolvedValue([
    { id: 'taikhaek-1', name: 'ไต๋แขก 1' },
    { id: 'speed', name: 'Speed boat', timed: true },
  ])
  setBoatDefaults.mockReset().mockResolvedValue(undefined)
})

test('adds a preset boat, marks it timed and saves the list', async () => {
  render(<BoatDefaults />)
  await screen.findByDisplayValue('ไต๋แขก 1')
  await userEvent.click(screen.getByRole('button', { name: '+ เพิ่มเรือประจำ' }))
  await userEvent.type(screen.getByLabelText('ชื่อเรือประจำลำที่ 3'), ' ต้นสน ')
  await userEvent.click(screen.getAllByRole('checkbox')[2])
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกเรือประจำ' }))
  const saved = setBoatDefaults.mock.calls[0][0]
  expect(saved.map((b: any) => [b.name, !!b.timed])).toEqual([
    ['ไต๋แขก 1', false],
    ['Speed boat', true],
    ['ต้นสน', true],
  ])
  expect(await screen.findByText(/บันทึกเรือประจำแล้ว/)).toBeInTheDocument()
})

test('removes a preset boat', async () => {
  render(<BoatDefaults />)
  await screen.findByDisplayValue('ไต๋แขก 1')
  await userEvent.click(screen.getByRole('button', { name: 'ลบเรือประจำ ไต๋แขก 1' }))
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกเรือประจำ' }))
  expect(setBoatDefaults.mock.calls[0][0]).toEqual([{ id: 'speed', name: 'Speed boat', timed: true }])
})

test('a blank name is not saved', async () => {
  render(<BoatDefaults />)
  await screen.findByDisplayValue('ไต๋แขก 1')
  await userEvent.clear(screen.getByLabelText('ชื่อเรือประจำลำที่ 1'))
  await userEvent.click(screen.getByRole('button', { name: 'บันทึกเรือประจำ' }))
  expect(setBoatDefaults).not.toHaveBeenCalled()
  expect(await screen.findByText('ใส่ชื่อเรือให้ครบทุกลำ')).toBeInTheDocument()
})

test('load fails → Thai error and retry', async () => {
  getBoatDefaults.mockRejectedValueOnce(new Error('x'))
  render(<BoatDefaults />)
  await userEvent.click(await screen.findByRole('button', { name: 'ลองใหม่' }))
  expect(await screen.findByDisplayValue('ไต๋แขก 1')).toBeInTheDocument()
})

test('presetProblem', () => {
  expect(presetProblem([])).toBe('ต้องมีเรืออย่างน้อย 1 ลำ')
  expect(presetProblem([{ id: 'a', name: 'A' }, { id: 'b', name: ' A ' }])).toBe('ชื่อเรือซ้ำกัน')
  expect(presetProblem([{ id: 'a', name: 'A' }])).toBeNull()
})
