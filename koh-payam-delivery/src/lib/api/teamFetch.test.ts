const { getSession, refreshSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}))
vi.mock('../supabase', () => ({ supabase: { auth: { getSession, refreshSession } } }))

import { fetchWithTeamSession } from './teamFetch'

const fetchMock = vi.fn()
const res = (status: number) => ({ ok: status < 400, status }) as Response
const URL_ = 'https://x.supabase.co/functions/v1/photo-upload-url'
const auth = (call: number) => fetchMock.mock.calls[call][1].headers.Authorization

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockResolvedValue(res(200))
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'old' } } })
  refreshSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'new' } } })
})

test('sends the current session token over the fallback header', async () => {
  const r = await fetchWithTeamSession(URL_, { method: 'POST', headers: { Authorization: 'Bearer anon' } })
  expect(r.status).toBe(200)
  expect(auth(0)).toBe('Bearer old')
  expect(refreshSession).not.toHaveBeenCalled()
})

// A device clock running behind makes getSession() hand back a token the
// server already considers expired (see jwtRetry.ts); the function gateway
// answers 401. Refresh once (server round trip, clock-independent) and retry.
test('a 401 with a session token refreshes once and retries with the new token', async () => {
  fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(200))
  const r = await fetchWithTeamSession(URL_, { method: 'POST', headers: {} })
  expect(r.status).toBe(200)
  expect(refreshSession).toHaveBeenCalledTimes(1)
  expect(auth(1)).toBe('Bearer new')
})

test('no retry without a session (the anon key 401 is a real denial), or when refresh fails', async () => {
  getSession.mockResolvedValue({ data: { session: null } })
  fetchMock.mockResolvedValue(res(401))
  expect((await fetchWithTeamSession(URL_, { headers: { Authorization: 'Bearer anon' } })).status).toBe(401)
  expect(refreshSession).not.toHaveBeenCalled()

  getSession.mockResolvedValue({ data: { session: { access_token: 'old' } } })
  refreshSession.mockResolvedValue({ data: { session: null } })
  expect((await fetchWithTeamSession(URL_, { headers: {} })).status).toBe(401)
  expect(fetchMock).toHaveBeenCalledTimes(2) // one per call, no retry
})
