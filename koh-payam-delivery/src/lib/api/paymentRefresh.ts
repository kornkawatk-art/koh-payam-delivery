import { supabase } from '../supabase'
import { paymentPatch } from '../payments'
import type { PaymentRow } from '../import/buildImport'

const CHUNK = 200 // keep each .in() under PostgREST's URL limit

/**
 * Refresh payment facts of POs already in the app (any ship date) from a
 * Makro OrderExport. Never creates or deletes an order. Makro "not paid"
 * clears a manager's paid mark (paymentPatch).
 */
export async function refreshPayments(
  rows: PaymentRow[],
): Promise<{ refreshed: number; notInApp: string[] }> {
  const nos = [...new Set(rows.map((r) => r.makroOrderNo))]
  const have = new Set<string>()
  for (let i = 0; i < nos.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('orders')
      .select('makro_order_no')
      .in('makro_order_no', nos.slice(i, i + CHUNK))
    if (error) throw new Error('โหลดออเดอร์ไม่สำเร็จ: ' + error.message)
    for (const d of (data ?? []) as { makro_order_no: string }[]) have.add(d.makro_order_no)
  }
  let refreshed = 0
  for (const r of rows) {
    if (!have.has(r.makroOrderNo)) continue
    const { error } = await supabase
      .from('orders')
      .update(paymentPatch(r))
      .eq('makro_order_no', r.makroOrderNo)
    if (error) throw new Error(`อัปเดตการจ่ายเงินของ ${r.makroOrderNo} ไม่สำเร็จ: ${error.message}`)
    refreshed++
  }
  return { refreshed, notInApp: nos.filter((n) => !have.has(n)) }
}
