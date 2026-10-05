import { listDistinctPierNames, NAME_SUGGESTION_DAYS } from './orders'
import { listDistinctPackerNames } from './pack'
import { daysAgoISO } from './fetchAll'

// Records the query and serves `rows` through range(), like PostgREST.
const seen: unknown[][] = []
let rows: Record<string, string | null>[] = []
vi.mock('../supabase', () => ({
  supabase: {
    from: (t: string) => {
      seen.push(['from', t])
      const b: any = {
        select: (c: string) => (seen.push(['select', c]), b),
        not: (...a: unknown[]) => (seen.push(['not', ...a]), b),
        gte: (...a: unknown[]) => (seen.push(['gte', ...a]), b),
        order: () => b,
        range: (lo: number, hi: number) => Promise.resolve({ data: rows.slice(lo, hi + 1), error: null }),
      }
      return b
    },
  },
}))

beforeEach(() => {
  seen.length = 0
})

test('pier name suggestions: distinct, sorted, from recent orders only', async () => {
  rows = [{ pier_name: 'สมหญิง' }, { pier_name: 'บุญมี' }, { pier_name: 'สมหญิง' }]
  expect(await listDistinctPierNames()).toEqual(['บุญมี', 'สมหญิง'])
  expect(seen).toContainEqual(['gte', 'ship_date', daysAgoISO(NAME_SUGGESTION_DAYS)])
})

test('packer name suggestions read past 1000 rows', async () => {
  rows = [...Array.from({ length: 1000 }, () => ({ packer_name: 'สมชาย' })), { packer_name: 'คนใหม่' }]
  expect(await listDistinctPackerNames()).toEqual(['คนใหม่', 'สมชาย'])
  expect(seen).toContainEqual(['gte', 'ship_date', daysAgoISO(NAME_SUGGESTION_DAYS)])
})
