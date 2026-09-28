import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CameraSheet } from './CameraSheet'

const { openRearCamera, grabFrame, stopStream } = vi.hoisted(() => ({
  openRearCamera: vi.fn(),
  grabFrame: vi.fn(),
  stopStream: vi.fn(),
}))
vi.mock('../lib/camera', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/camera')>()),
  openRearCamera,
  grabFrame,
  stopStream,
}))

const stream = { getTracks: () => [] } as unknown as MediaStream
const shot = new File(['x'], 'camera.jpg', { type: 'image/jpeg' })

beforeEach(() => {
  openRearCamera.mockReset().mockResolvedValue(stream)
  grabFrame.mockReset().mockResolvedValue(shot)
  stopStream.mockReset()
})

const sheet = (over: Partial<Parameters<typeof CameraSheet>[0]> = {}) => {
  const props = {
    onCapture: vi.fn(),
    onClose: vi.fn(),
    busy: false,
    taken: 0,
    remaining: Infinity,
    ...over,
  }
  return { props, ...render(<CameraSheet {...props} />) }
}

test('opens the rear camera, and the shutter hands each shot to onCapture while staying open', async () => {
  const { props } = sheet()
  const shutter = screen.getByRole('button', { name: 'ถ่าย' })
  await waitFor(() => expect(shutter).toBeEnabled())
  await userEvent.click(shutter)
  await userEvent.click(shutter)
  expect(props.onCapture).toHaveBeenCalledTimes(2)
  expect(props.onCapture).toHaveBeenCalledWith(shot)
  expect(screen.getByRole('dialog', { name: 'กล้องถ่ายรูป' })).toBeInTheDocument()
})

test('"เสร็จ" and Escape close it; the camera stream is stopped when it goes away', async () => {
  const { props, unmount } = sheet()
  await waitFor(() => expect(screen.getByRole('button', { name: 'ถ่าย' })).toBeEnabled())
  await userEvent.click(screen.getByRole('button', { name: 'เสร็จ' }))
  await userEvent.keyboard('{Escape}')
  expect(props.onClose).toHaveBeenCalledTimes(2)
  unmount()
  expect(stopStream).toHaveBeenCalledWith(stream)
})

test('opens the camera once, even when the parent re-renders with a new onClose', async () => {
  const { props, rerender } = sheet()
  await waitFor(() => expect(screen.getByRole('button', { name: 'ถ่าย' })).toBeEnabled())
  rerender(<CameraSheet {...props} onClose={() => {}} taken={1} />)
  expect(openRearCamera).toHaveBeenCalledTimes(1)
})

test('a denied permission shows a Thai way out and keeps the shutter disabled', async () => {
  openRearCamera.mockRejectedValue(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
  sheet()
  expect(await screen.findByRole('alert')).toHaveTextContent('ไม่ได้รับอนุญาตให้ใช้กล้อง')
  expect(screen.getByRole('button', { name: 'ถ่าย' })).toBeDisabled()
})

test('the shutter waits while an upload is running, and stops at the photo cap', async () => {
  const { rerender, props } = sheet({ busy: true })
  await waitFor(() => expect(openRearCamera).toHaveBeenCalled())
  expect(screen.getByRole('button', { name: 'ถ่าย' })).toBeDisabled()
  expect(screen.getByText('กำลังอัปโหลดรูป…')).toBeInTheDocument()
  rerender(<CameraSheet {...props} busy={false} taken={5} remaining={0} />)
  expect(screen.getByRole('button', { name: 'ถ่าย' })).toBeDisabled()
  expect(screen.getByText('ครบจำนวนรูปแล้ว')).toBeInTheDocument()
})
