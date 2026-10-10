// How the app tells customers apart: one owner (one phone) can run several
// shops, each its own Makro account name -- so phone AND name. Phone is
// digits only ("082-628 9533" == "0826289533"); name trimmed, runs of
// whitespace collapsed, upper-cased. No phone: name alone. Dependency-free:
// shared by the team app (Vite) and edge functions (Deno). Must match the SQL
// normalization in 0025_customer_per_shop.sql.

export const normCustomerName = (name: string | null | undefined) =>
  (name ?? '').trim().replace(/\s+/g, ' ').toUpperCase()

export function customerKey(o: {
  customer_phone?: string | null
  customer_name_en?: string | null
}): string {
  const digits = (o.customer_phone ?? '').replace(/\D/g, '')
  const name = normCustomerName(o.customer_name_en)
  return digits ? `phone:${digits}|name:${name}` : `name:${name}`
}
