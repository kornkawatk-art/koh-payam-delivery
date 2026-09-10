import { supabase } from './supabase'

export async function enrollTotp() {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (error || !data) throw new Error(error?.message ?? 'สมัคร 2FA ไม่สำเร็จ')
  return { factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret }
}

export async function verifyEnroll(factorId: string, code: string) {
  const ch = await supabase.auth.mfa.challenge({ factorId })
  if (ch.error) return { error: ch.error.message }
  const v = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code })
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
