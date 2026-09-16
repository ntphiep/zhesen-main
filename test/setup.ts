import '@testing-library/jest-dom/vitest'

// jsdom ships non-functional <dialog>.showModal()/close() stubs (no-op or "Not
// implemented"). Override them unconditionally to toggle the `open` property so
// components driven by these APIs behave in tests as they do in a real browser
// (where the `open` attribute must NOT be set alongside showModal()).
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close() {
    this.open = false
    this.dispatchEvent(new Event('close'))
  }
}

// jsdom does not implement Element.scrollIntoView at all, so a component that
// scrolls its own output into view throws in tests while working in a browser.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView() {}
}

// jsdom has no window.matchMedia either. StrokeOrder reads the colour scheme
// through it; the stub reports light and never fires change events, which is
// the case a test under jsdom is in anyway.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = function matchMedia(query: string): MediaQueryList {
    return {
      matches: false, media: query, onchange: null,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    } as MediaQueryList
  }
}
