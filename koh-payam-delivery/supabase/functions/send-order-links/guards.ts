// Pure guards for send-order-links, factored out of index.ts for the same
// reason dedup.ts was: there is no Deno test harness in this repo, but this
// logic is plain enough that vitest can cover it directly (guards.test.ts).

/**
 * "Today" as a YYYY-MM-DD calendar date **in Asia/Bangkok**, regardless of what
 * timezone the edge runtime happens to be in.
 *
 * This must NOT be `new Date().toISOString().slice(0, 10)`: Deno's edge runtime
 * runs in UTC, and this feature fires when a team member saves the day's boat
 * list — between roughly 00:00 and 07:00 Thailand time, which in UTC is still
 * *the previous calendar day*. A naive UTC comparison would therefore decide
 * "not today" for every real morning run, i.e. it would break exactly the
 * window the feature exists for.
 */
export function bangkokToday(now: Date = new Date()): string {
  // 'en-CA' is the locale that formats as YYYY-MM-DD.
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/**
 * Which of the LINE secrets are missing. Both default to '' when unset, which
 * is the *expected* state on first deploy (the team provisions them from the
 * LINE Console after review). Sending with either one empty is worse than not
 * sending: a missing channel token means every push fails, and a missing
 * SITE_URL means real messages go out carrying a broken link. Either way the
 * caller must bail out BEFORE touching ship_days.links_sent_at, so the one-shot
 * guard is not burned on a day nothing was actually attempted.
 */
export function missingLineSecrets(
  channelToken: string | null | undefined,
  siteUrl: string | null | undefined,
): string[] {
  const missing: string[] = []
  if (!String(channelToken ?? '').trim()) missing.push('LINE_CHANNEL_ACCESS_TOKEN')
  if (!String(siteUrl ?? '').trim()) missing.push('SITE_URL')
  return missing
}
