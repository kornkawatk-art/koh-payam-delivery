import { useState, type ChangeEvent } from 'react'
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
  /** Finite cap on captured photos. Omit (or pass `Infinity`) for no cap. */
  max?: number
  /** Evidence stage tag, forwarded to the upload-url request. Default 'handoff'. */
  stage?: 'pack' | 'handoff'
}

/**
 * Camera / file capture for a handful of photos. Per file it: compresses to a
 * JPEG blob, asks the edge function for a presigned R2 PUT URL, uploads the blob
 * straight to R2, then reports the stored key via `onUploaded`. When a finite
 * `max` is passed the input is disabled once that many keys are uploaded and the
 * count reads `n / max รูป`; when `max` is omitted the input never locks and the
 * count reads `n รูป`. Errors are shown in Thai and never lose the thumbnails
 * already captured.
 */
export default function PhotoCapture({
  scope,
  orderId,
  token,
  onUploaded,
  max,
  stage = 'handoff',
}: Props) {
  const [keys, setKeys] = useState<string[]>([])
  const [thumbs, setThumbs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  // Bumped after every pick to force React to remount the <input> DOM node.
  // Some mobile browsers (observed: Android Chrome) do not reliably fire a
  // second native `change` event on a *reused* file input after a camera
  // capture — the camera opens and a photo can be taken, but nothing comes
  // back. Resetting `.value` alone does not fix it; a fresh input element
  // (new `key`) does, and it costs nothing since the input carries no state
  // of its own.
  const [inputGen, setInputGen] = useState(0)

  const capped = typeof max === 'number' && Number.isFinite(max)
  const limit = capped ? (max as number) : Infinity
  const atMax = keys.length >= limit

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const el = e.target
    const picked = Array.from(el.files ?? [])
    el.value = ''
    setInputGen((g) => g + 1)
    const files = picked.slice(0, Math.max(0, limit - keys.length))
    if (files.length === 0) return

    setErr('')
    setBusy(true)
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
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        key={inputGen}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        disabled={atMax || busy}
        onChange={onPick}
        aria-label="ถ่ายรูป / เลือกรูป"
      />
      <p className="text-sm text-ink-soft">
        {capped ? `${keys.length} / ${max} รูป` : `${keys.length} รูป`}
      </p>
      {busy && <p className="text-sm text-ink-faint">กำลังอัปโหลด…</p>}
      {err && <p className="text-sm text-danger-ink">{err}</p>}
      <div className="flex flex-wrap gap-2">
        {thumbs.map((src, i) => (
          <img
            key={keys[i] ?? i}
            src={src}
            alt="รูปที่อัปโหลด"
            className="h-20 w-20 rounded-lg border border-line object-cover"
          />
        ))}
      </div>
    </div>
  )
}
