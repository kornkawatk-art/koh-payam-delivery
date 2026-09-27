import { enrollTotp, verifyEnroll } from './mfa'
import { supabase } from './supabase'

vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      refreshSession: vi.fn(),
      mfa: {
        enroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
      },
    },
  },
}))

const auth = supabase.auth as unknown as {
  refreshSession: ReturnType<typeof vi.fn>
  mfa: Record<'enroll' | 'challenge' | 'verify', ReturnType<typeof vi.fn>>
}

const ENROLLED = {
  data: { id: 'f1', totp: { qr_code: '<svg/>', secret: 'ABC123' } },
  error: null,
}
// Exactly what GoTrue returns when the access token is past its exp.
const EXPIRED = {
  data: null,
  error: {
    message:
      'invalid JWT: unable to parse or verify signature, token has invalid claims: token is expired',
  },
}

beforeEach(() => {
  auth.refreshSession.mockReset().mockResolvedValue({ data: { session: {} }, error: null })
  auth.mfa.enroll.mockReset().mockResolvedValue(ENROLLED)
  auth.mfa.challenge.mockReset().mockResolvedValue({ data: { id: 'c1' }, error: null })
  auth.mfa.verify.mockReset().mockResolvedValue({ data: {}, error: null })
})

test('enrollTotp returns factor id, qr, secret', async () => {
  const r = await enrollTotp()
  expect(r).toEqual({ factorId: 'f1', qrSvg: '<svg/>', secret: 'ABC123' })
  expect(auth.refreshSession).not.toHaveBeenCalled()
})

// A device clock running behind makes supabase-js think an already-expired
// access token is still fresh, so it sends it without refreshing and the
// server rejects it. The fix: on that specific rejection, force a refresh
// (a server round trip, independent of the local clock) and retry once.
test('enrollTotp: a server-side "token is expired" forces a session refresh and retries once', async () => {
  auth.mfa.enroll.mockResolvedValueOnce(EXPIRED).mockResolvedValueOnce(ENROLLED)
  const r = await enrollTotp()
  expect(auth.refreshSession).toHaveBeenCalledTimes(1)
  expect(auth.mfa.enroll).toHaveBeenCalledTimes(2)
  expect(r.factorId).toBe('f1')
})

test('enrollTotp: if the refresh itself fails, the original error surfaces (no retry loop)', async () => {
  auth.mfa.enroll.mockResolvedValue(EXPIRED)
  auth.refreshSession.mockResolvedValue({ data: { session: null }, error: { message: 'bad refresh' } })
  await expect(enrollTotp()).rejects.toThrow(/token is expired/)
  expect(auth.mfa.enroll).toHaveBeenCalledTimes(1)
})

test('enrollTotp: other errors are not retried', async () => {
  auth.mfa.enroll.mockResolvedValue({ data: null, error: { message: 'factor limit reached' } })
  await expect(enrollTotp()).rejects.toThrow('factor limit reached')
  expect(auth.refreshSession).not.toHaveBeenCalled()
})

test('verifyEnroll: an expired token on the challenge step is refreshed and retried too', async () => {
  auth.mfa.challenge.mockResolvedValueOnce(EXPIRED).mockResolvedValueOnce({ data: { id: 'c1' }, error: null })
  expect(await verifyEnroll('f1', '123456')).toEqual({})
  expect(auth.refreshSession).toHaveBeenCalledTimes(1)
  expect(auth.mfa.verify).toHaveBeenCalledWith({ factorId: 'f1', challengeId: 'c1', code: '123456' })
})
