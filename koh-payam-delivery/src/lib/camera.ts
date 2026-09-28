/**
 * In-page camera (getUserMedia) for evidence photos.
 *
 * Why not <input capture="environment">: on the team's phones, handing off to
 * the OS camera app silently never returned the photo to the page (tried
 * twice -- see PhotoCapture.tsx's history). The usual cause is the browser
 * discarding the backgrounded tab while the camera app is open. A live
 * getUserMedia stream never leaves the page -- the same mechanism the QR
 * scanner already uses successfully on those phones.
 */

/** Open the rear camera (falls back to whatever camera exists). */
export async function openRearCamera(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new CameraUnavailableError()
  return navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  })
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((t) => t.stop())
}

/** The current video frame as a JPEG file, ready for the normal compress + upload path. */
export async function grabFrame(video: HTMLVideoElement): Promise<File> {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) throw new Error('กล้องยังไม่พร้อม ลองกดถ่ายอีกครั้ง')
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('ถ่ายรูปไม่สำเร็จ')
  ctx.drawImage(video, 0, 0, w, h)
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.92),
  )
  if (!blob) throw new Error('ถ่ายรูปไม่สำเร็จ')
  return new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' })
}

export class CameraUnavailableError extends Error {
  constructor() {
    super('camera unavailable')
    this.name = 'CameraUnavailableError'
  }
}

/** A Thai, actionable message for why the camera could not open. */
export function cameraErrorMessage(e: unknown): string {
  const name = (e as { name?: string } | null)?.name
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return 'ไม่ได้รับอนุญาตให้ใช้กล้อง — กดอนุญาตกล้องในการตั้งค่าเบราว์เซอร์ หรือใช้ปุ่ม "แนบรูปจากเครื่อง" แทน'
  if (name === 'NotFoundError' || name === 'OverconstrainedError')
    return 'ไม่พบกล้องในเครื่องนี้ — ใช้ปุ่ม "แนบรูปจากเครื่อง" แทน'
  if (name === 'NotReadableError' || name === 'AbortError')
    return 'กล้องถูกใช้งานโดยแอปอื่นอยู่ — ปิดแอปกล้องอื่นแล้วลองใหม่'
  if (name === 'CameraUnavailableError')
    return 'เบราว์เซอร์นี้เปิดกล้องในหน้าเว็บไม่ได้ — ใช้ปุ่ม "แนบรูปจากเครื่อง" แทน'
  return 'เปิดกล้องไม่สำเร็จ — ลองใหม่ หรือใช้ปุ่ม "แนบรูปจากเครื่อง" แทน'
}
