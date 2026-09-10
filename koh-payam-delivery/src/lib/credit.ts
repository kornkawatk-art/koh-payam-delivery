const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

export type CreditInput = {
  totalValue: number
  items: { unit_price: number; qty_ordered: number; status: string }[]
  claims: { status: string; resolution: string | null; refund_amount: number }[]
}
export type CreditSummary = {
  orderValue: number
  shortageValue: number
  approvedRefund: number
  netPayable: number
}

export function computeCreditSummary(input: CreditInput): CreditSummary {
  // PostgREST serialises `numeric` columns as strings; coerce every numeric field
  // with Number() so a "100.00" can't turn multiplication into NaN or `+` into
  // string concatenation. Mirrors the order-view edge copy of this function.
  const totalValue = Number(input.totalValue)
  const shortageValue = round2(
    input.items
      .filter((i) => i.status === 'short')
      .reduce((s, i) => s + Number(i.unit_price) * Number(i.qty_ordered), 0),
  )
  const approvedRefund = round2(
    input.claims
      .filter((c) => c.status === 'approved' && c.resolution === 'refund')
      .reduce((s, c) => s + Number(c.refund_amount), 0),
  )
  const netPayable = Math.max(0, round2(totalValue - shortageValue - approvedRefund))
  return { orderValue: round2(totalValue), shortageValue, approvedRefund, netPayable }
}
