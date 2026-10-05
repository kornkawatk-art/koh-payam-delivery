import { daysAgoISO, fetchAll, PAGE_SIZE } from './fetchAll'

test('fetchAll keeps asking for the next page until one comes back short', async () => {
  const total = PAGE_SIZE * 2 + 5
  const asked: [number, number][] = []
  const rows = await fetchAll(async (from, to) => {
    asked.push([from, to])
    const n = Math.max(0, Math.min(to, total - 1) - from + 1)
    return { data: Array.from({ length: n }, (_, i) => from + i), error: null }
  })
  expect(rows).toHaveLength(total)
  expect(rows[total - 1]).toBe(total - 1)
  expect(asked).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ])
})

test('fetchAll: a small result is one request; an error is thrown', async () => {
  const page = vi.fn().mockResolvedValue({ data: [1, 2], error: null })
  expect(await fetchAll(page)).toEqual([1, 2])
  expect(page).toHaveBeenCalledTimes(1)
  await expect(fetchAll(async () => ({ data: null, error: new Error('boom') }))).rejects.toThrow('boom')
})

test('daysAgoISO counts calendar days back', () => {
  expect(daysAgoISO(0, new Date(2026, 9, 5))).toBe('2026-10-05')
  expect(daysAgoISO(10, new Date(2026, 9, 5))).toBe('2026-09-25')
})
