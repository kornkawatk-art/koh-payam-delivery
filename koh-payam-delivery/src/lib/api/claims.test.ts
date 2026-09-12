import { listClaims, getClaim, resolveClaim } from './claims'

const createResendBackorder = vi.fn().mockResolvedValue(undefined)
const logAction = vi.fn().mockResolvedValue(undefined)

vi.mock('./backorders', () => ({
  createResendBackorder: (...a: unknown[]) => createResendBackorder(...a),
}))
vi.mock('./audit', () => ({
  logAction: (...a: unknown[]) => logAction(...a),
}))

const state = {
  listData: [] as any[],
  singleData: { description: '' } as any,
  error: null as any,
  selectArgs: [] as string[],
  orderArgs: [] as any[],
  eqArgs: [] as any[],
  updates: [] as any[],
}

vi.mock('../supabase', () => {
  const selectBuilder = () => {
    const b: any = {}
    b.order = (col: string, opts: any) => {
      state.orderArgs.push([col, opts])
      const p: any = Promise.resolve({ data: state.listData, error: state.error })
      p.eq = (c2: string, v2: any) => {
        state.eqArgs.push([c2, v2])
        return Promise.resolve({ data: state.listData, error: state.error })
      }
      return p
    }
    b.eq = (col: string, val: any) => {
      state.eqArgs.push([col, val])
      return {
        single: () => Promise.resolve({ data: state.singleData, error: state.error }),
      }
    }
    return b
  }
  return {
    supabase: {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }),
      },
      from: () => ({
        select: (sel: string) => {
          state.selectArgs.push(sel)
          return selectBuilder()
        },
        update: (patch: any) => ({
          eq: (col: string, val: any) => {
            state.updates.push({ patch, col, val })
            return Promise.resolve({ error: state.error })
          },
        }),
      }),
    },
  }
})

beforeEach(() => {
  createResendBackorder.mockClear()
  logAction.mockClear()
  state.listData = []
  state.singleData = { description: '' }
  state.error = null
  state.selectArgs = []
  state.orderArgs = []
  state.eqArgs = []
  state.updates = []
})

test('listClaims flattens the order join, counts claim_items, and sorts by deadline asc', async () => {
  state.listData = [
    {
      id: 'c1',
      order_id: 'o1',
      type: 'damaged',
      status: 'open',
      deadline_at: '2026-09-01T00:00:00Z',
      created_at: '2026-08-30T00:00:00Z',
      orders: { makro_order_no: 'PO-1', customer_name_en: 'BLUE VIEW' },
      claim_items: [{ id: 'ci1' }],
    },
  ]
  const rows = await listClaims({ status: 'open' })
  expect(state.orderArgs[0]).toEqual(['deadline_at', { ascending: true }])
  expect(state.eqArgs).toContainEqual(['status', 'open'])
  expect(rows[0]).toEqual({
    id: 'c1',
    order_id: 'o1',
    type: 'damaged',
    itemCount: 1,
    status: 'open',
    deadline_at: '2026-09-01T00:00:00Z',
    created_at: '2026-08-30T00:00:00Z',
    makro_order_no: 'PO-1',
    customer_name_en: 'BLUE VIEW',
  })
})

test('listClaims counts zero claim_items as itemCount 0 (e.g. box_lost)', async () => {
  state.listData = [
    {
      id: 'c2',
      order_id: 'o2',
      type: 'box_lost',
      status: 'open',
      deadline_at: '2026-09-01T00:00:00Z',
      created_at: '2026-08-30T00:00:00Z',
      orders: { makro_order_no: 'PO-2', customer_name_en: 'SUNSET' },
      claim_items: [],
    },
  ]
  const rows = await listClaims()
  expect(rows[0].itemCount).toBe(0)
})

test('listClaims without a status filter never calls eq', async () => {
  await listClaims()
  expect(state.eqArgs).toHaveLength(0)
})

test('getClaim selects claim_items with product_name, without any price column', async () => {
  state.singleData = { id: 'c1', description: '' }
  await getClaim('c1')
  expect(
    state.selectArgs.some((s) => s.includes('claim_items(qty,order_items(product_name))')),
  ).toBe(true)
  expect(state.selectArgs.some((s) => /price|value_cached/.test(s))).toBe(false)
})

test('getClaim throws a Thai message when the load fails', async () => {
  state.error = { message: 'boom' }
  await expect(getClaim('c1')).rejects.toThrow('โหลดเคลมไม่สำเร็จ')
})

test('resolveClaim: approved + resend_next_day creates a compensating backorder', async () => {
  await resolveClaim('c1', { decision: 'approved', resolution: 'resend_next_day' })
  expect(createResendBackorder).toHaveBeenCalledWith('c1')
  expect(state.updates[0].patch).toMatchObject({
    status: 'approved',
    resolution: 'resend_next_day',
    refund_amount: 0,
    resolved_by: 'u1',
  })
})

test('resolveClaim: approved + refund does not create a backorder and stores the amount', async () => {
  await resolveClaim('c1', { decision: 'approved', resolution: 'refund', refundAmount: 100 })
  expect(createResendBackorder).not.toHaveBeenCalled()
  expect(state.updates[0].patch).toMatchObject({
    status: 'approved',
    resolution: 'refund',
    refund_amount: 100,
  })
})

test('resolveClaim: rejected sets status rejected, no backorder, zero refund', async () => {
  await resolveClaim('c1', { decision: 'rejected' })
  expect(createResendBackorder).not.toHaveBeenCalled()
  expect(state.updates[0].patch).toMatchObject({
    status: 'rejected',
    resolution: null,
    refund_amount: 0,
  })
})

test('resolveClaim appends a non-empty note under the team prefix', async () => {
  state.singleData = { description: 'ลูกค้าแจ้งของเสีย' }
  await resolveClaim('c1', {
    decision: 'approved',
    resolution: 'refund',
    refundAmount: 50,
    note: 'ตรวจแล้วจริง',
  })
  expect(state.updates[0].patch.description).toBe('ลูกค้าแจ้งของเสีย\n[ทีม] ตรวจแล้วจริง')
})

test('resolveClaim leaves description untouched when no note is given', async () => {
  state.singleData = { description: 'เดิม' }
  await resolveClaim('c1', { decision: 'approved', resolution: 'refund', refundAmount: 50 })
  expect('description' in state.updates[0].patch).toBe(false)
})

test('resolveClaim writes a claim_resolved audit log', async () => {
  await resolveClaim('c1', { decision: 'approved', resolution: 'refund', refundAmount: 50 })
  expect(logAction).toHaveBeenCalledWith('claim_resolved', 'claim', 'c1', {
    decision: 'approved',
    resolution: 'refund',
  })
})

test('resolveClaim: approved + refund with no amount stores 0', async () => {
  await resolveClaim('c1', { decision: 'approved', resolution: 'refund' })
  expect(state.updates[0].patch).toMatchObject({
    status: 'approved',
    resolution: 'refund',
    refund_amount: 0,
  })
})

test('resolveClaim: a non-finite refund amount is coerced to 0', async () => {
  await resolveClaim('c1', {
    decision: 'approved',
    resolution: 'refund',
    refundAmount: Number('abc'),
  })
  expect(state.updates[0].patch.refund_amount).toBe(0)
})

test('resolveClaim throws when the claim does not exist', async () => {
  state.singleData = null
  await expect(
    resolveClaim('missing', { decision: 'approved', resolution: 'refund', refundAmount: 10 }),
  ).rejects.toThrow('ไม่พบเคลม')
  expect(state.updates).toHaveLength(0)
  expect(createResendBackorder).not.toHaveBeenCalled()
})

test('resolveClaim: a failed resend backorder still audits (flagged) and throws a Thai error', async () => {
  createResendBackorder.mockRejectedValueOnce(new Error('boom'))
  await expect(
    resolveClaim('c1', { decision: 'approved', resolution: 'resend_next_day' }),
  ).rejects.toThrow('สร้างรายการส่งชดเชยไม่สำเร็จ')
  expect(logAction).toHaveBeenCalledWith('claim_resolved', 'claim', 'c1', {
    decision: 'approved',
    resolution: 'resend_next_day',
    resendBackorderFailed: true,
  })
  // the successful-path audit call must NOT also fire
  expect(logAction).toHaveBeenCalledTimes(1)
})
