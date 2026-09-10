import { requestUploadUrl, attachEvidencePhoto } from './photos'

const ANON = `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`

const getSession = vi.fn()
const getUser = vi.fn()

const state = {
  insertError: null as { message: string } | null,
  inserts: [] as { table: string; row: any }[],
}

vi.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => getSession(...a),
      getUser: (...a: unknown[]) => getUser(...a),
    },
    from: (table: string) => ({
      insert: (row: any) => {
        state.inserts.push({ table, row })
        return Promise.resolve({ error: state.insertError })
      },
    }),
  },
}))

const fetchMock = vi.fn()

const okUploadResponse = () => ({
  ok: true,
  status: 200,
  json: () =>
    Promise.resolve({
      uploadUrl: 'https://acc.r2.cloudflarestorage.com/bkt/evidence/o1/u.jpg?X-Amz-Signature=abc',
      key: 'evidence/o1/u.jpg',
      publicUrl: 'https://pub.r2.dev/evidence/o1/u.jpg',
    }),
})

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockResolvedValue(okUploadResponse())
  getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'tok-123' } } })
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } } })
  state.insertError = null
  state.inserts = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('requestUploadUrl (evidence) POSTs to the edge function with a bearer token and returns the parsed body', async () => {
  const res = await requestUploadUrl({ scope: 'evidence', orderId: 'o1', contentType: 'image/jpeg' })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toEqual(expect.stringContaining('/functions/v1/photo-upload-url'))
  expect(init.method).toBe('POST')
  expect(init.headers.Authorization).toBe('Bearer tok-123')
  expect(init.headers['Content-Type']).toBe('application/json')
  expect(JSON.parse(init.body)).toEqual({
    scope: 'evidence',
    orderId: 'o1',
    contentType: 'image/jpeg',
  })
  expect(res.key).toBe('evidence/o1/u.jpg')
  expect(res.uploadUrl).toContain('X-Amz-Signature=')
  expect(res.publicUrl).toBe('https://pub.r2.dev/evidence/o1/u.jpg')
})

test('requestUploadUrl (claim) sends the anon bearer header and passes the token', async () => {
  await requestUploadUrl({ scope: 'claim', token: 't-1', contentType: 'image/webp' })
  const [, init] = fetchMock.mock.calls[0]
  expect(init.headers.Authorization).toBe(ANON)
  expect(JSON.parse(init.body)).toEqual({
    scope: 'claim',
    token: 't-1',
    contentType: 'image/webp',
  })
})

test('requestUploadUrl (evidence) falls back to the anon bearer header when there is no session', async () => {
  getSession.mockResolvedValue({ data: { session: null } })
  await requestUploadUrl({ scope: 'evidence', orderId: 'o1', contentType: 'image/jpeg' })
  const [, init] = fetchMock.mock.calls[0]
  expect(init.headers.Authorization).toBe(ANON)
})

test('requestUploadUrl throws a Thai error carrying the status code on a non-ok response', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({}) })
  await expect(
    requestUploadUrl({ scope: 'claim', token: 't-1', contentType: 'image/jpeg' }),
  ).rejects.toThrow('ขอลิงก์อัปโหลดรูปไม่สำเร็จ (403)')
})

test('attachEvidencePhoto inserts into evidence_photos with r2_key, note, taken_by = auth uid and the given stage', async () => {
  await attachEvidencePhoto('o1', 'evidence/o1/u.jpg', { note: 'หน้ากล่อง', stage: 'pack' })
  expect(state.inserts).toEqual([
    {
      table: 'evidence_photos',
      row: {
        order_id: 'o1',
        r2_key: 'evidence/o1/u.jpg',
        note: 'หน้ากล่อง',
        taken_by: 'u1',
        stage: 'pack',
      },
    },
  ])
})

test('attachEvidencePhoto defaults a missing note to null and stage to "handoff"', async () => {
  await attachEvidencePhoto('o1', 'evidence/o1/u.jpg')
  expect(state.inserts[0].row.note).toBeNull()
  expect(state.inserts[0].row.stage).toBe('handoff')
})

test('attachEvidencePhoto throws a Thai error when the insert fails', async () => {
  state.insertError = { message: 'boom' }
  await expect(attachEvidencePhoto('o1', 'k')).rejects.toThrow('บันทึกรูปไม่สำเร็จ: boom')
})
