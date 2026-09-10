import { supabase } from '../supabase'
import { syncShortageBackorders } from './backorders'
import { logAction } from './audit'

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export function computeShortageValue(
  items: { unit_price: number; qty_ordered: number; status: string }[],
): number {
  return round2(
    items
      .filter((i) => i.status === 'short')
      .reduce((s, i) => s + i.unit_price * i.qty_ordered, 0),
  )
}

export type PackInput = {
  orderId: string
  items: { id: string; status: 'ok' | 'short'; qtyShipped: number }[]
  paperCount: number
  foamCount: number
}

export async function savePack(input: PackInput): Promise<{ shortageValue: number }> {
  for (const it of input.items) {
    const { error } = await supabase
      .from('order_items')
      .update({ status: it.status, qty_shipped: it.qtyShipped })
      .eq('id', it.id)
    if (error) throw new Error('บันทึกรายการไม่สำเร็จ: ' + error.message)
  }
  // Box counts are always saved — editing them after the order is packed must
  // still persist, so this update is NOT status-gated.
  const { error: eBoxes } = await supabase
    .from('orders')
    .update({ paper_box_count: input.paperCount, foam_box_count: input.foamCount })
    .eq('id', input.orderId)
  if (eBoxes) throw new Error('บันทึกจำนวนลังไม่สำเร็จ: ' + eBoxes.message)

  // Advance to "packing" only from an earlier state; never regress a packed order.
  const { error: eStatus } = await supabase
    .from('orders')
    .update({ status: 'packing' })
    .eq('id', input.orderId)
    .in('status', ['imported', 'packing'])
  if (eStatus) throw new Error('อัปเดตสถานะไม่สำเร็จ: ' + eStatus.message)

  const { data: rows } = await supabase
    .from('order_items')
    .select('unit_price,qty_ordered,status')
    .eq('order_id', input.orderId)
  const shortageValue = computeShortageValue((rows ?? []) as any)
  await syncShortageBackorders(input.orderId)
  await logAction('pack_saved', 'order', input.orderId, { shortageValue })
  return { shortageValue }
}
