import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { CaretLeft, CaretRight, X } from '@phosphor-icons/react'

export type GalleryPhoto = { src: string; alt: string }

type Labels = { close: string; prev: string; next: string }
const TH: Labels = { close: 'ปิด', prev: 'รูปก่อนหน้า', next: 'รูปถัดไป' }

// A horizontal drag at least this far (px) counts as a swipe.
const SWIPE_PX = 50

/**
 * A set of photo thumbnails; tapping one opens a full-screen viewer that can
 * move through the whole set -- arrow buttons, swipe on a phone, ←/→ keys on
 * a computer -- with an "n / total" counter. Wraps around at the ends.
 * Esc, the ✕ button or a tap on the dark backdrop closes it.
 *
 * Renders only the thumbnails (a fragment), so it drops into the existing
 * `flex flex-wrap gap-2` rows the pages already have.
 */
export function PhotoGallery({ photos, labels = TH }: { photos: GalleryPhoto[]; labels?: Labels }) {
  const [index, setIndex] = useState<number | null>(null)
  const n = photos.length
  const open = index !== null
  const go = (d: number) => setIndex((i) => (i === null ? i : (i + d + n) % n))

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIndex(null)
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, n])

  // Swipe: remember where the finger went down; on release, a long enough
  // horizontal drag flips the photo (a tap does nothing here).
  const startX = useRef<number | null>(null)
  // A swipe that ends on the backdrop also fires a click there -- that click
  // must not count as "tap outside to close".
  const swiped = useRef(false)
  const onDown = (e: PointerEvent) => {
    startX.current = e.clientX
    swiped.current = false
  }
  const onUp = (e: PointerEvent) => {
    if (startX.current === null) return
    const dx = e.clientX - startX.current
    startX.current = null
    if (Math.abs(dx) >= SWIPE_PX) {
      swiped.current = true
      if (n > 1) go(dx < 0 ? 1 : -1)
    }
  }

  const current = open ? photos[index!] : null
  return (
    <>
      {photos.map((p, i) => (
        <button
          key={p.src}
          type="button"
          onClick={() => setIndex(i)}
          className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-line"
        >
          <img src={p.src} alt={p.alt} className="h-full w-full object-cover" />
        </button>
      ))}

      {current && (
        <div
          className="fixed inset-0 z-50 flex touch-pan-y items-center justify-center bg-ink/85 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={current.alt}
          onClick={() => {
            if (swiped.current) swiped.current = false
            else setIndex(null)
          }}
          onPointerDown={onDown}
          onPointerUp={onUp}
        >
          <img
            src={current.src}
            alt={current.alt}
            className="max-h-[85vh] max-w-[90vw] select-none rounded-lg object-contain"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
          />

          <button
            type="button"
            aria-label={labels.close}
            onClick={(e) => {
              e.stopPropagation()
              setIndex(null)
            }}
            className="btn btn-sm absolute right-4 top-4 gap-1 bg-white/15 text-white hover:bg-white/25"
          >
            <X size={18} weight="bold" aria-hidden="true" />
          </button>

          {n > 1 && (
            <>
              <p
                className="tnum absolute left-1/2 top-5 -translate-x-1/2 rounded-full bg-black/40 px-3 py-1 text-sm text-white"
                aria-live="polite"
              >
                {index! + 1} / {n}
              </p>
              <button
                type="button"
                aria-label={labels.prev}
                onClick={(e) => {
                  e.stopPropagation()
                  go(-1)
                }}
                className="absolute left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/30 sm:left-4"
              >
                <CaretLeft size={24} weight="bold" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={labels.next}
                onClick={(e) => {
                  e.stopPropagation()
                  go(1)
                }}
                className="absolute right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/30 sm:right-4"
              >
                <CaretRight size={24} weight="bold" aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}
