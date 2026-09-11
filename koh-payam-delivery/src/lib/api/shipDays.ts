import { supabase } from '../supabase'

export async function getOrCreateShipDay(shipDate: string) {
  const { data: found } = await supabase
    .from('ship_days')
    .select('id,boats')
    .eq('ship_date', shipDate)
    .maybeSingle()
  if (found) return found as { id: string; boats: { id: string; name: string }[] }
  const { data, error } = await supabase
    .from('ship_days')
    .insert({ ship_date: shipDate })
    .select('id,boats')
    .single()
  if (error) throw new Error('สร้างรอบจัดส่งไม่สำเร็จ: ' + error.message)
  return data as { id: string; boats: { id: string; name: string }[] }
}

export async function setBoats(shipDayId: string, boats: { id: string; name: string }[]) {
  const { error } = await supabase.from('ship_days').update({ boats }).eq('id', shipDayId)
  if (error) throw new Error('บันทึกรายการเรือไม่สำเร็จ: ' + error.message)
}

export async function listOrdersForDay(shipDate: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id,makro_order_no,customer_name_en,status,boat_id,paper_box_count,foam_box_count,piece_count,sub_district,outstanding_amount,payment_method,customer_phone',
    )
    .eq('ship_date', shipDate)
  if (error) throw new Error('โหลดรายการออเดอร์ไม่สำเร็จ: ' + error.message)
  return (data ?? []) as any[]
}
