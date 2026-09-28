// Vitest setup for the component tests (jsdom). Two shims live here, kept out of
// `src` so they are not coverage targets:
//   1. React Testing Library auto-cleanup — without `globals: true`, RTL does
//      not register its own afterEach, so rendered trees would leak between
//      tests and `screen` queries would match stale nodes.
//   2. A minimal `ImageData` — jsdom ships no canvas backend (and we avoid the
//      heavy native `canvas` dep), so `paintPage` needs a stand-in to construct
//      the image it hands to a (faked) 2D context. Real ImageData painting is
//      covered by the browser e2e in engine/wasm.

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(cleanup);

// jsdom has no canvas backend: `getContext('2d')` logs a noisy "Not
// implemented" error and returns null. Return null quietly instead — that IS
// the underlay's real "no 2D context" branch, minus the console spam. (Guarded
// for the node-env integration test, which has no HTMLCanvasElement.)
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => null;
}

// jsdom 30.1 added its own `URL.createObjectURL`, and it rejects the `Blob`
// this environment constructs (it reads jsdom-internal state the Blob does not
// carry: `Cannot read properties of undefined (reading '_buffer')`). Before
// that release the function was absent. A component that uses it when present
// (the PDF preview) then crashed on mount in every test. Probe once; when the
// real one cannot take a Blob, stand in with an opaque, unique `blob:` string —
// all a test can observe of an object URL anyway. Suites that care about the
// URLs (the PDF preview's own) stub the function themselves.
if (typeof URL.createObjectURL === 'function') {
  try {
    URL.revokeObjectURL(URL.createObjectURL(new Blob([])));
  } catch {
    let n = 0;
    URL.createObjectURL = () => {
      n += 1;
      return `blob:test-${n}`;
    };
    URL.revokeObjectURL = () => {};
  }
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

// jsdom ships no ResizeObserver; Headless UI's anchored popovers (Listbox
// options etc.) observe the trigger element to keep the portal positioned.
// Geometry is meaningless under jsdom anyway, so a no-op observer suffices —
// the anchored-position look is verified in the browser catalog, not here.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverShim {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverShim as unknown as typeof ResizeObserver;
}

// jsdom ships no PointerEvent (and no pointer capture): RTL's
// `fireEvent.pointerDown(el, { pointerId, clientY })` would fall back to the
// bare Event constructor and silently DROP those fields, so the drag tests
// would exercise nothing. A MouseEvent-based shim keeps the coordinate init
// and carries the pointer fields through.
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
  class PointerEventShim extends window.MouseEvent {
    readonly pointerId: number;
    readonly isPrimary: boolean;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
      this.isPrimary = init.isPrimary ?? false;
      this.pointerType = init.pointerType ?? 'mouse';
    }
  }
  window.PointerEvent = PointerEventShim as unknown as typeof PointerEvent;
}
