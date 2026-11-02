import { supabase } from '../supabase'
import { paymentPatch, type PaymentPatchOptions } from '../payments'
import type { PaymentRow } from '../import/buildImport'

const CHUNK = 200 // keep each .in() under PostgREST's URL limit

/**
 * Refresh payment facts of POs already in the app (any ship date) from a
 * Makro OrderExport. Never creates or deletes an order. Makro "not paid"
 * clears a manager's paid mark (paymentPatch). A PO whose facts are already
 * the same is not written again: the hourly auto-import sends ~8 days each time.
 */
export async function refreshPayments(
  rows: PaymentRow[],
  opts: PaymentPatchOptions = {},
): Promise<{ refreshed: number; unchanged: number; notInApp: string[] }> {
  const nos = [...new Set(rows.map((r) => r.makroOrderNo))]
  const have = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < nos.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('orders')
      .select('makro_order_no,payment_method,payment_status,outstanding_amount,makro_order_status,paid_marked_at')
      .in('makro_order_no', nos.slice(i, i + CHUNK))
    if (error) throw new Error('โหลดออเดอร์ไม่สำเร็จ: ' + error.message)
    for (const d of (data ?? []) as Record<string, unknown>[]) have.set(String(d.makro_order_no), d)
  }
  let refreshed = 0
  let unchanged = 0
  for (const r of rows) {
    const now = have.get(r.makroOrderNo)
    if (!now) continue
    const patch = paymentPatch(r, opts)
    // numeric comes back as a string or a number; compare as text; paid_marked_by follows paid_marked_at
    if (Object.entries(patch).every(([k, v]) => k === 'paid_marked_by' || String(now[k] ?? '') === String(v ?? '') || (k === 'outstanding_amount' && Number(now[k]) === Number(v)))) {
      unchanged++
      continue
    }
    const { error } = await supabase
      .from('orders')
      .update(patch)
      .eq('makro_order_no', r.makroOrderNo)
    if (error) throw new Error(`อัปเดตการจ่ายเงินของ ${r.makroOrderNo} ไม่สำเร็จ: ${error.message}`)
    refreshed++
  }
  return { refreshed, unchanged, notInApp: nos.filter((n) => !have.has(n)) }
}
