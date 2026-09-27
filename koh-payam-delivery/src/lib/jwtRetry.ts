/**
 * Recovery from "the server says this access token has expired".
 *
 * Root cause: supabase-js decides whether the stored access token is still
 * fresh by comparing its `exp` (set by the server's clock) with the DEVICE
 * clock. On a computer whose clock runs behind, an already-expired token
 * still looks fresh locally, so it is sent without refreshing and the server
 * rejects it -- e.g. a clock 10 minutes slow gives a ~8.5-minute window every
 * hour where every request fails. We can't fix users' clocks, but a forced
 * refresh is a server round trip and doesn't depend on them: on that specific
 * rejection, refresh once and retry.
 */

// PostgREST: "JWT expired"; GoTrue: "... token has invalid claims: token is expired".
const EXPIRED_JWT = /jwt expired|token is expired/i

export const isExpiredJwtMessage = (message: string | undefined | null) =>
  EXPIRED_JWT.test(message ?? '')

/**
 * Wraps a fetch so a 401 caused by an expired JWT is retried once with a
 * freshly refreshed access token. `refresh` returns the new access token (or
 * null when the refresh failed -- then the original 401 is returned).
 *
 * Auth (/auth/v1/) requests are passed through untouched: supabase-js makes
 * those while holding its session lock, and refreshing from inside one would
 * wait on that same lock. Auth calls are retried at their call site instead
 * (see mfa.ts).
 */
export function withExpiredJwtRetry(
  baseFetch: typeof fetch,
  refresh: () => Promise<string | null>,
): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const res = await baseFetch(input, init)
    if (res.status !== 401 || url.includes('/auth/v1/')) return res
    const body = await res
      .clone()
      .text()
      .catch(() => '')
    if (!isExpiredJwtMessage(body)) return res

    const token = await refresh()
    if (!token) return res
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${token}`)
    return baseFetch(input, { ...init, headers })
  }
}
