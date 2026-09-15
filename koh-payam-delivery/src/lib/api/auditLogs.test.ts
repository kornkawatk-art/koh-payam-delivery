import { listAuditLogs } from './auditLogs'

const calls: any[] = []
let auditRows: any[] = []
let auditError: any = null
let ordersData: any[] = []
let claimsData: any[] = []
let shipDaysData: any[] = []
let profilesData: any[] = []

function inTable(table: string, dataGetter: () => any[]) {
  return {
    select: (sel: string) => {
      calls.push(['select', table, sel])
      return {
        in: (col: string, ids: any[]) => {
          calls.push(['in', table, col, ids])
          return Promise.resolve({ data: dataGetter(), error: null })
        },
      }
    },
  }
}

vi.mock('../supabase', () => ({
  supabase: {
    from: (table: string) => {
      switch (table) {
        case 'audit_logs':
          return {
            select: (sel: string) => {
              calls.push(['select', table, sel])
              return {
                order: (col: string, opts: any) => {
                  calls.push(['order', col, opts])
                  return {
                    limit: (n: number) => {
                      calls.push(['limit', n])
                      return Promise.resolve({ data: auditRows, error: auditError })
                    },
                  }
                },
              }
            },
          }
        case 'orders':
          return inTable(table, () => ordersData)
        case 'claims':
          return inTable(table, () => claimsData)
        case 'ship_days':
          return inTable(table, () => shipDaysData)
        case 'profiles':
          return inTable(table, () => profilesData)
        default:
          throw new Error('unexpected table ' + table)
      }
    },
  },
}))

beforeEach(() => {
  calls.length = 0
  auditRows = []
  auditError = null
  ordersData = []
  claimsData = []
  shipDaysData = []
  profilesData = []
})

// A single order + profile shared by most row templates below.
const ORDER = { id: 'o1', makro_order_no: 'PO-1', ship_day_id: 'sd1' }
const PROFILE = { id: 'u1', name: 'สมชาย' }

test('query shape: selects the right columns, orders created_at desc, caps at 1000', async () => {
  auditRows = []
  await listAuditLogs()
  const sel = calls.find((c) => c[0] === 'select' && c[1] === 'audit_logs')
  expect(sel[2]).toBe('id, user_id, action, entity_type, entity_id, meta, created_at')
  const ord = calls.find((c) => c[0] === 'order')
  expect(ord).toEqual(['order', 'created_at', { ascending: false }])
  const lim = calls.find((c) => c[0] === 'limit')
  expect(lim).toEqual(['limit', 1000])
})

test('throws the Thai error on a query failure', async () => {
  auditError = { message: 'boom' }
  await expect(listAuditLogs()).rejects.toThrow('โหลดประวัติการใช้งานไม่สำเร็จ: boom')
})

test('action: import', async () => {
  profilesData = [PROFILE]
  auditRows = [
    {
      id: 1,
      user_id: 'u1',
      action: 'import',
      entity_type: 'ship_day',
      entity_id: 'sd1',
      meta: { shipDate: '2026-09-10', created: 5, synced: 2 },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe(
    'นำเข้าออเดอร์วันที่ 2026-09-10 — ใหม่ 5 รายการ · sync 2 รายการ โดย สมชาย',
  )
  expect(rows[0].id).toBe(1)
  expect(rows[0].createdAt).toBe('2026-09-10T00:00:00.000Z')
})

test('action: status_change', async () => {
  ordersData = [ORDER]
  profilesData = [PROFILE]
  auditRows = [
    {
      id: 2,
      user_id: 'u1',
      action: 'status_change',
      entity_type: 'order',
      entity_id: 'o1',
      meta: { from: 'imported', to: 'packed' },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe(
    'เปลี่ยนสถานะออเดอร์ PO-1 จาก "นำเข้าแล้ว" → "แพ็คเสร็จ" โดย สมชาย',
  )
})

test('action: boat_set resolves a real boat name from ship_days.boats', async () => {
  ordersData = [ORDER]
  profilesData = [PROFILE]
  shipDaysData = [
    { id: 'sd1', boats: [{ id: '1', name: 'เรือ 1' }, { id: '2', name: 'เรือ 2' }] },
  ]
  auditRows = [
    {
      id: 3,
      user_id: 'u1',
      action: 'boat_set',
      entity_type: 'order',
      entity_id: 'o1',
      meta: { boatId: '1' },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('เลือกเรือ 1ให้ออเดอร์ PO-1 โดย สมชาย')
})

test('action: boat_set falls back to "เรือ #id" when the boat is not found in ship_days.boats', async () => {
  ordersData = [ORDER]
  profilesData = [PROFILE]
  shipDaysData = [{ id: 'sd1', boats: [{ id: '1', name: 'เรือ 1' }] }]
  auditRows = [
    {
      id: 3,
      user_id: 'u1',
      action: 'boat_set',
      entity_type: 'order',
      entity_id: 'o1',
      meta: { boatId: '99' },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('เลือกเรือ #99ให้ออเดอร์ PO-1 โดย สมชาย')
})

test('action: pier_name_set', async () => {
  ordersData = [ORDER]
  profilesData = [PROFILE]
  auditRows = [
    {
      id: 4,
      user_id: 'u1',
      action: 'pier_name_set',
      entity_type: 'order',
      entity_id: 'o1',
      meta: { pierName: 'สมหญิง' },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('บันทึกชื่อคนลงเรือ "สมหญิง" ให้ออเดอร์ PO-1 โดย สมชาย')
})

test('action: regen_link', async () => {
  ordersData = [ORDER]
  profilesData = [PROFILE]
  auditRows = [
    {
      id: 5,
      user_id: 'u1',
      action: 'regen_link',
      entity_type: 'order',
      entity_id: 'o1',
      meta: null,
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('สร้างลิงก์ลูกค้าใหม่ให้ออเดอร์ PO-1 โดย สมชาย')
})

test('action: order_deleted uses only its own camelCase meta, no order lookup', async () => {
  profilesData = [PROFILE]
  auditRows = [
    {
      id: 6,
      user_id: 'u1',
      action: 'order_deleted',
      entity_type: 'order',
      entity_id: 'o-gone',
      meta: {
        makroOrderNo: 'PO-9',
        customerNameEn: 'John',
        status: 'imported',
        shipDate: '2026-09-01',
      },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('ลบออเดอร์ PO-9 (John) ถาวร — กำหนดส่ง 2026-09-01 โดย สมชาย')
  // No orders lookup at all -- order_deleted's entity_id must be excluded
  // from the batched orders query.
  expect(calls.find((c) => c[0] === 'select' && c[1] === 'orders')).toBeUndefined()
})

test('action: pack_saved', async () => {
  ordersData = [ORDER]
  profilesData = [PROFILE]
  auditRows = [
    {
      id: 7,
      user_id: 'u1',
      action: 'pack_saved',
      entity_type: 'order',
      entity_id: 'o1',
      meta: { paperCount: 2, foamCount: 1, pieceCount: 10, packerName: 'X' },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe(
    'บันทึกแพ็คออเดอร์ PO-1 — ลังกระดาษ 2 · ลังโฟม 1 · ชิ้น 10 โดย สมชาย',
  )
})

test('action: claim_submitted resolves the order number via the claims->orders join, no "โดย" clause', async () => {
  claimsData = [{ id: 'c1', orders: { makro_order_no: 'PO-1' } }]
  auditRows = [
    {
      id: 8,
      user_id: null,
      action: 'claim_submitted',
      entity_type: 'claim',
      entity_id: 'c1',
      meta: { orderId: 'o1' },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('ลูกค้ายื่นเคลม — ออเดอร์ PO-1')
})

test('action: claim_resolved (approved + refund)', async () => {
  claimsData = [{ id: 'c1', orders: { makro_order_no: 'PO-1' } }]
  profilesData = [PROFILE]
  auditRows = [
    {
      id: 9,
      user_id: 'u1',
      action: 'claim_resolved',
      entity_type: 'claim',
      entity_id: 'c1',
      meta: { decision: 'approved', resolution: 'refund' },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('หัวหน้าอนุมัติเคลม — ออเดอร์ PO-1 (คืนเงิน) โดย สมชาย')
})

test('action: claim_resolved (rejected, no resolution clause)', async () => {
  claimsData = [{ id: 'c1', orders: { makro_order_no: 'PO-1' } }]
  profilesData = [PROFILE]
  auditRows = [
    {
      id: 10,
      user_id: 'u1',
      action: 'claim_resolved',
      entity_type: 'claim',
      entity_id: 'c1',
      meta: { decision: 'rejected' },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('หัวหน้าปฏิเสธเคลม — ออเดอร์ PO-1 โดย สมชาย')
})

test('action: claim_resolved (approved + resend_next_day + resendBackorderFailed appends the warning)', async () => {
  claimsData = [{ id: 'c1', orders: { makro_order_no: 'PO-1' } }]
  profilesData = [PROFILE]
  auditRows = [
    {
      id: 11,
      user_id: 'u1',
      action: 'claim_resolved',
      entity_type: 'claim',
      entity_id: 'c1',
      meta: { decision: 'approved', resolution: 'resend_next_day', resendBackorderFailed: true },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe(
    'หัวหน้าอนุมัติเคลม — ออเดอร์ PO-1 (ส่งชดเชยวันถัดไป) โดย สมชาย ⚠️ สร้างรายการส่งชดเชยไม่สำเร็จ',
  )
})

test('action: claim_auto_closed -- system-triggered, no "โดย" clause', async () => {
  claimsData = [{ id: 'c1', orders: { makro_order_no: 'PO-1' } }]
  auditRows = [
    {
      id: 12,
      user_id: null,
      action: 'claim_auto_closed',
      entity_type: 'claim',
      entity_id: 'c1',
      meta: { trigger: 'resend_fulfilled' },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe(
    'ปิดงานเคลมอัตโนมัติ — ออเดอร์ PO-1 (ของชดเชยส่งถึงลูกค้าแล้ว)',
  )
})

test('action: line_contact_registered (replacedExisting true)', async () => {
  auditRows = [
    {
      id: 13,
      user_id: null,
      action: 'line_contact_registered',
      entity_type: 'line_contact',
      entity_id: '0812345678',
      meta: { replacedExisting: true },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('เบอร์ 0812345678 อัปเดตชื่อ LINE (บัญชีเดิม)')
})

test('action: line_contact_registered (replacedExisting false)', async () => {
  auditRows = [
    {
      id: 13,
      user_id: null,
      action: 'line_contact_registered',
      entity_type: 'line_contact',
      entity_id: '0812345678',
      meta: { replacedExisting: false },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('เบอร์ 0812345678 ลงทะเบียนผูก LINE ครั้งแรก')
})

test('action: line_contact_pending_created', async () => {
  auditRows = [
    {
      id: 14,
      user_id: null,
      action: 'line_contact_pending_created',
      entity_type: 'line_contact',
      entity_id: '0812345678',
      meta: { oldLineUserId: 'U_old' },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('เบอร์ 0812345678 มีคำขอผูก LINE บัญชีใหม่ รอหัวหน้าตรวจสอบ')
})

test('action: line_contact_approved', async () => {
  profilesData = [PROFILE]
  auditRows = [
    {
      id: 15,
      user_id: 'u1',
      action: 'line_contact_approved',
      entity_type: 'line_contact',
      entity_id: '0812345678',
      meta: { oldLineUserId: 'U_old', newLineUserId: 'U_new' },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('หัวหน้าอนุมัติคำขอเปลี่ยน LINE ของเบอร์ 0812345678 โดย สมชาย')
})

test('action: line_contact_rejected', async () => {
  profilesData = [PROFILE]
  auditRows = [
    {
      id: 16,
      user_id: 'u1',
      action: 'line_contact_rejected',
      entity_type: 'line_contact',
      entity_id: '0812345678',
      meta: { oldLineUserId: 'U_old', newLineUserId: 'U_new' },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('หัวหน้าปฏิเสธคำขอเปลี่ยน LINE ของเบอร์ 0812345678 โดย สมชาย')
})

test('an unknown 15th action falls back to "action (entity_type)" instead of crashing', async () => {
  auditRows = [
    {
      id: 17,
      user_id: null,
      action: 'some_new_action',
      entity_type: 'widget',
      entity_id: 'w1',
      meta: null,
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('some_new_action (widget)')
})

test('a missing profiles row falls back to "ทีมงาน" instead of a raw id', async () => {
  ordersData = [ORDER]
  profilesData = [] // u1 not found -- deleted account
  auditRows = [
    {
      id: 18,
      user_id: 'u1',
      action: 'regen_link',
      entity_type: 'order',
      entity_id: 'o1',
      meta: null,
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows[0].message).toBe('สร้างลิงก์ลูกค้าใหม่ให้ออเดอร์ PO-1 โดย ทีมงาน')
})

test('batched lookups fire once each for a page of rows sharing the same order/claim/user, not once per row', async () => {
  ordersData = [ORDER]
  claimsData = [{ id: 'c1', orders: { makro_order_no: 'PO-1' } }]
  profilesData = [PROFILE]
  auditRows = [
    {
      id: 20,
      user_id: 'u1',
      action: 'pier_name_set',
      entity_type: 'order',
      entity_id: 'o1',
      meta: { pierName: 'A' },
      created_at: '2026-09-10T00:00:00.000Z',
    },
    {
      id: 21,
      user_id: 'u1',
      action: 'regen_link',
      entity_type: 'order',
      entity_id: 'o1',
      meta: null,
      created_at: '2026-09-10T00:01:00.000Z',
    },
    {
      id: 22,
      user_id: 'u1',
      action: 'claim_resolved',
      entity_type: 'claim',
      entity_id: 'c1',
      meta: { decision: 'rejected' },
      created_at: '2026-09-10T00:02:00.000Z',
    },
    {
      id: 23,
      user_id: 'u1',
      action: 'claim_auto_closed',
      entity_type: 'claim',
      entity_id: 'c1',
      meta: { trigger: 'resend_fulfilled' },
      created_at: '2026-09-10T00:03:00.000Z',
    },
  ]
  const rows = await listAuditLogs()
  expect(rows).toHaveLength(4)
  const orderInCalls = calls.filter((c) => c[0] === 'in' && c[1] === 'orders')
  const claimInCalls = calls.filter((c) => c[0] === 'in' && c[1] === 'claims')
  const profileInCalls = calls.filter((c) => c[0] === 'in' && c[1] === 'profiles')
  expect(orderInCalls).toHaveLength(1)
  expect(orderInCalls[0][3]).toEqual(['o1'])
  expect(claimInCalls).toHaveLength(1)
  expect(claimInCalls[0][3]).toEqual(['c1'])
  expect(profileInCalls).toHaveLength(1)
  expect(profileInCalls[0][3]).toEqual(['u1'])
})

test('no lookup queries fire at all when no row in the page needs them', async () => {
  auditRows = [
    {
      id: 24,
      user_id: null,
      action: 'line_contact_pending_created',
      entity_type: 'line_contact',
      entity_id: '0812345678',
      meta: { oldLineUserId: null },
      created_at: '2026-09-10T00:00:00.000Z',
    },
  ]
  await listAuditLogs()
  expect(calls.find((c) => c[0] === 'select' && c[1] === 'orders')).toBeUndefined()
  expect(calls.find((c) => c[0] === 'select' && c[1] === 'claims')).toBeUndefined()
  expect(calls.find((c) => c[0] === 'select' && c[1] === 'ship_days')).toBeUndefined()
  expect(calls.find((c) => c[0] === 'select' && c[1] === 'profiles')).toBeUndefined()
})
