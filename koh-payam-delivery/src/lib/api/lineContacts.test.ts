import {
  listLineContacts,
  listPendingLineContactRequests,
  resolveLineContactRequest,
} from './lineContacts'

const calls: any[] = []
const logAction = vi.fn().mockResolvedValue(undefined)

let rows: any[] = []
let queryError: any = null
let singleData: any = null
let singleError: any = null
const updates: any[] = []

vi.mock('./audit', () => ({
  logAction: (...a: unknown[]) => logAction(...a),
}))

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
    },
    from: (t: string) => ({
      select: (sel: string) => {
        const builder: any = {}
        builder.order = (col: string, opts: any) => {
          calls.push(['select', t, sel, 'order', col, opts])
          return Promise.resolve({ data: rows, error: queryError })
        }
        builder.not = (col: string, op: string, val: any) => {
          calls.push(['select', t, sel, 'not', col, op, val])
          return {
            order: (col2: string, opts: any) => {
              calls.push(['order', col2, opts])
              return Promise.resolve({ data: rows, error: queryError })
            },
          }
        }
        builder.eq = (col: string, val: any) => {
          calls.push(['select', t, sel, 'eq', col, val])
          return {
            single: () => Promise.resolve({ data: singleData, error: singleError }),
          }
        }
        return builder
      },
      update: (patch: any) => ({
        eq: (col: string, val: any) => {
          updates.push({ patch, col, val })
          return Promise.resolve({ error: queryError })
        },
      }),
    }),
  },
}))

beforeEach(() => {
  calls.length = 0
  updates.length = 0
  rows = []
  queryError = null
  singleData = null
  singleError = null
  logAction.mockClear()
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
  const sel = calls.find((c) => c[0] === 'select' && c[1] === 'line_contacts' && c[3] === 'order')
  expect(sel[2]).toBe('phone,display_name,created_at')
  expect(sel[4]).toBe('created_at')
  expect(sel[5]).toEqual({ ascending: false })
})

test('throws the Thai error on a query failure', async () => {
  queryError = { message: 'boom' }
  await expect(listLineContacts()).rejects.toThrow(
    'โหลดรายชื่อผู้ลงทะเบียน LINE ไม่สำเร็จ: boom',
  )
})

test('listPendingLineContactRequests selects the right columns, filters pending_line_user_id not null, orders oldest-first', async () => {
  rows = [
    {
      phone: '0812345678',
      display_name: 'Somchai (old)',
      pending_display_name: 'Somchai (new)',
      pending_requested_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const result = await listPendingLineContactRequests()
  expect(result).toEqual([
    {
      phone: '0812345678',
      oldDisplayName: 'Somchai (old)',
      pendingDisplayName: 'Somchai (new)',
      requestedAt: '2026-09-10T00:00:00.000Z',
    },
  ])
  const sel = calls.find((c) => c[0] === 'select' && c[1] === 'line_contacts' && c[3] === 'not')
  expect(sel[2]).toBe('phone, display_name, pending_display_name, pending_requested_at')
  expect(sel.slice(4)).toEqual(['pending_line_user_id', 'is', null])
  const ord = calls.find((c) => c[0] === 'order')
  expect(ord).toEqual(['order', 'pending_requested_at', { ascending: true }])
})

test('listPendingLineContactRequests throws the Thai error on a query failure', async () => {
  queryError = { message: 'boom' }
  await expect(listPendingLineContactRequests()).rejects.toThrow(
    'โหลดคำขอรออนุมัติไม่สำเร็จ: boom',
  )
})

test('resolveLineContactRequest(approve) copies pending values into live columns, clears pending_*, and audits', async () => {
  singleData = {
    line_user_id: 'U_old',
    display_name: 'Somchai (old)',
    pending_line_user_id: 'U_new',
    pending_display_name: 'Somchai (new)',
  }
  await resolveLineContactRequest('0812345678', 'approve')

  const eqCall = calls.find((c) => c[0] === 'select' && c[3] === 'eq')
  expect(eqCall[2]).toBe('line_user_id, display_name, pending_line_user_id, pending_display_name')
  expect(eqCall.slice(4)).toEqual(['phone', '0812345678'])

  expect(updates).toHaveLength(1)
  expect(updates[0].patch).toEqual({
    line_user_id: 'U_new',
    display_name: 'Somchai (new)',
    pending_line_user_id: null,
    pending_display_name: null,
    pending_requested_at: null,
  })
  expect(updates[0].col).toBe('phone')
  expect(updates[0].val).toBe('0812345678')

  expect(logAction).toHaveBeenCalledWith('line_contact_approved', 'line_contact', '0812345678', {
    oldLineUserId: 'U_old',
    newLineUserId: 'U_new',
  })
})

test('resolveLineContactRequest(reject) clears only pending_*, leaves line_user_id/display_name untouched, and audits', async () => {
  singleData = {
    line_user_id: 'U_old',
    display_name: 'Somchai (old)',
    pending_line_user_id: 'U_new',
    pending_display_name: 'Somchai (new)',
  }
  await resolveLineContactRequest('0812345678', 'reject')

  expect(updates).toHaveLength(1)
  expect(updates[0].patch).toEqual({
    pending_line_user_id: null,
    pending_display_name: null,
    pending_requested_at: null,
  })

  expect(logAction).toHaveBeenCalledWith('line_contact_rejected', 'line_contact', '0812345678', {
    oldLineUserId: 'U_old',
    newLineUserId: 'U_new',
  })
})

test('resolveLineContactRequest throws a Thai error when the row is not found', async () => {
  singleData = null
  await expect(resolveLineContactRequest('0800000000', 'approve')).rejects.toThrow('ไม่พบคำขอนี้')
  expect(updates).toHaveLength(0)
})

test('resolveLineContactRequest throws a Thai error when the update fails', async () => {
  singleData = {
    line_user_id: 'U_old',
    display_name: 'Somchai (old)',
    pending_line_user_id: 'U_new',
    pending_display_name: 'Somchai (new)',
  }
  queryError = { message: 'boom' }
  await expect(resolveLineContactRequest('0812345678', 'approve')).rejects.toThrow(
    'บันทึกผลคำขอไม่สำเร็จ: boom',
  )
})
