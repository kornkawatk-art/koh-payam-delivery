import { useState, type ChangeEvent } from 'react'
import { compressImage } from '../lib/image'
import { requestUploadUrl } from '../lib/api/photos'

type Props = {
  scope: 'evidence' | 'claim'
  orderId?: string
  token?: string
  onUploaded: (key: string) => void
  max?: number
}

/**
 * Camera / file capture for a handful of photos. Per file it: compresses to a
 * JPEG blob, asks the edge function for a presigned R2 PUT URL, uploads the blob
 * straight to R2, then reports the stored key via `onUploaded`. The input is
 * disabled once `max` (default 3) keys have been uploaded. Errors are shown in
 * Thai and never lose the thumbnails already captured.
 */
export default function PhotoCapture({ scope, orderId, token, onUploaded, max = 3 }: Props) {
  const [keys, setKeys] = useState<string[]>([])
  const [thumbs, setThumbs] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const atMax = keys.length >= max

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const el = e.target
    const picked = Array.from(el.files ?? [])
    el.value = ''
    const files = picked.slice(0, Math.max(0, max - keys.length))
    if (files.length === 0) return

    setErr('')
    setBusy(true)
    const doneKeys: string[] = []
    const doneThumbs: string[] = []
    try {
      for (const file of files) {
        const blob = await compressImage(file)
        const contentType = blob.type || 'image/jpeg'
        const args =
          scope === 'evidence'
            ? ({ scope: 'evidence', orderId: orderId ?? '', contentType } as const)
            : ({ scope: 'claim', token: token ?? '', contentType } as const)
        const { uploadUrl, key } = await requestUploadUrl(args)
        const put = await fetch(uploadUrl, {
          method: 'PUT',
          body: blob,
          headers: { 'content-type': contentType },
        })
        if (!put.ok) throw new Error('อัปโหลดรูปไม่สำเร็จ (' + put.status + ')')
        doneKeys.push(key)
        doneThumbs.push(URL.createObjectURL(blob))
        onUploaded(key)
      }
    } catch (e2) {
      setErr((e2 as Error).message || 'อัปโหลดรูปไม่สำเร็จ')
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
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        disabled={atMax || busy}
        onChange={onPick}
        aria-label="ถ่ายรูป / เลือกรูป"
      />
      <p className="text-sm text-ink-soft">
        {keys.length} / {max} รูป
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
