import { cameraErrorMessage, openRearCamera, stopStream } from './camera'

test('each common camera failure gets its own Thai message pointing at the fallback', () => {
  const err = (name: string) => Object.assign(new Error(name), { name })
  expect(cameraErrorMessage(err('NotAllowedError'))).toMatch(/ไม่ได้รับอนุญาตให้ใช้กล้อง/)
  expect(cameraErrorMessage(err('NotFoundError'))).toMatch(/ไม่พบกล้อง/)
  expect(cameraErrorMessage(err('NotReadableError'))).toMatch(/ถูกใช้งานโดยแอปอื่น/)
  expect(cameraErrorMessage(err('CameraUnavailableError'))).toMatch(/เปิดกล้องในหน้าเว็บไม่ได้/)
  expect(cameraErrorMessage(new Error('?'))).toMatch(/แนบรูปจากเครื่อง/)
})

test('openRearCamera asks for the rear camera, video only; without getUserMedia it fails clearly', async () => {
  const getUserMedia = vi.fn().mockResolvedValue('stream')
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  await openRearCamera()
  const c = getUserMedia.mock.calls[0][0]
  expect(c.audio).toBe(false)
  expect(c.video.facingMode).toEqual({ ideal: 'environment' })

  vi.stubGlobal('navigator', {})
  await expect(openRearCamera()).rejects.toMatchObject({ name: 'CameraUnavailableError' })
  vi.unstubAllGlobals()
})

test('stopStream stops every track and tolerates no stream', () => {
  const stop = vi.fn()
  stopStream({ getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream)
  expect(stop).toHaveBeenCalledTimes(2)
  expect(() => stopStream(null)).not.toThrow()
})
