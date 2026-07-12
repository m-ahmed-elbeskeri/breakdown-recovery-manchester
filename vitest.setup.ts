import '@testing-library/jest-dom/vitest';

// jsdom implements neither of these browser APIs; the motion library's
// viewport/reduced-motion features need them present (they exist in every real
// browser). Minimal stubs let component tests render without crashing.
if (!('IntersectionObserver' in globalThis)) {
  class IntersectionObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  // @ts-expect-error assigning a test stub to the global
  globalThis.IntersectionObserver = IntersectionObserverStub;
}

if (!('matchMedia' in globalThis)) {
  // @ts-expect-error assigning a test stub to the global
  globalThis.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}
