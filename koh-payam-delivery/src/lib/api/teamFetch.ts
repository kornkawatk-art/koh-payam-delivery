import { supabase } from '../supabase'

/**
 * fetch() to an Edge Function as the signed-in team member: attaches the
 * session's access token (over whatever fallback Authorization the caller
 * set, e.g. the anon key), and on a 401 refreshes the session once and
 * retries. The retry covers devices whose clock runs behind, where
 * getSession() returns a token the server already considers expired (see
 * jwtRetry.ts). Without a session there is nothing to refresh, so a 401 is
 * returned as-is.
 */
export async function fetchWithTeamSession(
  url: string,
  init: RequestInit & { headers: Record<string, string> },
): Promise<Response> {
  const { data: sess } = await supabase.auth.getSession()
  const headers = { ...init.headers }
  if (sess.session) headers.Authorization = `Bearer ${sess.session.access_token}`
  const res = await fetch(url, { ...init, headers })
  if (res.status !== 401 || !sess.session) return res

  const { data } = await supabase.auth.refreshSession()
  if (!data.session) return res
  return fetch(url, {
    ...init,
    headers: { ...headers, Authorization: `Bearer ${data.session.access_token}` },
  })
}
