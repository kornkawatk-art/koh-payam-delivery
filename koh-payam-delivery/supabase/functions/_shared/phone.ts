// Shared phone-number normalization for the LINE auto-link feature.
//
// Two code paths have to agree on what "the same phone number" means, or the
// whole feature silently does nothing:
//   - register-line-contact WRITES line_contacts.phone (customer-typed, from
//     the LIFF page — could be "081-234-5678", "+66 81 234 5678", " 0812345678").
//   - send-order-links READS it back keyed on orders.customer_phone (imported
//     from Makro's export via buildImport.ts, which only `.trim()`s it).
// Without a shared rule a customer registers successfully, sees "ลงทะเบียน
// สำเร็จ", and then never receives anything — indistinguishable, from the
// team's side, from "they never registered".
//
// Rule (deliberately small — this is not a full libphonenumber):
//   1. Drop every non-digit character (spaces, dashes, parentheses, a leading +).
//   2. If what's left looks country-code-prefixed (starts with "66" and is
//      longer than a bare local number, i.e. > 9 digits), swap that "66" for a
//      single leading "0" — the Thai domestic form, which is what Makro's
//      export and therefore orders.customer_phone actually contains.
// Anything else passes through as bare digits. An input with no digits at all
// normalizes to '' — callers must treat that as "no usable phone".
//
// Kept dependency-free (no Deno/network APIs) so plain vitest can exercise it
// — see phone.test.ts.
export function normalizePhone(raw: string): string {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('66') && digits.length > 9) return '0' + digits.slice(2)
  return digits
}
