import { supabase } from '../supabase'
import { printedSnapshot } from '../bulkStickers'

type Counted = { id: string; paper_box_count: number; foam_box_count: number; piece_count: number }

/**
 * Remember that these orders' stickers were printed, with the box counts they
 * were printed for -- a later count change makes them due again
 * (bulkStickers.buildStickerJobs).
 */
export async function markStickersPrinted(orders: Counted[]): Promise<void> {
  for (const o of orders) {
    const { error } = await supabase
      .from('orders')
      .update({ stickers_printed: printedSnapshot(o) })
      .eq('id', o.id)
    if (error) throw new Error('บันทึกว่าพิมพ์สติ๊กเกอร์แล้วไม่สำเร็จ: ' + error.message)
  }
}
