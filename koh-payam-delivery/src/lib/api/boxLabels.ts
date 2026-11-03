import { supabase } from '../supabase'

// ชื่อหน้าลัง (O2O Desk migration 0122): sale names the boxes of a city / Myanmar PO in O2O Desk; the packer
// prints them here, and the box count goes back to sale. Read through box_labels_for_day: makro_orders
// itself is open to O2O Desk accounts only.

export type BoxLabelRow = {
  makro_order_no: string
  label: string
  note: string | null
  customer_name: string
  ship_date: string
  paper_box_count: number | null
  foam_box_count: number | null
  piece_count: number | null
  packed_at: string | null
  packed_by_name: string | null
}

export async function listBoxLabelsForDay(day: string): Promise<BoxLabelRow[]> {
  const { data, error } = await supabase.rpc('box_labels_for_day', { p_day: day })
  if (error) throw new Error('โหลดชื่อหน้าลังไม่สำเร็จ: ' + error.message)
  return (data ?? []) as BoxLabelRow[]
}

/** The boxes this PO was packed into (stickers printed); a reprint saves the counts again */
export async function markBoxLabelPacked(po: string, c: { paper: number; foam: number; piece: number }): Promise<void> {
  const { error } = await supabase.rpc('box_label_packed', { p_order_no: po, p_paper: c.paper, p_foam: c.foam, p_piece: c.piece })
  if (error) throw new Error('บันทึกจำนวนลังไม่สำเร็จ: ' + error.message)
}
