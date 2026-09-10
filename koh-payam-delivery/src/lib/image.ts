// One quality ladder shared by pickQuality (pure, tested) and compressImage
// (real encode). Steps descend past 0.5 so a tight byte budget can still land
// on a lower quality.
const QUALITY_STEPS = [0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5, 0.45, 0.4] as const

/**
 * Pick the highest quality whose encoded size is within budget. If nothing
 * fits, fall back to 0.5 as a "best effort" floor.
 */
export function pickQuality(sizeAt: (q: number) => number, maxBytes: number): number {
  for (const q of QUALITY_STEPS) if (sizeAt(q) <= maxBytes) return q
  return 0.5
}

/**
 * Scale an image down to <= maxDim on its longest edge and encode it as JPEG,
 * stepping quality down the shared ladder until the blob is <= maxBytes.
 * Returns the first blob within budget, or the last (lowest-quality, q=0.4)
 * blob it encoded if none fit.
 *
 * Uses createImageBitmap + <canvas>.toBlob, which jsdom does not implement, so
 * this is exercised only in a real browser (not covered by unit tests).
 */
export async function compressImage(
  file: File,
  maxDim = 1600,
  maxBytes = 200 * 1024,
): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height))
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d canvas context unavailable')
  ctx.drawImage(bmp, 0, 0, w, h)

  const blobAt = (q: number) =>
    new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
        'image/jpeg',
        q,
      ),
    )

  let last: Blob | null = null
  for (const q of QUALITY_STEPS) {
    last = await blobAt(q)
    if (last.size <= maxBytes) return last
  }
  return last as Blob
}
