// Build-time assembly (pure Node — runs on Cloudflare Pages too): stages the
// live-renderer engine + tiered fonts + gallery previews + llms files into
// public/. Inputs are the repo (packs/, examples/, docs/) and the COMMITTED
// site/.data/wasm (the one artifact a Node build cannot produce — a RELEASED
// engine build, pinned by site/.data/wasm-source.json; see
// scripts/refresh-data.ts). Deterministic: sorted walks, fixed orders.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseGallery } from "../src/lib/gallery.ts";
import { MAX_FILE_BYTES, subsetManifest, TIERS } from "../src/lib/fonts.ts";
import { renderLlmsFull, renderLlmsTxt } from "../src/lib/llms.ts";

const SITE = join(import.meta.dirname, "..");
const ROOT = join(SITE, "..");
const PUB = join(SITE, "public");

const emitted: string[] = [];
function put(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
  emitted.push(dest);
}
function putText(text: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, text);
  emitted.push(dest);
}

// Generated public/ areas are rebuilt from scratch every run.
for (const area of ["data", "gallery", "brand", "llms.txt", "llms-full.txt"]) {
  rmSync(join(PUB, area), { recursive: true, force: true });
}

// 1. The wasm engine (committed under .data, re-pinned only by a release).
const wasmSrc = join(SITE, ".data", "wasm");
if (!existsSync(wasmSrc)) {
  throw new Error("site/.data/wasm is missing — it is committed; restore it from git, or re-pin with `make site-wasm-release`");
}
const wasmFiles = readdirSync(wasmSrc).sort();
if (wasmFiles.length === 0) throw new Error("site/.data/wasm is empty");
for (const f of wasmFiles) put(join(wasmSrc, f), join(PUB, "data", "wasm", f));

// 2. Tiered fonts, each a subset manifest + its faces + the license.
for (const t of TIERS) {
  const packDir = join(ROOT, "packs", "fonts", t.pack);
  const { manifestText, files } = subsetManifest(
    readFileSync(join(packDir, "manifest.yml"), "utf8"),
    t.faces,
  );
  const out = join(PUB, "data", "fonts", t.tier, t.pack);
  putText(manifestText, join(out, "manifest.yml"));
  for (const f of [...files, t.license]) put(join(packDir, f), join(out, f));
}

// 3. Gallery previews + the brand renders (all engine outputs, committed
//    under examples/ and hash-gated by `make examples-check`).
const gallery = parseGallery(readFileSync(join(ROOT, "examples", "gallery.yml"), "utf8"));
for (const e of gallery) {
  const slug = e.dir.replace("/", "-");
  for (const p of e.preview2 === undefined ? [e.preview] : [e.preview, e.preview2]) {
    put(join(ROOT, "examples", e.dir, p), join(PUB, "gallery", slug, p));
  }
}
put(join(ROOT, "examples", "dev", "site-hero", "preview-1.png"), join(PUB, "brand", "hero.png"));
put(join(ROOT, "examples", "dev", "site-icon", "preview-1.png"), join(PUB, "brand", "icon.png"));

// 4. The live-renderer examples: the REAL files of one en-US and one ja-JP
//    document (anti-duplication — the editor shows the committed example).
const LIVE = ["business/receipt-us", "business/receipt-ja"] as const;
for (const dir of LIVE) {
  const name = dir.split("/")[1]!;
  for (const f of ["templates.yml", "params.json", "definitions.yml"]) {
    put(join(ROOT, "examples", dir, f), join(PUB, "data", "live", name, f));
  }
  const assets = join(ROOT, "examples", dir, "assets");
  const assetFiles = existsSync(assets) ? readdirSync(assets).sort() : [];
  for (const f of assetFiles) put(join(assets, f), join(PUB, "data", "live", name, "assets", f));
  putText(JSON.stringify({ assets: assetFiles }), join(PUB, "data", "live", name, "index.json"));
}

// 5. llms.txt + llms-full.txt from the shared preamble + repo docs.
const pages = [
  { path: "/index", title: "Shojiku" },
  { path: "/concept", title: "Concept" },
  { path: "/gallery", title: "Gallery" },
  { path: "/tutorials", title: "Production tutorials" },
  { path: "/playground", title: "Playground" },
  { path: "/compare", title: "Compared to other engines" },
  { path: "/agents", title: "For AI agents" },
  { path: "/tech", title: "Technology, licensing & security model" },
] as const;
putText(renderLlmsTxt(pages), join(PUB, "llms.txt"));
putText(
  renderLlmsFull(
    readFileSync(join(SITE, "src", "llms-preamble.md"), "utf8"),
    gallery,
    [
      { label: "docs/engine/README.md (template reference index)", text: readFileSync(join(ROOT, "docs", "engine", "README.md"), "utf8") },
      { label: "docs/engine/diagnostics.md (the complete diagnostic-code registry)", text: readFileSync(join(ROOT, "docs", "engine", "diagnostics.md"), "utf8") },
      { label: "docs/quickstart.md", text: readFileSync(join(ROOT, "docs", "quickstart.md"), "utf8") },
    ],
  ),
  join(PUB, "llms-full.txt"),
);

// Prove the run: input counts first, then the cap check over every emitted
// file (a zero anywhere here is a broken assembly, not a clean one).
if (gallery.length === 0 || wasmFiles.length === 0) throw new Error("empty inputs");
let over = 0;
for (const f of emitted) {
  if (statSync(f).size >= MAX_FILE_BYTES) {
    console.error(`OVER 25 MiB Pages cap: ${f}`);
    over += 1;
  }
}
if (over > 0) throw new Error(`${over} file(s) exceed the Pages per-file cap`);
console.log(
  `assembled: wasm ${wasmFiles.length} files, tiers ${TIERS.length}, gallery ${gallery.length} entries, emitted ${emitted.length} files, all under 25 MiB`,
);
