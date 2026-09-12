// Pure helper for send-order-links' step 3 ("dedup by phone"). Kept dependency
// -free (no Deno/network APIs) so it can be exercised by plain vitest — see
// dedup.test.ts — even though the edge function itself has no Deno test
// harness in this repo.
//
// Grouping is on the *normalized* phone (see _shared/phone.ts), not the raw
// string: orders.customer_phone is stored exactly as Makro's export had it, so
// the same customer's two same-day POs can legitimately read "081-234-5678"
// and "0812345678". Grouping on the raw string would send that customer two
// messages; grouping on the normalized key is what "one message per customer"
// actually means. The same key is what send-order-links then looks up in
// line_contacts, so the two stay in step.
//
// Orders with no usable phone are dropped: they can never match a
// line_contacts row (the normalized phone is that table's key), so they would
// just be skipped later anyway — dropping them here keeps the returned list to
// "orders we might actually be able to message". "No usable phone" includes a
// string that normalizes away to nothing (whitespace, punctuation only), not
// just a SQL NULL.
import { normalizePhone } from '../_shared/phone.ts'

export function dedupOrdersByPhone<T extends { customer_phone: string | null }>(
  orders: T[],
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const o of orders) {
    const phone = normalizePhone(o.customer_phone ?? '')
    if (!phone) continue
    if (seen.has(phone)) continue
    seen.add(phone)
    out.push(o)
  }
  return out
}
