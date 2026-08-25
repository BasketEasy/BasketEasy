import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { __resetToastsForTests } from '@basketeasy/ui/toast-store';
import { server } from './mocks/server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// The toast queue is module-level state (see toast-store.ts), not reset by
// each test's fresh QueryClient/render — without this, a toast fired in one
// test is still queued when the next test's <Toaster /> mounts, so two
// tests asserting on the same role in one file can collide.
afterEach(() => __resetToastsForTests());

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

// jsdom doesn't implement ResizeObserver, which Radix's Checkbox uses
// internally — without a stub, mounting a Checkbox throws in tests.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
