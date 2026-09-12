import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import QrOrderScanner from './QrOrderScanner'

// The camera itself cannot be exercised under vitest/jsdom — html5-qrcode is
// mocked entirely here. Only the surrounding lookup/branching logic is
// tested: what the component does with a decoded value, given a mocked
// decode result.
let capturedSuccessCallback: ((text: string) => void) | null = null
const startMock = vi.fn()
const stopMock = vi.fn().mockResolvedValue(undefined)

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    isScanning = false
    constructor(public elementId: string) {}
    start(
      cameraIdOrConfig: unknown,
      config: unknown,
      successCb: (text: string) => void,
      errorCb: unknown,
    ) {
      capturedSuccessCallback = successCb
      this.isScanning = true
      startMock(cameraIdOrConfig, config, successCb, errorCb)
      return Promise.resolve(null)
    }
    stop() {
      this.isScanning = false
      return stopMock()
    }
  },
}))

const findOrdersByMakroOrderNo = vi.fn()
vi.mock('../lib/api/orders', () => ({
  findOrdersByMakroOrderNo: (...a: unknown[]) => findOrdersByMakroOrderNo(...a),
}))

beforeEach(() => {
  capturedSuccessCallback = null
  startMock.mockClear()
  stopMock.mockClear()
  findOrdersByMakroOrderNo.mockReset()
})

async function renderScanner() {
  const onFound = vi.fn()
  const onClose = vi.fn()
  render(<QrOrderScanner onFound={onFound} onClose={onClose} />)
  await waitFor(() => expect(capturedSuccessCallback).not.toBeNull())
  return { onFound, onClose }
}

async function decode(text: string) {
  await act(async () => {
    capturedSuccessCallback!(text)
    // let the findOrdersByMakroOrderNo promise (and its state updates) settle
    await Promise.resolve()
    await Promise.resolve()
  })
}

test('a decode resolving to exactly one order calls onFound with it and stops the camera', async () => {
  const order = { id: 'o1', customer_name_en: 'BLUE VIEW', ship_date: '2026-10-01' }
  findOrdersByMakroOrderNo.mockResolvedValueOnce([order])
  const { onFound } = await renderScanner()

  await decode('PO-1')

  expect(findOrdersByMakroOrderNo).toHaveBeenCalledWith('PO-1')
  expect(onFound).toHaveBeenCalledWith(order)
  expect(stopMock).toHaveBeenCalled()
})

test('a decode resolving to zero orders shows the retry message, keeps scanning, and does not call onFound', async () => {
  findOrdersByMakroOrderNo.mockResolvedValueOnce([])
  const { onFound } = await renderScanner()

  await decode('PO-404')

  expect(await screen.findByText(/ไม่พบออเดอร์เลข PO-404/)).toBeInTheDocument()
  expect(onFound).not.toHaveBeenCalled()
  expect(stopMock).not.toHaveBeenCalled()
})

test('a decode resolving to multiple orders renders a pickable list; clicking one calls onFound with the right one', async () => {
  const o1 = { id: 'o1', customer_name_en: 'BLUE VIEW', ship_date: '2026-10-01' }
  const o2 = { id: 'o2', customer_name_en: 'PAYAM CAFE', ship_date: '2026-10-02' }
  findOrdersByMakroOrderNo.mockResolvedValueOnce([o1, o2])
  const { onFound } = await renderScanner()

  await decode('PO-1')

  expect(stopMock).toHaveBeenCalled()
  const btn = await screen.findByRole('button', { name: /PAYAM CAFE/ })
  await userEvent.click(btn)

  // Re-derived from the list already fetched — no second query.
  expect(findOrdersByMakroOrderNo).toHaveBeenCalledTimes(1)
  expect(onFound).toHaveBeenCalledWith(o2)
})

test('pressing the close button stops the camera and calls onClose', async () => {
  const { onClose } = await renderScanner()

  await userEvent.click(screen.getByRole('button', { name: 'ปิด' }))

  expect(stopMock).toHaveBeenCalled()
  expect(onClose).toHaveBeenCalled()
})

test('a camera start failure surfaces a Thai message instead of crashing', async () => {
  startMock.mockImplementationOnce(() => {
    throw new Error('permission denied')
  })
  render(<QrOrderScanner onFound={vi.fn()} onClose={vi.fn()} />)

  expect(
    await screen.findByText('เปิดกล้องไม่สำเร็จ กรุณาอนุญาตการใช้กล้องแล้วลองใหม่'),
  ).toBeInTheDocument()
})
