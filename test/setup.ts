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
