import { useState } from 'react'

type Props = {
  src: string
  alt: string
}

/**
 * A team-facing evidence-photo thumbnail that expands to a full-screen
 * overlay on click. This is the first modal/overlay in this codebase — kept
 * intentionally small: no focus trap, no portal, no configuration knobs.
 * Dismissed by clicking the backdrop or the close button.
 *
 * The thumbnail sizing (`h-24 w-24 rounded-lg border border-line
 * object-cover`) is hardcoded rather than exposed as a `className` prop:
 * every one of its 5 call sites today uses this exact value, matching this
 * codebase's low-abstraction preference.
 */
export function ZoomableImage({ src, alt }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-line"
      >
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 p-4"
          onClick={() => setOpen(false)}
        >
          <img
            src={src}
            alt={alt}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />
          <button
            type="button"
            aria-label="ปิด"
            onClick={() => setOpen(false)}
            className="btn btn-secondary btn-sm absolute right-4 top-4"
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
