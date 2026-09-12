// Pure helper for send-order-links' step 3 ("dedup by phone"). Kept dependency
// -free (no Deno/network APIs) so it can be exercised by plain vitest — see
// dedup.test.ts — even though the edge function itself has no Deno test
// harness in this repo.
//
// Orders with no phone on file are dropped: they can never match a
// line_contacts row (phone is that table's key), so they would just be
// skipped later anyway — dropping them here keeps the returned list to
// "orders we might actually be able to message".
export function dedupOrdersByPhone<T extends { customer_phone: string | null }>(
  orders: T[],
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const o of orders) {
    const phone = o.customer_phone
    if (!phone) continue
    if (seen.has(phone)) continue
    seen.add(phone)
    out.push(o)
  }
  return out
}
