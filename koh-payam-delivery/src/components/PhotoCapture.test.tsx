import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
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
  expect(requestUploadUrl).toHaveBeenCalledWith(
    {
      scope: 'evidence',
      orderId: 'o1',
      contentType: 'image/jpeg',
      stage: 'handoff',
    },
    expect.any(AbortSignal),
  )
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
    expect(requestUploadUrl).toHaveBeenCalledWith(
      {
        scope: 'evidence',
        orderId: 'o1',
        contentType: 'image/jpeg',
        stage: 'pack',
      },
      expect.any(AbortSignal),
    ),
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
    expect(requestUploadUrl).toHaveBeenCalledWith(
      {
        scope: 'claim',
        token: 't-1',
        contentType: 'image/jpeg',
      },
      expect.any(AbortSignal),
    ),
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

test('remounts the file input after each pick (Android Chrome repeat-capture workaround)', async () => {
  // Some mobile browsers don't reliably fire a second native `change` event on
  // a *reused* file input after a camera capture. We force a fresh DOM node
  // (new `key`) after every pick instead of relying on `.value = ''` alone.
  render(<PhotoCapture scope="evidence" orderId="o1" onUploaded={vi.fn()} />)
  const first = input()
  await userEvent.upload(first, pickFile())
  await waitFor(() => expect(screen.getByText('1 รูป')).toBeInTheDocument())
  const second = input()
  expect(second).not.toBe(first)
})

test('an empty pick (camera cancelled/backgrounded) surfaces a Thai message instead of going silent', async () => {
  render(<PhotoCapture scope="evidence" orderId="o1" onUploaded={vi.fn()} />)
  const el = input()
  Object.defineProperty(el, 'files', { value: [], configurable: true })
  fireEvent.change(el)

  expect(
    await screen.findByText('ไม่ได้รับรูปจากกล้อง/คลังภาพ กรุณาลองอีกครั้ง'),
  ).toBeInTheDocument()
  expect(requestUploadUrl).not.toHaveBeenCalled()
})

test('does not use capture="environment" — shows the OS camera-or-gallery chooser instead', () => {
  render(<PhotoCapture scope="evidence" orderId="o1" onUploaded={vi.fn()} />)
  expect(input()).not.toHaveAttribute('capture')
})

test('a hung upload (weak signal) times out, aborts, and surfaces a retryable Thai error', async () => {
  vi.useFakeTimers()
  try {
    // Never resolves on its own — only settles if its AbortSignal fires, the
    // way a real fetch would once the request is aborted.
    requestUploadUrl.mockReset().mockImplementation(
      (_args: unknown, signal?: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    )
    render(<PhotoCapture scope="evidence" orderId="o1" onUploaded={vi.fn()} />)
    const el = input()
    Object.defineProperty(el, 'files', { value: [pickFile()], configurable: true })
    fireEvent.change(el)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(25_000)
    })

    expect(
      screen.getByText('อัปโหลดรูปไม่สำเร็จ (สัญญาณอินเทอร์เน็ตช้าหรือขาดหาย) กรุณาลองใหม่อีกครั้ง'),
    ).toBeInTheDocument()
    expect(input()).not.toBeDisabled() // busy cleared — the input is retryable, not stuck
  } finally {
    vi.useRealTimers()
  }
})

test('a failed URL request surfaces its Thai error', async () => {
  requestUploadUrl.mockReset().mockRejectedValue(new Error('ขอลิงก์อัปโหลดรูปไม่สำเร็จ (403)'))
  render(<PhotoCapture scope="claim" token="t-1" onUploaded={vi.fn()} />)
  await userEvent.upload(input(), pickFile())
  expect(await screen.findByText('ขอลิงก์อัปโหลดรูปไม่สำเร็จ (403)')).toBeInTheDocument()
})
