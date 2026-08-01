// Vitest setup for the component tests (jsdom). Kept out of `src` so the shims
// are not coverage targets. Mirrors the designer package's setup:
//   1. React Testing Library auto-cleanup — without `globals: true`, RTL does
//      not register its own afterEach, so rendered trees leak between tests.
//   2. A minimal `ImageData` — jsdom ships no canvas backend, and the embedded
//      designer canvas constructs an ImageData for its underlay paint.

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// jsdom has no canvas backend: `getContext('2d')` logs a noisy "Not
// implemented" and returns null. Return null quietly — that IS the underlay's
// real "no 2D context" branch, minus the console spam. (Guarded for the
// node-env integration test, which has no HTMLCanvasElement.)
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => null;
}

if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataShim {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }
  globalThis.ImageData = ImageDataShim as unknown as typeof ImageData;
}

// jsdom ships no ResizeObserver; the embedded Designer's Headless UI menus
// (the menubar's anchored popovers) observe their trigger to keep the portal
// positioned. Geometry is meaningless under jsdom, so a no-op observer
// suffices — the anchored look is verified in the browser, not here.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverShim {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverShim as unknown as typeof ResizeObserver;
}
