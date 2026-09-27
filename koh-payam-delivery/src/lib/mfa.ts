import { supabase } from './supabase'
import { isExpiredJwtMessage } from './jwtRetry'

/**
 * Run an auth (GoTrue) call; if the server rejects the access token as
 * expired -- which happens on devices whose clock runs behind, see
 * jwtRetry.ts -- force a session refresh and run it once more. Done here,
 * outside supabase-js's session lock, because the fetch-level retry in
 * supabase.ts deliberately skips auth endpoints.
 */
async function retryIfExpired<T extends { error: { message: string } | null }>(
  call: () => Promise<T>,
): Promise<T> {
  const first = await call()
  if (!first.error || !isExpiredJwtMessage(first.error.message)) return first
  const { error } = await supabase.auth.refreshSession()
  if (error) return first
  return call()
}

export async function enrollTotp() {
  const { data, error } = await retryIfExpired(() =>
    supabase.auth.mfa.enroll({ factorType: 'totp' }),
  )
  if (error || !data) throw new Error(error?.message ?? 'สมัคร 2FA ไม่สำเร็จ')
  return { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret }
}

export async function verifyEnroll(factorId: string, code: string) {
  const ch = await retryIfExpired(() => supabase.auth.mfa.challenge({ factorId }))
  if (ch.error) return { error: ch.error.message }
  const v = await retryIfExpired(() =>
    supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code }),
  )
  return v.error ? { error: v.error.message } : {}
}

export const challengeAndVerify = verifyEnroll

export async function listFactors() {
  const { data } = await supabase.auth.mfa.listFactors()
  return {
    totp: (data?.totp ?? [])
      .filter((f) => f.status === 'verified')
      .map((f) => ({ id: f.id, status: f.status })),
  }
}
