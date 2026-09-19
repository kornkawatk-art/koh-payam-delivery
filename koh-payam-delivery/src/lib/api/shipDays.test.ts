import { listOrdersForDay, sendOrderLinks } from './shipDays'

const { from, select, eq, getSession } = vi.hoisted(() => {
  const eq = vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  const getSession = vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
  return { from, select, eq, getSession }
})

vi.mock('../supabase', () => ({ supabase: { from, auth: { getSession } } }))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ sent: 3, failed: 1, skipped: false }),
  })
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('queries the orders table filtered by ship_date', async () => {
  const rows = await listOrdersForDay('2026-10-01')
  expect(from).toHaveBeenCalledWith('orders')
  expect(select).toHaveBeenCalledWith(
    'id,makro_order_no,customer_name_en,status,boat_id,paper_box_count,foam_box_count,piece_count,sub_district,outstanding_amount,payment_method,customer_phone,packer_name,pier_name,packed_with_order_id,packed_with:orders!packed_with_order_id(makro_order_no)',
  )
  expect(eq).toHaveBeenCalledWith('ship_date', '2026-10-01')
  expect(rows).toEqual([{ id: '1' }])
})

test('throws a Thai error message when the query fails', async () => {
  eq.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  await expect(listOrdersForDay('2026-10-01')).rejects.toThrow(/โหลดรายการออเดอร์ไม่สำเร็จ/)
})

test('sendOrderLinks POSTs to the edge function with the session bearer token and returns the parsed counts', async () => {
  const result = await sendOrderLinks('2026-10-01')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toEqual(expect.stringContaining('/functions/v1/send-order-links'))
  expect(init.method).toBe('POST')
  expect(init.headers.Authorization).toBe('Bearer tok-123')
  expect(JSON.parse(init.body)).toEqual({ shipDate: '2026-10-01' })
  expect(result).toEqual({ sent: 3, failed: 1, skipped: false })
})

test('sendOrderLinks throws a Thai error carrying the status code on a non-ok response', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({}) })
  await expect(sendOrderLinks('2026-10-01')).rejects.toThrow('ส่งลิงก์ไลน์ไม่สำเร็จ (403)')
})
