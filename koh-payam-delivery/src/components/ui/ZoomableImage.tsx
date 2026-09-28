import { PhotoGallery } from './PhotoGallery'

/**
 * A single photo thumbnail that expands to a full-screen viewer. Kept for
 * one-off photos; for a set of photos use PhotoGallery so the viewer can move
 * between them.
 */
export function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  return <PhotoGallery photos={[{ src, alt }]} />
}
