// How long a customer's order link and its claim button stay open, counted
// from shipped_at. Viewing outlasts claiming: customers can look back for a
// week, but a problem must be reported within 48 hours (submit-claim and
// photo-upload-url enforce that on the server too).

export const CLAIM_WINDOW_MS = 48 * 60 * 60 * 1000
export const LINK_VIEW_MS = 7 * 24 * 60 * 60 * 1000

/** Valid until 7 days after shipping; an order not shipped yet is always valid. */
export function isLinkValid(shippedAt: string | null, now: number = Date.now()): boolean {
  if (!shippedAt) return true
  return now - new Date(shippedAt).getTime() <= LINK_VIEW_MS
}
