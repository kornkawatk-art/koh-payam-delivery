// picked_up: a store-pickup order the customer collected (final, like shipped;
// a manager can reopen it back to imported).
export const ORDER_STATUS = ['imported', 'packed', 'at_pier', 'shipped', 'picked_up'] as const
export type OrderStatus = (typeof ORDER_STATUS)[number]

const FORWARD: Record<OrderStatus, OrderStatus[]> = {
  imported: ['packed', 'picked_up'],
  packed: ['at_pier', 'picked_up'],
  at_pier: ['shipped'],
  shipped: [],
  picked_up: ['imported'],
}
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return FORWARD[from]?.includes(to) ?? false
}
export function nextStatus(from: OrderStatus): OrderStatus | null {
  const fwd = FORWARD[from].filter((s) => ORDER_STATUS.indexOf(s) > ORDER_STATUS.indexOf(from))
  return fwd[0] ?? null
}
