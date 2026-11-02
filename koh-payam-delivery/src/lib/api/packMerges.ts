import { supabase } from '../supabase'

// แพ็กรวมตามเบอร์ (0038 pack_merges): phones the team packs as one on a ship day although their shop names
// differ. Normally a customer is phone + shop name (0025) -- one owner's several shops pack separately.

/** The merged phones of a day (as orders.customer_phone holds them, trimmed) */
export async function listPackMerges(shipDate: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('pack_merges').select('phone').eq('ship_date', shipDate)
  if (error) throw new Error('โหลดการแพ็กรวมไม่สำเร็จ: ' + error.message)
  return new Set((data ?? []).map((r: { phone: string }) => r.phone))
}

/** Pack every shop name of this phone as one on this day (`on`), or separately again */
export async function setPackMerge(shipDate: string, phone: string, on: boolean): Promise<void> {
  const { error } = on
    ? await supabase.from('pack_merges').upsert({ ship_date: shipDate, phone: phone.trim() }, { onConflict: 'ship_date,phone', ignoreDuplicates: true })
    : await supabase.from('pack_merges').delete().eq('ship_date', shipDate).eq('phone', phone.trim())
  if (error) throw new Error((on ? 'แพ็กรวมไม่สำเร็จ: ' : 'แยกแพ็กไม่สำเร็จ: ') + error.message)
}
