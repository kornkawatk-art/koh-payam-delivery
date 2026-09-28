import '@testing-library/jest-dom'

// jsdom has no media playback; the in-page camera (CameraSheet) calls
// video.play(). Resolve quietly instead of logging "Not implemented".
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = () => Promise.resolve()
}

// jsdom has no PointerEvent, so fireEvent.pointerDown({ clientX }) would drop
// the coordinates. A MouseEvent subclass carries them (swipe/scrub tests).
if (typeof window !== 'undefined' && !('PointerEvent' in window)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerType: string
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerType = init.pointerType ?? 'mouse'
    }
  }
  ;(window as unknown as { PointerEvent: unknown }).PointerEvent = PointerEventPolyfill
}
