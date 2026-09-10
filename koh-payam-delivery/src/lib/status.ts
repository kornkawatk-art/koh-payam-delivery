export const ORDER_STATUS = ['imported', 'packed', 'at_pier', 'shipped'] as const
export type OrderStatus = (typeof ORDER_STATUS)[number]

const FORWARD: Record<OrderStatus, OrderStatus[]> = {
  imported: ['packed'],
  packed: ['at_pier'],
  at_pier: ['shipped'],
  shipped: [],
}
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return FORWARD[from]?.includes(to) ?? false
}
export function nextStatus(from: OrderStatus): OrderStatus | null {
  const fwd = FORWARD[from].filter((s) => ORDER_STATUS.indexOf(s) > ORDER_STATUS.indexOf(from))
  return fwd[0] ?? null
}
