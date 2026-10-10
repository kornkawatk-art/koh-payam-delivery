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
  returned: 'แม็คโคร: คืนสินค้า',
  canceled: 'แม็คโคร: ยกเลิก',
}
