import { supabase } from '../supabase'
import { syncShortageBackorders } from './backorders'
import { logAction } from './audit'

export type PackInput = {
  orderId: string
  paperCount: number
  foamCount: number
}

// Shortages now come from the makro import, not a manual tick, so packing only
// records how many boxes went out. Order items are never touched here.
export async function savePack(input: PackInput): Promise<void> {
  // Box counts are always saved — editing them after the order is packed must
  // still persist, so this update is NOT status-gated.
  const { error: eBoxes } = await supabase
    .from('orders')
    .update({ paper_box_count: input.paperCount, foam_box_count: input.foamCount })
    .eq('id', input.orderId)
  if (eBoxes) throw new Error('บันทึกจำนวนลังไม่สำเร็จ: ' + eBoxes.message)

  await syncShortageBackorders(input.orderId)
  await logAction('pack_saved', 'order', input.orderId, {
    paperCount: input.paperCount,
    foamCount: input.foamCount,
  })
}
