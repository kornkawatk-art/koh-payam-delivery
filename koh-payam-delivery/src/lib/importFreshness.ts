// "Makro data is late" rule, a copy of the one in Makro Claim's
// supabase/functions/makro-notify/logic.ts (importLateMs), which also reminds the team.
// Keep the two in step: late = 2 h old within 08:00-20:00 Thai time, counted from
// the later of the import and 08:00 today.

const HOUR_MS = 3_600_000
export const IMPORT_STALE_MS = 2 * HOUR_MS
export const IMPORT_WORK_HOURS = { start: 8, end: 20 }

/** How late the data is now (0 = on time, and always 0 outside work hours or before the first import) */
export function importLateMs(asOf: string | null, now: number): number {
  if (!asOf) return 0
  const thai = new Date(now + 7 * HOUR_MS)
  const hour = thai.getUTCHours()
  if (hour < IMPORT_WORK_HOURS.start || hour >= IMPORT_WORK_HOURS.end) return 0
  const workStart =
    Date.UTC(thai.getUTCFullYear(), thai.getUTCMonth(), thai.getUTCDate(), IMPORT_WORK_HOURS.start) - 7 * HOUR_MS
  const age = now - Math.max(Date.parse(asOf), workStart)
  return age >= IMPORT_STALE_MS ? age : 0
}
