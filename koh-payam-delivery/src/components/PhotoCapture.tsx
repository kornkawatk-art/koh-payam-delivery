import { useState, type ChangeEvent } from 'react'
import { Trash } from '@phosphor-icons/react'
import { compressImage } from '../lib/image'
import { requestUploadUrl } from '../lib/api/photos'

// Full budget (compress + presign + PUT) for one photo. Weak island cellular
// signal can otherwise leave the browser's fetch hanging with no error and no
// timeout of its own — the UI looked permanently "stuck" with nothing to
// retry. This bounds the wait and turns a hang into a retryable Thai error.
const UPLOAD_TIMEOUT_MS = 25_000

class UploadTimeoutError extends Error {}

/** Race `work` against a timeout; on timeout, abort `controller` and reject. */
function withUploadTimeout<T>(work: Promise<T>, controller: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort()
      reject(new UploadTimeoutError('upload timed out'))
    }, UPLOAD_TIMEOUT_MS)
    work.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}

type Props = {
  scope: 'evidence' | 'claim'
  orderId?: string
  token?: string
  onUploaded: (key: string) => void
  /**
   * A photo was removed (the "ลบรูปนี้" confirm was tapped). Optional: when
   * omitted, removal is purely local (thumbnail/count only) — correct for a
   * scope whose keys aren't persisted until some later step (e.g. a claim,
   * only written to `claim_photos` at final submit). When given and it
   * throws/rejects, the photo is put back and the thrown message is shown —
   * mirrors `onUploaded`'s own error-never-loses-state contract.
   */
  onRemoved?: (key: string) => void | Promise<void>
  /** Finite cap on captured photos. Omit (or pass `Infinity`) for no cap. */
  max?: number
  /** Evidence stage tag, forwarded to the upload-url request. Default 'handoff'. */
  stage?: 'pack' | 'handoff'
  /**
   * Fires whenever a pick starts/finishes processing. A photo can take real
   * time (compress + presign + PUT) on a slow connection; a parent screen
   * should use this to hold off save/submit/navigate actions until it's
   * false, so a user can't act on stale state and leave a photo stranded
   * mid-upload.
   */
  onBusyChange?: (busy: boolean) => void
}

/**
 * File capture for a handful of photos. Deliberately NOT
 * `capture="environment"` (direct camera launch) — confirmed, on a real
 * device, to silently never hand the photo back to the page: camera opens,
 * a photo can be taken, and nothing happens after, with no error, on every
 * attempt. A two-input version (direct camera + this plain picker as a
 * fallback) was tried and the direct-camera one still failed the same way —
 * the bug is in the browser/OS's capture→page handoff itself, not anything
 * fixable here. The workflow is now: take the photo with the phone's own
 * camera app first, then use this picker to attach it — the plain OS file
 * chooser, the one path confirmed to work end-to-end.
 *
 * Per file it: compresses to a JPEG blob, asks the edge function for a
 * presigned R2 PUT URL, uploads the blob straight to R2, then reports the
 * stored key via `onUploaded`. When a finite `max` is passed the input is
 * disabled once that many keys are uploaded and the count reads
 * `n / max รูป`; when `max` is omitted the input never locks and the count
 * reads `n รูป`. Errors are shown in Thai and never lose the thumbnails
 * already captured.
 *
 * Each thumbnail carries a small trash-icon overlay to undo an accidental
 * upload (wrong photo, blurry shot, etc.) — a single tap arms it (shows
 * "ลบรูปนี้?" + confirm/cancel inline on that thumbnail only) so a stray tap
 * elsewhere on the screen can't delete a correctly-attached photo.
 */
export default function PhotoCapture({
  scope,
  orderId,
  token,
  onUploaded,
  onRemoved,
  max,
  stage = 'handoff',
  onBusyChange,
}: Props) {
  const [keys, setKeys] = useState<string[]>([])
  const [thumbs, setThumbs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Which key currently shows the "ลบรูปนี้?" confirm row, and which key's
  // removal is in flight (disables that thumbnail's buttons only).
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null)
  const [removingKey, setRemovingKey] = useState<string | null>(null)

  function updateBusy(v: boolean) {
    setBusy(v)
    onBusyChange?.(v)
  }
  // Bumped after every pick to force React to remount the <input> DOM node.
  // Belt-and-suspenders alongside dropping capture="environment": resetting
  // `.value` alone was not enough to make some mobile browsers fire a
  // second native `change` event on a *reused* file input. A fresh input
  // element (new `key`) costs nothing since it carries no state of its own.
  const [inputGen, setInputGen] = useState(0)

  const capped = typeof max === 'number' && Number.isFinite(max)
  const limit = capped ? (max as number) : Infinity
  const atMax = keys.length >= limit

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const el = e.target
    const picked = Array.from(el.files ?? [])
    el.value = ''
    setInputGen((g) => g + 1)

    // Never go silent: a user who picks a photo and sees *nothing* happen
    // (no error, no thumbnail, no count change) reasonably concludes the app
    // is broken. If the browser handed back no file at all — a cancelled
    // picker — say so instead of quietly no-op'ing.
    if (picked.length === 0) {
      setErr('ไม่ได้เลือกรูป กรุณาลองอีกครั้ง')
      return
    }

    const files = picked.slice(0, Math.max(0, limit - keys.length))
    if (files.length === 0) return

    setErr('')
    updateBusy(true)
    const doneKeys: string[] = []
    const doneThumbs: string[] = []
    try {
      for (const file of files) {
        const controller = new AbortController()
        await withUploadTimeout(
          (async () => {
            const blob = await compressImage(file)
            const contentType = blob.type || 'image/jpeg'
            const args =
              scope === 'evidence'
                ? ({ scope: 'evidence', orderId: orderId ?? '', contentType, stage } as const)
                : ({ scope: 'claim', token: token ?? '', contentType } as const)
            const { uploadUrl, key } = await requestUploadUrl(args, controller.signal)
            const put = await fetch(uploadUrl, {
              method: 'PUT',
              body: blob,
              headers: { 'content-type': contentType },
              signal: controller.signal,
            })
            if (!put.ok) throw new Error('อัปโหลดรูปไม่สำเร็จ (' + put.status + ')')
            doneKeys.push(key)
            doneThumbs.push(URL.createObjectURL(blob))
            onUploaded(key)
          })(),
          controller,
        )
      }
    } catch (e2) {
      if (e2 instanceof UploadTimeoutError) {
        setErr('อัปโหลดรูปไม่สำเร็จ (สัญญาณอินเทอร์เน็ตช้าหรือขาดหาย) กรุณาลองใหม่อีกครั้ง')
      } else {
        setErr((e2 as Error).message || 'อัปโหลดรูปไม่สำเร็จ')
      }
    } finally {
      if (doneKeys.length) {
        setKeys((k) => [...k, ...doneKeys])
        setThumbs((t) => [...t, ...doneThumbs])
      }
      updateBusy(false)
    }
  }

  async function confirmRemove(key: string) {
    const i = keys.indexOf(key)
    if (i === -1) return
    const removedThumb = thumbs[i]
    setConfirmingKey(null)
    setRemovingKey(key)
    setErr('')
    // Optimistic: drop it immediately so the UI feels instant, put it back
    // on failure (same "never lose what's already there" contract as a
    // failed upload).
    setKeys((k) => k.filter((kk) => kk !== key))
    setThumbs((t) => t.filter((_, idx) => idx !== i))
    try {
      await onRemoved?.(key)
    } catch (e) {
      setKeys((k) => [...k.slice(0, i), key, ...k.slice(i)])
      setThumbs((t) => [...t.slice(0, i), removedThumb, ...t.slice(i)])
      setErr((e as Error).message || 'ลบรูปไม่สำเร็จ')
    } finally {
      setRemovingKey(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-faint">
        ถ่ายรูปด้วยกล้องมือถือก่อน แล้วกดปุ่มด้านล่างเพื่อแนบรูปที่ถ่ายไว้
      </p>
      <input
        key={inputGen}
        type="file"
        accept="image/*"
        multiple
        disabled={atMax || busy}
        onChange={onPick}
        aria-label="แนบรูป"
      />
      <p className="text-sm text-ink-soft">
        {capped ? `${keys.length} / ${max} รูป` : `${keys.length} รูป`}
      </p>
      {busy && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-brand-ink">
          <svg
            className="h-3.5 w-3.5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path
              d="M21 12a9 9 0 0 0-9-9"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          กำลังอัปโหลดรูป กรุณารอสักครู่…
        </p>
      )}
      {err && <p className="text-sm text-danger-ink">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {thumbs.map((src, i) => {
          const key = keys[i]
          const confirming = confirmingKey === key
          const removing = removingKey === key
          return (
            <div key={key ?? i} className="flex flex-col items-center gap-1">
              <div className="relative">
                <img
                  src={src}
                  alt="รูปที่อัปโหลด"
                  className="h-20 w-20 rounded-lg border border-line object-cover"
                />
                {!confirming && (
                  <button
                    type="button"
                    aria-label="ลบรูปนี้"
                    disabled={removing}
                    onClick={() => setConfirmingKey(key)}
                    className="absolute -right-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-surface text-danger-ink shadow-card transition-colors hover:bg-danger-soft disabled:opacity-50"
                  >
                    {removing ? (
                      <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <Trash size={14} aria-hidden="true" />
                    )}
                  </button>
                )}
              </div>
              {confirming && (
                <div className="flex flex-col items-center gap-1 text-xs">
                  <span className="font-medium text-danger-ink">ลบรูปนี้?</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => confirmRemove(key)}
                      className="btn btn-danger btn-sm !min-h-0 !py-1 !px-2 !text-xs"
                    >
                      ลบ
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingKey(null)}
                      className="btn btn-secondary btn-sm !min-h-0 !py-1 !px-2 !text-xs"
                    >
                      ยกเลิก
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
