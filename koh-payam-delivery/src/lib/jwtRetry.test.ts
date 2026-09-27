import { isExpiredJwtMessage, withExpiredJwtRetry } from './jwtRetry'

const REST = 'https://x.supabase.co/rest/v1/orders?select=*'
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

test('recognises both PostgREST and GoTrue expired-token messages, nothing else', () => {
  expect(isExpiredJwtMessage('JWT expired')).toBe(true)
  expect(
    isExpiredJwtMessage('invalid JWT: unable to parse or verify signature, token has invalid claims: token is expired'),
  ).toBe(true)
  expect(isExpiredJwtMessage('permission denied for table orders')).toBe(false)
})

test('a 401 "JWT expired" triggers one refresh and a retry with the new bearer token', async () => {
  const base = vi
    .fn()
    .mockResolvedValueOnce(json(401, { code: 'PGRST301', message: 'JWT expired' }))
    .mockResolvedValueOnce(json(200, [{ id: 1 }]))
  const refresh = vi.fn().mockResolvedValue('new-token')
  const f = withExpiredJwtRetry(base, refresh)

  const res = await f(REST, { headers: { Authorization: 'Bearer old-token', apikey: 'anon' } })

  expect(res.status).toBe(200)
  expect(refresh).toHaveBeenCalledTimes(1)
  const retried = new Headers(base.mock.calls[1][1].headers)
  expect(retried.get('Authorization')).toBe('Bearer new-token')
  expect(retried.get('apikey')).toBe('anon') // other headers kept
})

test('other 401s and non-401s pass through untouched', async () => {
  const refresh = vi.fn()
  const denied = withExpiredJwtRetry(vi.fn().mockResolvedValue(json(401, { message: 'permission denied' })), refresh)
  expect((await denied(REST, {})).status).toBe(401)
  const ok = withExpiredJwtRetry(vi.fn().mockResolvedValue(json(200, [])), refresh)
  expect((await ok(REST, {})).status).toBe(200)
  expect(refresh).not.toHaveBeenCalled()
})

// Auth (GoTrue) calls run inside supabase-js's session lock; refreshing from
// within them would wait on the lock the caller holds. Those are retried at
// the call site instead (see mfa.ts).
test('auth endpoints are never retried here', async () => {
  const base = vi.fn().mockResolvedValue(json(401, { message: 'token is expired' }))
  const refresh = vi.fn()
  const res = await withExpiredJwtRetry(base, refresh)('https://x.supabase.co/auth/v1/factors', {})
  expect(res.status).toBe(401)
  expect(refresh).not.toHaveBeenCalled()
  expect(base).toHaveBeenCalledTimes(1)
})

test('if the refresh yields no token, the original 401 is returned (no loop)', async () => {
  const base = vi.fn().mockResolvedValue(json(401, { message: 'JWT expired' }))
  const res = await withExpiredJwtRetry(base, vi.fn().mockResolvedValue(null))(REST, {})
  expect(res.status).toBe(401)
  expect(base).toHaveBeenCalledTimes(1)
})
