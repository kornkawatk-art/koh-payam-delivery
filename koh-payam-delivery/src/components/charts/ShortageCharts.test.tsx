import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DeptBarChart, TrendColumnChart } from './ShortageCharts'

const bars = [
  { code: 'FZ' as const, label: 'FZ', occurrences: 6, products: 3 },
  { code: 'FV' as const, label: 'FV', occurrences: 2, products: 1 },
]

test('department bars: one labeled button per department with its count, in the given order', () => {
  render(<DeptBarChart bars={bars} active="ALL" onSelect={() => {}} />)
  const buttons = screen.getAllByRole('button')
  expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
    'FZ: ขาด 6 ครั้ง, 3 รายการ',
    'FV: ขาด 2 ครั้ง, 1 รายการ',
  ])
})

test('department bars: tapping selects that department; tapping the selected one clears the filter', async () => {
  const onSelect = vi.fn()
  const { rerender } = render(<DeptBarChart bars={bars} active="ALL" onSelect={onSelect} />)
  await userEvent.click(screen.getByRole('button', { name: /^FV/ }))
  expect(onSelect).toHaveBeenLastCalledWith('FV')

  rerender(<DeptBarChart bars={bars} active="FV" onSelect={onSelect} />)
  expect(screen.getByRole('button', { name: /^FV/ })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: /^FV/ }))
  expect(onSelect).toHaveBeenLastCalledWith('ALL')
})

const trend = {
  unit: 'day' as const,
  buckets: [
    { start: '2026-09-01', end: '2026-09-01', count: 1 },
    { start: '2026-09-02', end: '2026-09-02', count: 4 },
    { start: '2026-09-03', end: '2026-09-03', count: 0 },
  ],
}

test('trend: the readout shows the peak by default, and a focused column replaces it', async () => {
  const { container } = render(<TrendColumnChart trend={trend} />)
  const readout = container.querySelector('[aria-live]')!
  expect(readout).toHaveTextContent(/^4ครั้ง/)
  expect(readout).toHaveTextContent('(สูงสุด)')

  fireEvent.focus(screen.getAllByRole('button')[0])
  expect(readout).toHaveTextContent(/^1ครั้ง/)
  expect(readout).not.toHaveTextContent('(สูงสุด)')
})

test('trend: every column is a labeled button, and a screen-reader table lists every value', () => {
  render(<TrendColumnChart trend={trend} />)
  expect(screen.getAllByRole('button')).toHaveLength(3)
  const table = screen.getByRole('table')
  expect(within(table).getAllByRole('row')).toHaveLength(4) // header + 3 days
})

test('trend: a range with no shortages says so instead of showing a zero peak', () => {
  render(
    <TrendColumnChart
      trend={{ unit: 'day', buckets: [{ start: '2026-09-01', end: '2026-09-01', count: 0 }] }}
    />,
  )
  expect(screen.getByText('ไม่มีของขาดในช่วงนี้')).toBeInTheDocument()
})

test('trend: an empty range (e.g. a date field cleared mid-edit) renders without crashing', () => {
  render(<TrendColumnChart trend={{ unit: 'day', buckets: [] }} />)
  expect(screen.getByText('ไม่มีของขาดในช่วงนี้')).toBeInTheDocument()
})
