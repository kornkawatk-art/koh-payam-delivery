import { getNavCounts } from './navCounts'

// Each query records its table and filters; the count it resolves to is
// looked up by table + the status filter.
const calls: { table: string; filters: unknown[][] }[] = []
const counts: Record<string, number | Error> = {}

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      const rec = { table, filters: [] as unknown[][] }
      calls.push(rec)
      const key = () => {
        const st = rec.filters.find((f) => f[0] === 'eq' && f[1] === 'status') ?? rec.filters.find((f) => f[0] === 'in')
        return `${table}:${st ? JSON.stringify(st[2]) : ''}`
      }
      const b: any = {
        select: (...a: unknown[]) => (rec.filters.push(['select', ...a]), b),
        eq: (...a: unknown[]) => (rec.filters.push(['eq', ...a]), b),
        in: (...a: unknown[]) => (rec.filters.push(['in', ...a]), b),
        not: (...a: unknown[]) => (rec.filters.push(['not', ...a]), b),
        then: (res: (v: unknown) => void, rej: (e: unknown) => void) => {
          const v = counts[key()] ?? 0
          return v instanceof Error
            ? Promise.reject(v).then(res, rej)
            : Promise.resolve({ count: v, error: null }).then(res, rej)
        },
      }
      return b
    },
  },
}))

beforeEach(() => {
  calls.length = 0
  for (const k of Object.keys(counts)) delete counts[k]
})

test("a packer only gets today's not-packed count, store pickups excluded", async () => {
  counts['orders:"imported"'] = 4
  expect(await getNavCounts('packer', '2026-10-04')).toEqual({ '/': 4 })
  expect(calls.map((c) => c.table)).toEqual(['orders'])
  expect(calls[0].filters).toEqual(
    expect.arrayContaining([
      ['eq', 'ship_date', '2026-10-04'],
      ['eq', 'is_pickup', false],
      ['eq', 'status', 'imported'],
    ]),
  )
})

test('a manager also gets pier, open claims and pending LINE; zeros are dropped', async () => {
  counts['orders:"imported"'] = 0
  counts['orders:["packed","at_pier"]'] = 3
  counts['claims:"open"'] = 2
  counts['line_contacts:'] = 1
  expect(await getNavCounts('manager', '2026-10-04')).toEqual({
    '/pier': 3,
    '/claims': 2,
    '/line-contacts': 1,
  })
  const line = calls.find((c) => c.table === 'line_contacts')!
  expect(line.filters).toContainEqual(['not', 'pending_line_user_id', 'is', null])
})

test('one failing count leaves the others intact', async () => {
  counts['orders:"imported"'] = 2
  counts['claims:"open"'] = new Error('boom')
  expect(await getNavCounts('manager', '2026-10-04')).toEqual({ '/': 2 })
})
