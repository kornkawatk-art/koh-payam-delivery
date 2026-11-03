import { supabase } from '../supabase'

// ชื่อหน้าลัง (makro-claim 0122): sale names a city / Myanmar PO's boxes in O2O Desk. The import (by hand and the
// hourly auto-import) brings those POs into this app as Myanmar-bound orders, with the name for the stickers (0039).

/** PO -> box name, for every PO sale has named */
export async function listBoxLabelMap(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('box_labels').select('makro_order_no,label')
  if (error) throw new Error('โหลดชื่อหน้าลังไม่สำเร็จ: ' + error.message)
  return new Map((data ?? []).map((r: { makro_order_no: string; label: string }) => [r.makro_order_no, r.label]))
}
