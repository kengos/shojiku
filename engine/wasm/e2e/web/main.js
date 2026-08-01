// The browser golden path for the production WASM bindings: instantiate the
// module, set a locale, inject the locale's font packs (manifest + face bytes,
// fetched host-side), render the receipt-us example to RAW RGBA, and paint
// each page to a canvas via ImageData. Playwright asserts pages appeared, the
// result is `ok`, and no diagnostics/console errors fired.
import init, { Engine } from './pkg/shojiku_wasm.js';

const $ = (id) => document.getElementById(id);
const setStatus = (state, text) => {
  const el = $('status');
  el.dataset.state = state;
  el.textContent = text;
};
const fail = (err) => {
  setStatus('error', 'failed');
  const el = $('error');
  el.hidden = false;
  el.textContent = String(err);
  // Surface to the test as a stable, queryable signal.
  window.__SHOJIKU__ = { ok: false, error: String(err) };
  throw err;
};

const fetchBytes = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
};
const fetchText = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return res.text();
};

try {
  const t0 = performance.now();
  await init();
  const instantiateMs = performance.now() - t0;

  const engine = new Engine();
  engine.setLocale('en-US', undefined);

  // The host fetches each needed pack's manifest + every face it declares and
  // injects them; the engine verifies sha256 + embedding rights on loadFonts.
  setStatus('loading', 'injecting fonts…');
  const tf0 = performance.now();
  let fontBytes = 0;
  const packIds = JSON.parse(engine.fontPacksNeeded());
  for (const pid of packIds) {
    const manifest = await fetchText(`./fonts/${pid}/manifest.yml`);
    engine.addFontPack(pid, manifest);
    // The ENGINE parses the manifest and says which face files to fetch —
    // the host never re-parses manifest.yml itself.
    const files = JSON.parse(engine.fontFilesNeeded(pid));
    for (const file of files) {
      const bytes = await fetchBytes(`./fonts/${pid}/${file}`);
      fontBytes += bytes.length;
      engine.addFontFile(pid, file, bytes);
    }
  }
  engine.loadFonts();
  const fontInjectMs = performance.now() - tf0;

  setStatus('loading', 'rendering…');
  const [tpl, params, defs] = await Promise.all([
    fetchText('./example/templates.yml'),
    fetchText('./example/params.json'),
    fetchText('./example/definitions.yml'),
  ]);

  const tr0 = performance.now();
  const result = engine.renderRaw(tpl, params, defs, 2.0);
  const renderMs = performance.now() - tr0;

  // Single-page selection: render only page 0 and confirm it is exactly one
  // page whose pixels match page 0 of the all-pages render (byte-identical).
  const firstOnly = engine.renderRaw(tpl, params, defs, 2.0, 0);
  const pageSelect = {
    pages: firstOnly.pages.length,
    matches:
      firstOnly.pages.length === 1 &&
      firstOnly.pages[0].rgba.length === result.pages[0].rgba.length &&
      firstOnly.pages[0].rgba.every((b, i) => b === result.pages[0].rgba[i]),
  };

  for (const page of result.pages) {
    const canvas = document.createElement('canvas');
    canvas.className = 'page';
    canvas.width = page.width;
    canvas.height = page.height;
    const ctx = canvas.getContext('2d');
    const img = new ImageData(new Uint8ClampedArray(page.rgba), page.width, page.height);
    ctx.putImageData(img, 0, 0);
    $('pages').appendChild(canvas);
  }

  // Typed host-misuse error: an out-of-range pageIndex throws a JS Error
  // carrying a stable `code` + typed `args` (not just a message string), so a
  // host branches on `code` — here a stale page index — instead of matching
  // the localizable message.
  let typedError = null;
  try {
    engine.renderRaw(tpl, params, defs, 2.0, 99);
  } catch (err) {
    typedError = { code: err.code, page: err.args?.page, total: err.args?.total };
  }

  const diagnostics = JSON.parse(result.diagnostics);
  const errorCount = diagnostics.items.filter((d) => d.severity === 'error').length;

  $('metrics').textContent = [
    `instantiate: ${instantiateMs.toFixed(1)} ms`,
    `fonts: ${(fontBytes / 1024 / 1024).toFixed(2)} MB, inject ${fontInjectMs.toFixed(1)} ms`,
    `render (raw): ${renderMs.toFixed(1)} ms, pages: ${result.pages.length}`,
    `diagnostics: ${diagnostics.items.length} (errors: ${errorCount})`,
  ].join('\n');

  window.__SHOJIKU__ = {
    ok: result.ok,
    pages: result.pages.length,
    errorCount,
    instantiateMs,
    fontInjectMs,
    renderMs,
    pageSelect,
    typedError,
  };
  setStatus('done', `done — ${result.pages.length} page(s)`);
} catch (err) {
  fail(err);
}
