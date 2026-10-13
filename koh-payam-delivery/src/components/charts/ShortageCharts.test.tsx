import { fireEvent, render, screen, within } from '@testing-library/react'
import { TrendColumnChart, rampClass } from './ShortageCharts'

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

test('rampClass: color follows magnitude -- chart-1 for the lowest third, chart-3 for the top third', () => {
  expect(rampClass(1, 9)).toBe('bg-chart-1')
  expect(rampClass(3, 9)).toBe('bg-chart-1')
  expect(rampClass(5, 9)).toBe('bg-chart-2')
  expect(rampClass(9, 9)).toBe('bg-chart-3')
  expect(rampClass(0, 0)).toBe('bg-chart-1')
})

test('the trend chart shows the น้อย-มาก color key', () => {
  render(<TrendColumnChart trend={trend} />)
  expect(screen.getByText(/น้อย/)).toBeInTheDocument()
})
