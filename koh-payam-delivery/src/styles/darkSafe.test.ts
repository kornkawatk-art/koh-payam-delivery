import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

// Colours that only work in one theme. Photo/camera overlays sit on images
// (always dark), and the logo keeps its own colours, so they're exempt.
const EXEMPT = ['components/CameraSheet.tsx', 'components/ui/PhotoGallery.tsx', 'components/AppLogo.tsx']
const BAD =
  /\b(?:text-white|bg-white(?!\/)|bg-ink\/\d+|(?:bg|text|border|ring|fill|stroke|from|via|to)-[a-z]+-\d{2,3})\b|#[0-9a-fA-F]{6}\b/g
// Photo/camera overlays may use translucent white over the image; an opaque
// bg-white or a palette colour is still flagged there.
const OVERLAY_OK = /^(?:text-white|bg-white\/\d+|border-white|bg-black(?:\/\d+)?)$/

const src = resolve(__dirname, '..')
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const p = join(d, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

test('no theme-blind colours in components (use tokens: text-on, bg-surface, bg-black/…)', () => {
  const hits = walk(src)
    .filter((p) => p.endsWith('.tsx') && !p.includes('.test.'))
    .map((p) => relative(src, p).split('\\').join('/'))
    .flatMap((p) =>
      [...readFileSync(join(src, p), 'utf8').matchAll(BAD)]
        .filter((m) => !(EXEMPT.includes(p) && (OVERLAY_OK.test(m[0]) || p.endsWith('AppLogo.tsx'))))
        .map((m) => `${p}: ${m[0]}`),
    )
  expect(hits).toEqual([])
})
