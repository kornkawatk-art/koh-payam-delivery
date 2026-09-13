import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LineRegister from './LineRegister'

const liffMock = vi.hoisted(() => ({
  init: vi.fn(),
  isLoggedIn: vi.fn(),
  login: vi.fn(),
  getIDToken: vi.fn(),
}))

vi.mock('@line/liff', () => ({ default: liffMock }))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ok: true }),
  })
  liffMock.init.mockReset().mockResolvedValue(undefined)
  liffMock.isLoggedIn.mockReset().mockReturnValue(true)
  liffMock.login.mockReset()
  liffMock.getIDToken.mockReset().mockReturnValue('id-token-123')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
const lastBody = () => JSON.parse((lastCall()[1] as RequestInit).body as string)

test('on mount, initializes LIFF and does not call login when already logged in', async () => {
  render(<LineRegister />)

  await waitFor(() => expect(liffMock.init).toHaveBeenCalled())
  expect(liffMock.isLoggedIn).toHaveBeenCalled()
  expect(liffMock.login).not.toHaveBeenCalled()
  expect(await screen.findByLabelText('เบอร์โทรศัพท์')).toBeInTheDocument()
})

test('on mount, calls liff.login() when not logged in inside the LIFF context', async () => {
  liffMock.isLoggedIn.mockReturnValue(false)
  render(<LineRegister />)

  await waitFor(() => expect(liffMock.login).toHaveBeenCalled())
  // Still showing the connecting state — login() navigates away, no form yet.
  expect(screen.queryByLabelText('เบอร์โทรศัพท์')).not.toBeInTheDocument()
})

test('happy path: submits {idToken, phone} to register-line-contact and shows success', async () => {
  render(<LineRegister />)

  const phoneInput = await screen.findByLabelText('เบอร์โทรศัพท์')
  await userEvent.type(phoneInput, '0812345678')
  await userEvent.click(screen.getByRole('button', { name: 'ลงทะเบียน' }))

  await waitFor(() => expect(screen.getByText(/ลงทะเบียนสำเร็จ/)).toBeInTheDocument())

  const [url, init] = lastCall()
  expect(String(url)).toContain('/functions/v1/register-line-contact')
  expect((init as RequestInit).method).toBe('POST')
  expect((init as RequestInit).headers).toMatchObject({
    'Content-Type': 'application/json',
    Authorization: expect.stringMatching(/^Bearer /),
  })
  expect(lastBody()).toEqual({ idToken: 'id-token-123', phone: '0812345678' })
})

test('trims the phone before sending it (defence in depth on top of the server-side normalize)', async () => {
  render(<LineRegister />)

  const phoneInput = await screen.findByLabelText('เบอร์โทรศัพท์')
  await userEvent.type(phoneInput, '  0812345678  ')
  await userEvent.click(screen.getByRole('button', { name: 'ลงทะเบียน' }))

  await waitFor(() => expect(screen.getByText(/ลงทะเบียนสำเร็จ/)).toBeInTheDocument())
  expect(lastBody()).toEqual({ idToken: 'id-token-123', phone: '0812345678' })
})

test('a pending response (cross-account overwrite) shows the pending message, not success', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ok: true, pending: true }),
  })
  render(<LineRegister />)

  const phoneInput = await screen.findByLabelText('เบอร์โทรศัพท์')
  await userEvent.type(phoneInput, '0812345678')
  await userEvent.click(screen.getByRole('button', { name: 'ลงทะเบียน' }))

  expect(await screen.findByText(/คำขอกำลังรอตรวจสอบ/)).toBeInTheDocument()
  expect(screen.queryByText(/ลงทะเบียนสำเร็จ/)).not.toBeInTheDocument()
  // the form should not still be showing either
  expect(screen.queryByLabelText('เบอร์โทรศัพท์')).not.toBeInTheDocument()
})

test('a failed registration shows a Thai error and does not crash', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    status: 401,
    json: () => Promise.resolve({ error: 'ยืนยันตัวตน LINE ไม่สำเร็จ' }),
  })
  render(<LineRegister />)

  const phoneInput = await screen.findByLabelText('เบอร์โทรศัพท์')
  await userEvent.type(phoneInput, '0812345678')
  await userEvent.click(screen.getByRole('button', { name: 'ลงทะเบียน' }))

  expect(await screen.findByText('ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')).toBeInTheDocument()
  expect(screen.queryByText(/ลงทะเบียนสำเร็จ/)).not.toBeInTheDocument()
})

test('liff.init() failure shows a Thai connection error instead of the form', async () => {
  liffMock.init.mockRejectedValue(new Error('init failed'))
  render(<LineRegister />)

  expect(await screen.findByText(/เชื่อมต่อ LINE ไม่สำเร็จ/)).toBeInTheDocument()
  expect(screen.queryByLabelText('เบอร์โทรศัพท์')).not.toBeInTheDocument()
})
