import { supabase } from '../supabase'

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

export async function getOrCreateShipDay(shipDate: string) {
  const { data: found } = await supabase
    .from('ship_days')
    .select('id,boats')
    .eq('ship_date', shipDate)
    .maybeSingle()
  if (found) return found as { id: string; boats: { id: string; name: string }[] }
  const { data, error } = await supabase
    .from('ship_days')
    .insert({ ship_date: shipDate })
    .select('id,boats')
    .single()
  if (error) throw new Error('สร้างรอบจัดส่งไม่สำเร็จ: ' + error.message)
  return data as { id: string; boats: { id: string; name: string }[] }
}

export async function setBoats(shipDayId: string, boats: { id: string; name: string }[]) {
  const { error } = await supabase.from('ship_days').update({ boats }).eq('id', shipDayId)
  if (error) throw new Error('บันทึกรายการเรือไม่สำเร็จ: ' + error.message)
}

/**
 * Whether `send-order-links` has already run for this ship day, straight off
 * `ship_days.links_sent_at` — same table/column the edge function itself
 * guards on (see its file header, step 1). Used to show a "ยังไม่ได้ส่งลิงก์"
 * prompt on the daily dashboard for days where nobody ever opened
 * BoatSetup.tsx (the only other place that currently triggers a send) --
 * a plain select, not `getOrCreateShipDay`, so just looking at the
 * dashboard never creates a ship_days row of its own.
 */
export async function getShipDayLinksSentAt(shipDate: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('ship_days')
    .select('links_sent_at')
    .eq('ship_date', shipDate)
  if (error) throw new Error('โหลดสถานะวันจัดส่งไม่สำเร็จ: ' + error.message)
  return (data?.[0] as { links_sent_at: string | null } | undefined)?.links_sent_at ?? null
}

/**
 * Ask the `send-order-links` edge function to push today's order links over
 * LINE to every registered customer shipping on `shipDate`. Attaches the
 * team session's real access token as the bearer, same session-attachment
 * pattern as `requestUploadUrl`'s `evidence` scope in `photos.ts` (default
 * to the anon key, upgrade to the session token when one exists) — this
 * function is only ever called right after a team member saves the boat
 * list, so a session should always be present, but there is no anon-key
 * fallback path in send-order-links itself (verify_jwt stays at its
 * default `true`), so a missing session simply fails as unauthorized.
 */
export async function sendOrderLinks(
  shipDate: string,
): Promise<{ sent: number; failed: number; skipped: boolean }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
  }
  const { data: sess } = await supabase.auth.getSession()
  if (sess.session) headers.Authorization = `Bearer ${sess.session.access_token}`

  const res = await fetch(`${FN_BASE}/send-order-links`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ shipDate }),
  })
  if (!res.ok) throw new Error('ส่งลิงก์ไลน์ไม่สำเร็จ (' + res.status + ')')
  const body = await res.json()
  return { sent: body.sent, failed: body.failed, skipped: body.skipped }
}

export async function listOrdersForDay(shipDate: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(
      'id,makro_order_no,customer_name_en,status,boat_id,paper_box_count,foam_box_count,piece_count,sub_district,outstanding_amount,payment_method,customer_phone,packer_name,pier_name,packed_with_order_id,packed_with:orders!packed_with_order_id(makro_order_no)',
    )
    .eq('ship_date', shipDate)
  if (error) throw new Error('โหลดรายการออเดอร์ไม่สำเร็จ: ' + error.message)
  return (data ?? []) as any[]
}
