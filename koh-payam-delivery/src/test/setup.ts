import '@testing-library/jest-dom'

// jsdom has no media playback; the in-page camera (CameraSheet) calls
// video.play(). Resolve quietly instead of logging "Not implemented".
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = () => Promise.resolve()
}
