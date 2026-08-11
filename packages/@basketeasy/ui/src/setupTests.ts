import '@testing-library/jest-dom/vitest';

// jsdom doesn't implement these, but Radix's Select uses them for
// pointer-based interaction — without stubs, opening a Select in tests
// throws "not a function".
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (!Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
