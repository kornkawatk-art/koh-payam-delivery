// Makro's own Order Status column, as imported (orders.makro_order_status).

/** A Makro order that will not be delivered: returned or canceled. */
export function makroVoid(status: string | null | undefined): 'returned' | 'canceled' | null {
  const s = (status ?? '').trim().toLowerCase()
  if (s === 'returned') return 'returned'
  if (s === 'canceled' || s === 'cancelled') return 'canceled'
  return null
}

/** Makro says the customer collected a store-pickup order. */
export const isMakroPickedUp = (status: string | null | undefined) =>
  (status ?? '').trim().toLowerCase() === 'picked up'

export const MAKRO_VOID_TH: Record<'returned' | 'canceled', string> = {
  returned: 'คืนสินค้า',
  canceled: 'ยกเลิก',
}

/**
 * How far Makro's own picking has got, from its Order Status column (refreshed on every import):
 * waiting = not started (Placed), picking = "Picking and packing", ready = picked and handed on
 * (Ready for ship / for pickup, Shipped, Out for delivery, Delivered, Picked up). null when the
 * order is void or the status is unknown.
 */
export type MakroPickStage = 'waiting' | 'picking' | 'ready'
const PICK_STAGE: Record<string, MakroPickStage> = {
  placed: 'waiting',
  pending: 'waiting',
  'picking and packing': 'picking',
  'ready for ship': 'ready',
  'ready for pickup': 'ready',
  shipped: 'ready',
  'out for delivery': 'ready',
  delivered: 'ready',
  'picked up': 'ready',
}
export function makroPickStage(status: string | null | undefined): MakroPickStage | null {
  return PICK_STAGE[(status ?? '').trim().toLowerCase()] ?? null
}
export const MAKRO_PICK_TH: Record<MakroPickStage, string> = {
  waiting: 'ยังไม่เริ่มจัด',
  picking: 'กำลังจัด',
  ready: 'จัดเสร็จแล้ว',
}
