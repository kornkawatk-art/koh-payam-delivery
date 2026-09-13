import { listLineContacts } from './lineContacts'

const calls: any[] = []
let rows: any[] = []
let queryError: any = null

vi.mock('../supabase', () => ({
  supabase: {
    from: (t: string) => ({
      select: (sel: string) => ({
        order: (col: string, opts: any) => {
          calls.push(['select', t, sel, col, opts])
          return Promise.resolve({ data: rows, error: queryError })
        },
      }),
    }),
  },
}))

beforeEach(() => {
  calls.length = 0
  rows = []
  queryError = null
})

test('returns mapped rows in the order the query gives them, ordered created_at desc', async () => {
  rows = [
    { phone: '0812345678', display_name: 'Somchai', created_at: '2026-09-10T00:00:00.000Z' },
    { phone: '0899999999', display_name: null, created_at: '2026-09-01T00:00:00.000Z' },
  ]
  const result = await listLineContacts()
  expect(result).toEqual([
    { phone: '0812345678', displayName: 'Somchai', createdAt: '2026-09-10T00:00:00.000Z' },
    { phone: '0899999999', displayName: null, createdAt: '2026-09-01T00:00:00.000Z' },
  ])
  const sel = calls.find((c) => c[0] === 'select' && c[1] === 'line_contacts')
  expect(sel[2]).toBe('phone,display_name,created_at')
  expect(sel[3]).toBe('created_at')
  expect(sel[4]).toEqual({ ascending: false })
})

test('throws the Thai error on a query failure', async () => {
  queryError = { message: 'boom' }
  await expect(listLineContacts()).rejects.toThrow(
    'โหลดรายชื่อผู้ลงทะเบียน LINE ไม่สำเร็จ: boom',
  )
})
