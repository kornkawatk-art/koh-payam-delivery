// "Makro data is late" rule, a copy of the one in Makro Claim's
// supabase/functions/makro-notify/logic.ts (importLateMs), which also reminds the team.
// Keep the two in step: the store works around the clock and the AO bot imports every
// hour, so data is late once 2 h old, at any hour.

const HOUR_MS = 3_600_000
export const IMPORT_STALE_MS = 2 * HOUR_MS

/** How late the data is now (0 = on time, and 0 before the first import) */
export function importLateMs(asOf: string | null, now: number): number {
  if (!asOf) return 0
  const age = now - Date.parse(asOf)
  return age >= IMPORT_STALE_MS ? age : 0
}
