import { listOrdersForDay } from './shipDays'

const { from, select, eq } = vi.hoisted(() => {
  const eq = vi.fn().mockResolvedValue({ data: [{ id: '1' }], error: null })
  const select = vi.fn().mockReturnValue({ eq })
  const from = vi.fn().mockReturnValue({ select })
  return { from, select, eq }
})

vi.mock('../supabase', () => ({ supabase: { from } }))

test('queries the orders table filtered by ship_date', async () => {
  const rows = await listOrdersForDay('2026-10-01')
  expect(from).toHaveBeenCalledWith('orders')
  expect(select).toHaveBeenCalledWith(
    'id,makro_order_no,customer_name_en,status,boat_id,paper_box_count,foam_box_count,sub_district,outstanding_amount,payment_method,customer_phone',
  )
  expect(eq).toHaveBeenCalledWith('ship_date', '2026-10-01')
  expect(rows).toEqual([{ id: '1' }])
})

test('throws a Thai error message when the query fails', async () => {
  eq.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
  await expect(listOrdersForDay('2026-10-01')).rejects.toThrow(/โหลดรายการออเดอร์ไม่สำเร็จ/)
})
