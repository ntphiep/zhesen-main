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

// jsdom has no window.matchMedia either. `ThemeToggle` and `useNarrowViewport` read it;
// the stub answers no to every query and never fires a change, which is the case a test
// under jsdom is in anyway.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = function matchMedia(query: string): MediaQueryList {
    return {
      matches: false, media: query, onchange: null,
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
    } as MediaQueryList
  }
}

// jsdom has no IntersectionObserver or ResizeObserver. The stubs observe nothing and never
// call back, which is what an element that never enters a viewport would see.
if (typeof window !== 'undefined') {
  window.IntersectionObserver ??= class implements IntersectionObserver {
    readonly root = null
    readonly rootMargin = '0px'
    readonly thresholds: readonly number[] = [0]
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] { return [] }
  }
  window.ResizeObserver ??= class implements ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
