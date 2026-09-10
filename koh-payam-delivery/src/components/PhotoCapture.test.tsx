import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PhotoCapture from './PhotoCapture'

const compressImage = vi.fn()
const requestUploadUrl = vi.fn()

vi.mock('../lib/image', () => ({
  compressImage: (...a: unknown[]) => compressImage(...a),
}))
vi.mock('../lib/api/photos', () => ({
  requestUploadUrl: (...a: unknown[]) => requestUploadUrl(...a),
}))

const fetchMock = vi.fn()

const jpeg = () => new Blob(['x'], { type: 'image/jpeg' })
const pickFile = (name = 'a.jpg') => new File(['x'], name, { type: 'image/jpeg' })

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200 })
  compressImage.mockReset().mockResolvedValue(jpeg())
  requestUploadUrl.mockReset()
  let n = 0
  requestUploadUrl.mockImplementation(() => {
    n += 1
    return Promise.resolve({
      uploadUrl: `https://r2.example/put-${n}?X-Amz-Signature=s`,
      key: `evidence/o1/key-${n}.jpg`,
      publicUrl: `https://pub.example/evidence/o1/key-${n}.jpg`,
    })
  })
  // jsdom has no URL.createObjectURL
  ;(URL as any).createObjectURL = vi.fn(() => 'blob:thumb')
  ;(URL as any).revokeObjectURL = vi.fn()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const input = () => screen.getByLabelText('ถ่ายรูป / เลือกรูป') as HTMLInputElement

test('evidence: compresses, requests a URL, PUTs the blob to R2, and reports the key', async () => {
  const onUploaded = vi.fn()
  render(<PhotoCapture scope="evidence" orderId="o1" onUploaded={onUploaded} max={3} />)

  await userEvent.upload(input(), pickFile())

  await waitFor(() => expect(onUploaded).toHaveBeenCalledWith('evidence/o1/key-1.jpg'))
  expect(compressImage).toHaveBeenCalledWith(expect.any(File))
  expect(requestUploadUrl).toHaveBeenCalledWith({
    scope: 'evidence',
    orderId: 'o1',
    contentType: 'image/jpeg',
    stage: 'handoff',
  })
  const [url, init] = fetchMock.mock.calls[0]
  expect(url).toBe('https://r2.example/put-1?X-Amz-Signature=s')
  expect(init.method).toBe('PUT')
  expect(init.headers['content-type']).toBe('image/jpeg')
  expect(init.body).toBeInstanceOf(Blob)
  expect(screen.getByText('1 / 3 รูป')).toBeInTheDocument()
})

test('evidence: forwards stage="pack" to the upload-url request', async () => {
  render(<PhotoCapture scope="evidence" orderId="o1" stage="pack" onUploaded={vi.fn()} />)
  await userEvent.upload(input(), pickFile())
  await waitFor(() =>
    expect(requestUploadUrl).toHaveBeenCalledWith({
      scope: 'evidence',
      orderId: 'o1',
      contentType: 'image/jpeg',
      stage: 'pack',
    }),
  )
})

test('no max: input never locks and the count omits the "/ N"', async () => {
  render(<PhotoCapture scope="evidence" orderId="o1" onUploaded={vi.fn()} />)
  await userEvent.upload(input(), pickFile())
  await waitFor(() => expect(screen.getByText('1 รูป')).toBeInTheDocument())
  expect(input()).not.toBeDisabled()
  await userEvent.upload(input(), pickFile())
  await waitFor(() => expect(screen.getByText('2 รูป')).toBeInTheDocument())
  expect(input()).not.toBeDisabled()
})

test('claim: passes the token instead of an orderId', async () => {
  render(<PhotoCapture scope="claim" token="t-1" onUploaded={vi.fn()} />)
  await userEvent.upload(input(), pickFile())
  await waitFor(() =>
    expect(requestUploadUrl).toHaveBeenCalledWith({
      scope: 'claim',
      token: 't-1',
      contentType: 'image/jpeg',
    }),
  )
})

test('renders one thumbnail per uploaded photo', async () => {
  render(<PhotoCapture scope="evidence" orderId="o1" onUploaded={vi.fn()} />)
  await userEvent.upload(input(), pickFile())
  await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(1))
})

test('disables the input once max is reached', async () => {
  render(<PhotoCapture scope="evidence" orderId="o1" onUploaded={vi.fn()} max={1} />)
  expect(input()).not.toBeDisabled()
  await userEvent.upload(input(), pickFile())
  await waitFor(() => expect(input()).toBeDisabled())
  expect(screen.getByText('1 / 1 รูป')).toBeInTheDocument()
})

test('a multi-file selection only consumes the remaining slots', async () => {
  const onUploaded = vi.fn()
  render(<PhotoCapture scope="evidence" orderId="o1" onUploaded={onUploaded} max={2} />)
  await userEvent.upload(input(), [pickFile('a.jpg'), pickFile('b.jpg'), pickFile('c.jpg')])
  await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(2))
  expect(requestUploadUrl).toHaveBeenCalledTimes(2)
})

test('a failed R2 PUT surfaces a Thai error and does not report a key', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 500 })
  const onUploaded = vi.fn()
  render(<PhotoCapture scope="evidence" orderId="o1" onUploaded={onUploaded} />)
  await userEvent.upload(input(), pickFile())
  expect(await screen.findByText(/อัปโหลดรูปไม่สำเร็จ/)).toBeInTheDocument()
  expect(onUploaded).not.toHaveBeenCalled()
})

test('a failed URL request surfaces its Thai error', async () => {
  requestUploadUrl.mockReset().mockRejectedValue(new Error('ขอลิงก์อัปโหลดรูปไม่สำเร็จ (403)'))
  render(<PhotoCapture scope="claim" token="t-1" onUploaded={vi.fn()} />)
  await userEvent.upload(input(), pickFile())
  expect(await screen.findByText('ขอลิงก์อัปโหลดรูปไม่สำเร็จ (403)')).toBeInTheDocument()
})
