import { supabase } from '../supabase'
import { syncShortageBackorders } from './backorders'
import { logAction } from './audit'

export type PackInput = {
  orderId: string
  paperCount: number
  foamCount: number
  pieceCount: number
  packerName: string
  itemPacked: { id: string; packed: boolean }[]
}

// Shortages come from the makro import, not a manual tick, so this only ever
// writes the boxes/pieces + each line's own physical-pack tick. Every other
// order_items field (product, qty, status, is_fresh, ...) is untouched here.
export async function savePack(input: PackInput): Promise<void> {
  // Box counts are always saved — editing them after the order is packed must
  // still persist, so this update is NOT status-gated.
  const { error: eBoxes } = await supabase
    .from('orders')
    .update({
      paper_box_count: input.paperCount,
      foam_box_count: input.foamCount,
      piece_count: input.pieceCount,
      packer_name: input.packerName.trim() || null,
    })
    .eq('id', input.orderId)
  if (eBoxes) throw new Error('บันทึกจำนวนลังไม่สำเร็จ: ' + eBoxes.message)

  const packedIds = input.itemPacked.filter((i) => i.packed).map((i) => i.id)
  const unpackedIds = input.itemPacked.filter((i) => !i.packed).map((i) => i.id)
  if (packedIds.length > 0) {
    const { error } = await supabase.from('order_items').update({ packed: true }).in('id', packedIds)
    if (error) throw new Error('บันทึกสถานะแพ็คสินค้าไม่สำเร็จ: ' + error.message)
  }
  if (unpackedIds.length > 0) {
    const { error } = await supabase.from('order_items').update({ packed: false }).in('id', unpackedIds)
    if (error) throw new Error('บันทึกสถานะแพ็คสินค้าไม่สำเร็จ: ' + error.message)
  }

  await syncShortageBackorders(input.orderId)
  await logAction('pack_saved', 'order', input.orderId, {
    paperCount: input.paperCount,
    foamCount: input.foamCount,
    pieceCount: input.pieceCount,
    packerName: input.packerName,
  })
}

// Autocomplete source for the "ชื่อคนแพ็ค" field on the pack screen — distinct
// packer names already used on other orders, read straight off `orders`
// rather than a separate roster table.
export async function listDistinctPackerNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('packer_name')
    .not('packer_name', 'is', null)
  if (error) return []
  const names = new Set<string>()
  for (const row of (data ?? []) as { packer_name: string | null }[]) {
    if (row.packer_name) names.add(row.packer_name)
  }
  return Array.from(names).sort()
}
