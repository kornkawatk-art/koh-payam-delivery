import { pickQuality } from './image'

test('picks the highest quality within budget', () => {
  // simulated size: higher q = bigger file
  const sizeAt = (q: number) => Math.round(q * 500_000)
  expect(pickQuality(sizeAt, 200_000)).toBeCloseTo(0.4, 1)
})

test('falls back to lowest quality if none fit', () => {
  const sizeAt = () => 999_999
  expect(pickQuality(sizeAt, 200_000)).toBe(0.5)
})
