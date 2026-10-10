import { supabase } from '../supabase'
import { getOrCreateShipDay } from './shipDays'
import { linkBackordersToDay, syncShortageBackorders } from './backorders'
import { logAction } from './audit'
import type { Island } from '../islands'
import { makeLinkToken } from '../token'
import type { ParsedOrder } from '../import/buildImport'
import { itemRow, planItemSync, type ExistingItem } from '../import/itemSync'
import { canTransition, type OrderStatus } from '../status'
import { normCustomerName } from '../groupOrders'
import { daysAgoISO, fetchAll } from './fetchAll'
import { isMakroPickedUp } from '../makroStatus'

export type OtherDayOrder = { makro_order_no: string; ship_date: string; status: string }

// POs from `nos` that already exist on a ship date OTHER than `shipDate`. The
// same Makro export routinely re-lists POs imported (and often already
// shipped) on earlier days, and uniqueness is only per ship day -- without
// this check every re-listed PO would be created again as a fresh "imported"
// order on the new day, along with fresh duplicate shortage backorders.
export async function listOrdersOnOtherDays(
  nos: string[],
  shipDate: string,
): Promise<OtherDayOrder[]> {
  if (nos.length === 0) return []
  const { data, error } = await supabase
    .from('orders')
    .select('makro_order_no,ship_date,status')
    .neq('ship_date', shipDate)
    .in('makro_order_no', nos)
  if (error) throw new Error('ตรวจออเดอร์ที่เคยนำเข้าแล้วไม่สำเร็จ: ' + error.message)
  return (data ?? []) as OtherDayOrder[]
}

// Re-import is a non-destructive sync: brand-new orders are inserted, orders that
// already exist for this ship day get their order-level makro fields refreshed and
// their line items brought in line with the file IN PLACE (planItemSync):
// matched lines keep their row id and "packed" tick, new lines are inserted,
// lines gone from the file are removed unless a claim references them. (The
// old delete-all + reinsert detached claims: claim_items.order_item_id is ON
// DELETE SET NULL.) Box counts, boat, status, timestamps, link token, photos
// and claims are left untouched. Shortage backorders DO get refreshed (via
// syncShortageBackorders) for every order, new or synced — a corrected
// shipped/shortage number from Makro must be reflected in the backorder list
// too, not just on the order's own item table.
// A PO that already exists on a DIFFERENT ship day is skipped, never re-created
// (listOrdersOnOtherDays); the skipped list is returned so the UI can say so.
// Store pickups Makro marks "Picked up" arrive (or, on a re-import, become)
// picked_up; `voided` -- POs Makro returned/canceled, which buildImport does
// not import -- only has its Makro status recorded on POs already here, so
// they carry a warning badge and can't board a boat.
export async function commitImport(
  shipDate: string,
  incoming: ParsedOrder[],
  voided: { makroOrderNo: string; status: string }[] = [],
): Promise<{
  created: number
  synced: number
  skipped: { makroOrderNo: string; shipDate: string }[]
}> {
  const day = await getOrCreateShipDay(shipDate)
  const nos = incoming.map((o) => o.makroOrderNo)
  const { data: existing } = await supabase
    .from('orders')
    .select('id,makro_order_no,status')
    .eq('ship_day_id', day.id)
    .in('makro_order_no', nos)
  const idByNo = new Map<string, string>(
    (existing ?? []).map((r: any) => [r.makro_order_no, r.id]),
  )
  const statusByNo = new Map<string, string>(
    (existing ?? []).map((r: any) => [r.makro_order_no, r.status]),
  )
  const collected = (o: ParsedOrder) => !!o.isPickup && isMakroPickedUp(o.makroOrderStatus)

  // A PO already imported on another day is skipped, never duplicated. (One
  // that also exists on THIS day still syncs in place -- same-day wins.)
  const elsewhere = new Map<string, string>()
  for (const r of await listOrdersOnOtherDays(nos, shipDate))
    if (!idByNo.has(r.makro_order_no) && !elsewhere.has(r.makro_order_no))
      elsewhere.set(r.makro_order_no, r.ship_date)
  const orders = incoming.filter((o) => !elsewhere.has(o.makroOrderNo))
  const skipped = Array.from(elsewhere, ([makroOrderNo, d]) => ({ makroOrderNo, shipDate: d }))

  let created = 0
  let synced = 0
  for (const o of orders) {
    const existingId = idByNo.get(o.makroOrderNo)
    if (!existingId) {
      const { data: ins, error } = await supabase
        .from('orders')
        .insert({
          ship_day_id: day.id,
          makro_order_no: o.makroOrderNo,
          customer_name_en: o.customerName,
          ship_date: shipDate,
          status: collected(o) ? 'picked_up' : 'imported',
          ...(collected(o) ? { picked_up_at: new Date().toISOString() } : {}),
          link_token: makeLinkToken(),
          sub_district: o.subDistrict,
          shipping_address: o.shippingAddress || null,
          makro_order_status: o.makroOrderStatus,
          payment_method: o.paymentMethod,
          payment_status: o.paymentStatus,
          outstanding_amount: o.outstandingAmount,
          customer_phone: o.customerPhone,
          island: o.island,
          is_pickup: o.isPickup,
        })
        .select('id')
        .single()
      if (error) throw new Error(`สร้างออเดอร์ ${o.makroOrderNo} ไม่สำเร็จ: ${error.message}`)
      const orderId = (ins as any).id
      const { error: e2 } = await supabase
        .from('order_items')
        .insert(o.items.map((it) => itemRow(orderId, it, false)))
      if (e2) throw new Error(`สร้างรายการของ ${o.makroOrderNo} ไม่สำเร็จ: ${e2.message}`)
      await syncShortageBackorders(orderId)
      created++
    } else {
      const { error: eU } = await supabase
        .from('orders')
        .update({
          customer_name_en: o.customerName,
          sub_district: o.subDistrict,
          shipping_address: o.shippingAddress || null,
          makro_order_status: o.makroOrderStatus,
          payment_method: o.paymentMethod,
          payment_status: o.paymentStatus,
          outstanding_amount: o.outstandingAmount,
          customer_phone: o.customerPhone,
          // Makro's own fact -- a re-import keeps it current (unlike island,
          // which a manager may have picked by hand)
          is_pickup: o.isPickup,
          // the customer collected it -- close it, unless it already went further
          ...(collected(o) && ['imported', 'packed'].includes(statusByNo.get(o.makroOrderNo) ?? '')
            ? { status: 'picked_up', picked_up_at: new Date().toISOString() }
            : {}),
        })
        .eq('id', existingId)
      if (eU) throw new Error(`อัปเดตออเดอร์ ${o.makroOrderNo} ไม่สำเร็จ: ${eU.message}`)
      const { data: oldRows, error: eR } = await supabase
        .from('order_items')
        .select('id,makro_item_id,product_name,line_no,packed')
        .eq('order_id', existingId)
      if (eR) throw new Error(`อ่านรายการเดิมของ ${o.makroOrderNo} ไม่สำเร็จ: ${eR.message}`)
      const olds = (oldRows ?? []) as Omit<ExistingItem, 'claimed'>[]
      // Which lines a claim points at -- those are never deleted. Fail closed:
      // if this check errors, stop rather than risk detaching a claim.
      let claimed = new Set<string>()
      if (olds.length) {
        const { data: refs, error: eC } = await supabase
          .from('claim_items')
          .select('order_item_id')
          .in('order_item_id', olds.map((r) => r.id))
        if (eC) throw new Error(`ตรวจเคลมของ ${o.makroOrderNo} ไม่สำเร็จ: ${eC.message}`)
        claimed = new Set((refs ?? []).map((r: any) => r.order_item_id))
      }
      const plan = planItemSync(
        existingId,
        olds.map((r) => ({ ...r, packed: !!r.packed, claimed: claimed.has(r.id) })),
        o.items,
      )
      if (plan.update.length) {
        const { error: eUp } = await supabase.from('order_items').upsert(plan.update)
        if (eUp) throw new Error(`sync รายการของ ${o.makroOrderNo} ไม่สำเร็จ: ${eUp.message}`)
      }
      if (plan.insert.length) {
        const { error: eIn } = await supabase.from('order_items').insert(plan.insert)
        if (eIn) throw new Error(`sync รายการของ ${o.makroOrderNo} ไม่สำเร็จ: ${eIn.message}`)
      }
      if (plan.remove.length) {
        const { error: eD } = await supabase.from('order_items').delete().in('id', plan.remove)
        if (eD) throw new Error(`ล้างรายการของ ${o.makroOrderNo} ไม่สำเร็จ: ${eD.message}`)
      }
      // Re-syncing an order's items can change which lines are short (Makro
      // corrects a shipped/shortage number after the fact) — refresh this
      // order's still-pending shortage backorders to match, the same way
      // savePack already does on every pack-screen save. Safe to call
      // unconditionally: it only touches this order's own still-*pending*
      // shortage rows, never a row already marked fulfilled (see its own
      // header comment in backorders.ts).
      await syncShortageBackorders(existingId)
      synced++
    }
  }

  // Makro returned / canceled: not imported (buildImport skipped them), but a
  // PO already here gets the status so it shows the warning and can't ship.
  for (const v of voided) {
    const { error: eV } = await supabase
      .from('orders')
      .update({ makro_order_status: v.status })
      .eq('makro_order_no', v.makroOrderNo)
    if (eV) throw new Error(`อัปเดตสถานะแม็คโครของ ${v.makroOrderNo} ไม่สำเร็จ: ${eV.message}`)
  }

  await linkBackordersToDay(shipDate)
  await logAction('import', 'ship_day', day.id, {
    shipDate,
    created,
    synced,
    skipped: skipped.length,
  })
  return { created, synced, skipped }
}

// Lookup by the Makro shipping-label QR code (plain text = makro_order_no).
// Uniqueness is only guaranteed per ship_day_id, not globally, so this can
// return zero, one, or multiple rows — the caller (QrOrderScanner) decides
// what to do with each case. No ship_date filter: searches everything the
// current user can read under RLS (all orders, for a team member).
export async function findOrdersByMakroOrderNo(
  orderNo: string,
): Promise<{ id: string; customer_name_en: string; ship_date: string }[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id,customer_name_en,ship_date')
    .eq('makro_order_no', orderNo.trim())
  if (error) throw new Error('ค้นหาออเดอร์ไม่สำเร็จ: ' + error.message)
  return (data ?? []) as { id: string; customer_name_en: string; ship_date: string }[]
}

export async function getOrder(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(
      '*, order_items(*), boxes(*), evidence_photos(*), claims(*), packed_with:orders!packed_with_order_id(makro_order_no)',
    )
    .eq('id', orderId)
    .single()
  if (error) throw new Error('โหลดออเดอร์ไม่สำเร็จ: ' + error.message)
  return data
}

// Every PO one customer (same phone) has on one ship date, with items and pack
// photos, for the combined pack page. Ordered by makro_order_no so the first
// not-yet-packed row is a stable "primary" PO.
// One customer's POs for a day: same phone and -- when `name` is given --
// the same (normalized) customer name, since one owner can run several shops
// that pack and ship separately (see groupByPhone). A link without a name
// (older bookmark) keeps the phone-only behavior.
export async function listOrdersForCustomerDay(shipDate: string, phone: string, name?: string | null) {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*), evidence_photos(*)')
    .eq('ship_date', shipDate)
    .eq('customer_phone', phone)
    .order('makro_order_no')
  if (error) throw new Error('โหลดออเดอร์ของลูกค้าไม่สำเร็จ: ' + error.message)
  const rows = (data ?? []) as any[]
  if (!name) return rows
  const want = normCustomerName(name)
  return rows.filter((o) => normCustomerName(o.customer_name_en) === want)
}

export async function updateOrderStatus(orderId: string, next: OrderStatus) {
  const { data: cur, error } = await supabase
    .from('orders')
    .select('status')
    .eq('id', orderId)
    .single()
  if (error) throw new Error(error.message)
  // Re-clicking the same status button (e.g. "แพ็คเสร็จ" on an already-packed
  // order) is a harmless no-op, not an illegal transition.
  if ((cur as any).status === next) return
  if (!canTransition((cur as any).status, next))
    throw new Error(`เปลี่ยนสถานะจาก ${(cur as any).status} เป็น ${next} ไม่ได้`)
  const { error: e2 } = await supabase.from('orders').update({ status: next }).eq('id', orderId)
  if (e2) throw new Error(e2.message)
  await logAction('status_change', 'order', orderId, { from: (cur as any).status, to: next })
}

// "ลูกค้ารับแล้ว": a store-pickup order the customer collected at the branch.
// Any team member can close it (from imported or packed).
export async function markPickedUp(orderId: string) {
  const { data: cur, error } = await supabase
    .from('orders')
    .select('status,is_pickup')
    .eq('id', orderId)
    .single()
  if (error) throw new Error(error.message)
  const { status, is_pickup } = cur as { status: OrderStatus; is_pickup: boolean }
  if (!is_pickup) throw new Error('ไม่ใช่ออเดอร์รับเองที่สาขา')
  if (!canTransition(status, 'picked_up')) throw new Error('ปิดออเดอร์นี้ไม่ได้ (สถานะไปไกลกว่านั้นแล้ว)')
  const { error: e2 } = await supabase
    .from('orders')
    .update({ status: 'picked_up', picked_up_at: new Date().toISOString() })
    .eq('id', orderId)
  if (e2) throw new Error('ปิดออเดอร์ไม่สำเร็จ: ' + e2.message)
  await logAction('picked_up', 'order', orderId, { from: status })
}

// A manager undoes a mistaken "ลูกค้ารับแล้ว" (the button is manager-only).
export async function reopenOrder(orderId: string) {
  const { data: cur, error } = await supabase.from('orders').select('status').eq('id', orderId).single()
  if (error) throw new Error(error.message)
  if ((cur as { status: string }).status !== 'picked_up') throw new Error('ออเดอร์นี้ยังไม่ได้ปิด')
  const { error: e2 } = await supabase
    .from('orders')
    .update({ status: 'imported', picked_up_at: null })
    .eq('id', orderId)
  if (e2) throw new Error('เปิดออเดอร์อีกครั้งไม่สำเร็จ: ' + e2.message)
  await logAction('order_reopened', 'order', orderId, undefined)
}

// A manager fixes (or, for a pier-only address, first sets) which island an
// order goes to. Never touched by a re-import, so this choice sticks.
export async function setOrderIsland(orderId: string, island: Island) {
  const { data, error } = await supabase
    .from('orders')
    .update({ island })
    .eq('id', orderId)
    .select('id')
  if (error) throw new Error('บันทึกเกาะไม่สำเร็จ: ' + error.message)
  if (!data || data.length === 0) throw new Error('บันทึกเกาะไม่สำเร็จ (ไม่พบออเดอร์)')
  await logAction('island_set', 'order', orderId, { island })
}

export async function setOrderBoat(orderId: string, boatId: string) {
  const { data, error } = await supabase
    .from('orders')
    .update({ boat_id: boatId, status: 'at_pier' })
    .eq('id', orderId)
    .in('status', ['packed', 'at_pier'])
    .select('id')
  if (error) throw new Error('บันทึกเรือไม่สำเร็จ: ' + error.message)
  if (!data || data.length === 0)
    throw new Error('บันทึกเรือไม่สำเร็จ (ออเดอร์อาจถูกส่งไปแล้ว)')
  await logAction('boat_set', 'order', orderId, { boatId })
}

// Same as setOrderBoat for every PO of one customer shipped together. Only POs
// still packed/at_pier are touched (anything already shipped is left alone);
// returns how many were updated so the caller can flag a shortfall.
export async function setOrderBoats(orderIds: string[], boatId: string): Promise<number> {
  const { data, error } = await supabase
    .from('orders')
    .update({ boat_id: boatId, status: 'at_pier' })
    .in('id', orderIds)
    .in('status', ['packed', 'at_pier'])
    .select('id')
  if (error) throw new Error('บันทึกเรือไม่สำเร็จ: ' + error.message)
  if (!data || data.length === 0)
    throw new Error('บันทึกเรือไม่สำเร็จ (ออเดอร์อาจถูกส่งไปแล้ว)')
  for (const row of data as { id: string }[]) await logAction('boat_set', 'order', row.id, { boatId })
  return data.length
}

export async function setOrderPierName(orderId: string, pierName: string): Promise<void> {
  const { data, error } = await supabase
    .from('orders')
    .update({ pier_name: pierName.trim() || null })
    .eq('id', orderId)
    .select('id')
  if (error) throw new Error('บันทึกชื่อคนลงเรือไม่สำเร็จ: ' + error.message)
  if (!data || data.length === 0)
    throw new Error('บันทึกชื่อคนลงเรือไม่สำเร็จ (ออเดอร์อาจถูกส่งไปแล้ว)')
  await logAction('pier_name_set', 'order', orderId, { pierName })
}

// Autocomplete source for the "ชื่อคนลงเรือ" field on the pier screen — distinct
// pier names already used on other orders, read straight off `orders` rather
// than a separate roster table.
export async function listDistinctPierNames(): Promise<string[]> {
  // Recent orders only: names of people still on the team, and a read that
  // stays small however much history piles up.
  const since = daysAgoISO(NAME_SUGGESTION_DAYS)
  let data: { pier_name: string | null }[]
  try {
    data = await fetchAll((from, to) =>
      supabase
        .from('orders')
        .select('pier_name')
        .not('pier_name', 'is', null)
        .gte('ship_date', since)
        .order('id')
        .range(from, to),
    )
  } catch {
    return []
  }
  const names = new Set<string>()
  for (const row of data) {
    if (row.pier_name) names.add(row.pier_name)
  }
  return Array.from(names).sort()
}

/** How far back the packer / pier name suggestions look. */
export const NAME_SUGGESTION_DAYS = 180

export async function regenTokenLink(orderId: string): Promise<string> {
  const token = makeLinkToken()
  const { error } = await supabase.from('orders').update({ link_token: token }).eq('id', orderId)
  if (error) throw new Error('สร้างลิงก์ใหม่ไม่สำเร็จ: ' + error.message)
  await logAction('regen_link', 'order', orderId)
  return token
}

// Manager-only, one-at-a-time hard delete of a wrongly-imported/cancelled order.
// RLS's manager_delete policy is the real gate; this is just the client call.
// The 4-field snapshot is passed in by the caller because there is nothing left
// in the DB to read it back from once the row (and its cascaded children) is gone.
export async function deleteOrder(
  orderId: string,
  snapshot: {
    makroOrderNo: string
    customerNameEn: string
    status: string
    shipDate: string
  },
): Promise<void> {
  const { data, error } = await supabase.from('orders').delete().eq('id', orderId).select('id')
  if (error) throw new Error('ลบออเดอร์ไม่สำเร็จ: ' + error.message)
  if (!data || data.length === 0)
    throw new Error('ลบออเดอร์ไม่สำเร็จ (ไม่มีสิทธิ์ หรือออเดอร์ถูกลบไปแล้ว)')
  await logAction('order_deleted', 'order', orderId, snapshot)
}
