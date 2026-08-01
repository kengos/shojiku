// Fetching the engine module so the transfer can be WATCHED. wasm-bindgen's own
// init fetches the `.wasm` itself and reports nothing, which is fine when the
// module gates the first paint and nobody is looking — but catalog-first boot
// puts a usable page in front of the user while ~1.7 MB is still arriving, so
// the transfer needs a progress reading in the shell.
//
// Part of the browser-entry group (`src/browser/`, coverage-excluded with
// `main.tsx`) — this file is the `fetch` call and nothing else; what the
// response MEANS (the header parse, the pass-through counting, cancel) is the
// covered `loading/observe.ts`, and the accounting rules are the covered
// `loading/moduleLoad.ts` tracker.

import type { ModuleLoadTracker } from '../loading/moduleLoad';
import { observeResponse } from '../loading/observe';

/** The engine module's byte file, relative to the served `pkg/` dir — the same
 * name wasm-bindgen's generated init would resolve on its own. */
const MODULE_FILE = 'shojiku_wasm_bg.wasm';

/** Fetch the module, reporting progress to `tracker`, as a `Response` the
 * wasm-bindgen init can still compile in a streaming fashion. */
export async function fetchWasmModule(
  pkgBase: string,
  tracker: ModuleLoadTracker,
): Promise<Response> {
  const url = new URL(MODULE_FILE, pkgBase).href;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url}: ${String(res.status)}`);
  }
  return observeResponse(res, tracker);
}
