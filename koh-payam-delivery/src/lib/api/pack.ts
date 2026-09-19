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
      // Recording real boxes on this PO means it is no longer riding on
      // another PO's boxes (see savePackGroup) -- but a plain save of a
      // still-empty count must not silently drop that link.
      ...(input.paperCount + input.foamCount + input.pieceCount > 0
        ? { packed_with_order_id: null }
        : {}),
    })
    .eq('id', input.orderId)
  if (eBoxes) throw new Error('บันทึกจำนวนลังไม่สำเร็จ: ' + eBoxes.message)

  await saveItemTicks(input.itemPacked)

  await syncShortageBackorders(input.orderId)
  await logAction('pack_saved', 'order', input.orderId, {
    paperCount: input.paperCount,
    foamCount: input.foamCount,
    pieceCount: input.pieceCount,
    packerName: input.packerName,
  })
}

async function saveItemTicks(itemPacked: { id: string; packed: boolean }[]) {
  const packedIds = itemPacked.filter((i) => i.packed).map((i) => i.id)
  const unpackedIds = itemPacked.filter((i) => !i.packed).map((i) => i.id)
  if (packedIds.length > 0) {
    const { error } = await supabase.from('order_items').update({ packed: true }).in('id', packedIds)
    if (error) throw new Error('บันทึกสถานะแพ็คสินค้าไม่สำเร็จ: ' + error.message)
  }
  if (unpackedIds.length > 0) {
    const { error } = await supabase.from('order_items').update({ packed: false }).in('id', unpackedIds)
    if (error) throw new Error('บันทึกสถานะแพ็คสินค้าไม่สำเร็จ: ' + error.message)
  }
}

export type PackGroupInput = {
  primaryId: string
  otherIds: string[]
  paperCount: number
  foamCount: number
  pieceCount: number
  packerName: string
  itemPacked: { id: string; packed: boolean }[]
}

// Combined pack of several POs of one customer: the boxes/pieces and packer
// are recorded once, on the primary PO; every other PO gets 0 boxes plus a
// pointer at the primary (packed_with_order_id) so labels/pier/detail can say
// so. Item ticks (which span every PO in the action) are saved in one batch.
export async function savePackGroup(input: PackGroupInput): Promise<void> {
  const packer = input.packerName.trim() || null
  // Both writes are guarded on status = 'imported': if another session packed
  // or shipped one of these POs since this page loaded, its own boxes must not
  // be zeroed or re-linked here.
  const { data: primaryRows, error: eP } = await supabase
    .from('orders')
    .update({
      paper_box_count: input.paperCount,
      foam_box_count: input.foamCount,
      piece_count: input.pieceCount,
      packer_name: packer,
      packed_with_order_id: null,
    })
    .eq('id', input.primaryId)
    .eq('status', 'imported')
    .select('id')
  if (eP) throw new Error('บันทึกจำนวนลังไม่สำเร็จ: ' + eP.message)
  if (!primaryRows || primaryRows.length === 0)
    throw new Error('ออเดอร์หลักถูกแพ็คหรือเปลี่ยนสถานะไปแล้ว กรุณาโหลดหน้านี้ใหม่')

  if (input.otherIds.length > 0) {
    const { error: eO } = await supabase
      .from('orders')
      .update({
        paper_box_count: 0,
        foam_box_count: 0,
        piece_count: 0,
        packer_name: packer,
        packed_with_order_id: input.primaryId,
      })
      .in('id', input.otherIds)
      .eq('status', 'imported')
    if (eO) throw new Error('บันทึกออเดอร์ที่แพ็ครวมไม่สำเร็จ: ' + eO.message)
  }

  await saveItemTicks(input.itemPacked)

  for (const id of [input.primaryId, ...input.otherIds]) await syncShortageBackorders(id)
  await logAction('pack_group_saved', 'order', input.primaryId, {
    orderIds: [input.primaryId, ...input.otherIds],
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
