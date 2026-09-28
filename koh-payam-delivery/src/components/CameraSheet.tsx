import { useEffect, useRef, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { cameraErrorMessage, grabFrame, openRearCamera, stopStream } from '../lib/camera'

/**
 * Full-screen in-page camera: live rear-camera preview, a big shutter, and a
 * "เสร็จ" button. Each shot is handed to `onCapture` (the caller's normal
 * compress + upload path) while the camera stays open for the next one. The
 * stream is always stopped on close/unmount so the camera light goes off.
 */
export function CameraSheet({
  onCapture,
  onClose,
  busy,
  taken,
  remaining,
}: {
  onCapture: (file: File) => void
  onClose: () => void
  /** An upload is in flight -- the shutter waits for it. */
  busy: boolean
  /** Photos attached so far (shown as a running count). */
  taken: number
  /** How many more are allowed (Infinity when uncapped). */
  remaining: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const shutterRef = useRef<HTMLButtonElement>(null)
  const [ready, setReady] = useState(false)
  const [err, setErr] = useState('')
  const [flash, setFlash] = useState(false)
  // Callers pass a fresh onClose each render; keep the latest in a ref so the
  // camera effect below runs once per open, not on every parent re-render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    let stream: MediaStream | null = null
    let cancelled = false
    openRearCamera()
      .then(async (s) => {
        if (cancelled) return stopStream(s)
        stream = s
        const v = videoRef.current
        if (!v) return
        v.srcObject = s
        try {
          await v.play() // autoPlay usually covers it; some browsers need the explicit call
        } catch {
          /* a rejected play() still leaves a live preview on most devices */
        }
        setReady(true)
        shutterRef.current?.focus()
      })
      .catch((e) => !cancelled && setErr(cameraErrorMessage(e)))
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current()
    window.addEventListener('keydown', onKey)
    return () => {
      cancelled = true
      stopStream(stream)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  async function shoot() {
    const v = videoRef.current
    if (!v) return
    try {
      const file = await grabFrame(v)
      setFlash(true)
      window.setTimeout(() => setFlash(false), 150)
      onCapture(file)
    } catch (e) {
      setErr((e as Error).message)
    }
  }

  const full = remaining <= 0
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-label="กล้องถ่ายรูป"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm">
          ถ่ายแล้ว <span className="font-semibold">{taken}</span> รูป
          {Number.isFinite(remaining) && ` · ถ่ายได้อีก ${Math.max(0, remaining)}`}
        </p>
        <button
          type="button"
          className="btn btn-sm gap-1.5 bg-white/15 text-white hover:bg-white/25"
          onClick={onClose}
        >
          <X size={16} weight="bold" aria-hidden="true" />
          เสร็จ
        </button>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="h-full w-full object-contain"
          playsInline
          muted
          autoPlay
        />
        {flash && <div className="absolute inset-0 bg-white/70" aria-hidden="true" />}
        {!ready && !err && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            กำลังเปิดกล้อง…
          </p>
        )}
        {err && (
          <p
            className="absolute inset-x-4 top-1/2 -translate-y-1/2 rounded-xl bg-white p-4 text-center text-sm text-danger-ink"
            role="alert"
          >
            {err}
          </p>
        )}
      </div>

      <div
        className="flex flex-col items-center gap-2 px-4 py-5"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <p className="min-h-[1.25rem] text-xs text-white/80" aria-live="polite">
          {busy ? 'กำลังอัปโหลดรูป…' : full ? 'ครบจำนวนรูปแล้ว' : ''}
        </p>
        <button
          ref={shutterRef}
          type="button"
          aria-label="ถ่าย"
          onClick={() => void shoot()}
          disabled={!ready || busy || full || !!err}
          className="h-[4.5rem] w-[4.5rem] rounded-full border-4 border-white bg-white/30 transition-transform active:scale-90 disabled:opacity-40"
        />
      </div>
    </div>
  )
}
