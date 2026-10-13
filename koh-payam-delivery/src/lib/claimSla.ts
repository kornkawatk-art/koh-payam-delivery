// How long a manager has to decide a claim, and how its status reads in Thai.
// The clock starts when the customer reports (claims.created_at), not at the
// end of the 48h claim window, so a claim sent in late still gets a full day.

export const RESPOND_MS = 24 * 60 * 60 * 1000

/** When a decision is due (epoch ms). */
export const respondBy = (createdAt: string) => new Date(createdAt).getTime() + RESPOND_MS

/** "เหลือ 5 ชม." before the due time, "เกินมา 3 ชม." after it. */
export function timeLeft(createdAt: string, now: number = Date.now()): { late: boolean; label: string } {
  const diff = respondBy(createdAt) - now
  const late = diff < 0
  const ms = Math.abs(diff)
  const mins = Math.round(ms / 60000)
  const hours = Math.floor(ms / 3600000)
  const days = Math.floor(ms / 86400000)
  const span = days >= 1 ? `${days} วัน` : hours >= 1 ? `${hours} ชม.` : `${mins} นาที`
  return { late, label: late ? `เกินมา ${span}` : `เหลือ ${span}` }
}

/** Thai status label + badge tone, from claims.status and claims.resolution. */
export function claimStatusTH(status: string, resolution: string | null): { label: string; tone: string } {
  if (status === 'open') return { label: 'รอตัดสิน', tone: 'badge-warn' }
  if (status === 'rejected') return { label: 'ปฏิเสธ', tone: 'badge-neutral' }
  if (resolution === 'resend_next_day')
    return status === 'closed'
      ? { label: 'ส่งชดเชยแล้ว', tone: 'badge-ok' }
      : { label: 'อนุมัติ · รอส่งชดเชย', tone: 'badge-brand' }
  return { label: 'อนุมัติ · คืนเงิน', tone: 'badge-ok' }
}
