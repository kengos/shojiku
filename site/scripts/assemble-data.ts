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
import { checkSitePages, renderLlmsFull, renderLlmsTxt, SITE_PAGES } from "../src/lib/llms.ts";
import { DEMO_DIR } from "../src/lib/demos.ts";
import { landingIndex, llmsFullPages, projectPage, readPage, REFERENCE_LOCALES, SOURCE_DIR } from "../src/lib/reference.ts";

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
const LIVE = ["dev/live-flex", "business/receipt-ja"] as const;
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

// The reference pages, read once: step 5 inlines their bodies and step 6
// projects them into routes.
const srcDir = join(ROOT, SOURCE_DIR);
const stems = readdirSync(srcDir).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)).sort();
const refPages = stems.map((s) => readPage(s, readFileSync(join(srcDir, `${s}.md`), "utf8")));
const demoNames = new Set(readdirSync(join(ROOT, DEMO_DIR)));

// 5. llms.txt + llms-full.txt from the shared preamble + repo docs. The
//    reference's AUTHORING pages are inlined (see step 6 for the page read):
//    an agent asking about `flex` used to get the index and have to fetch the
//    rest. Bodies only — the `reference:` front-matter is projection metadata,
//    not documentation, and would read as authorable syntax. `features.md` is
//    left out (src/lib/reference.ts § LLMS_FULL_OMIT): it is the decision log,
//    and a third of the payload.
//    The Site list is checked against the pages that really exist rather than
//    trusted — an entry with no file is a 404 an agent follows.
checkSitePages(readdirSync(SITE).filter((f) => f.endsWith(".md")).map((f) => f.slice(0, -3)));
putText(renderLlmsTxt(SITE_PAGES), join(PUB, "llms.txt"));
putText(
  renderLlmsFull(
    readFileSync(join(SITE, "src", "llms-preamble.md"), "utf8"),
    gallery,
    [
      ...llmsFullPages(refPages).map((p) => ({ label: `${SOURCE_DIR}${p.stem}.md — ${p.meta.summary}`, text: p.body })),
      { label: "docs/quickstart.md", text: readFileSync(join(ROOT, "docs", "quickstart.md"), "utf8") },
    ],
  ),
  join(PUB, "llms-full.txt"),
);

// 6. The reference: docs/engine/*.md projected to site/reference/*.md (a
//    VitePress route each) plus the per-page demo documents under public/.
//    Paths are FIXED repo locations — never derived from file content — so
//    nothing a page says can redirect what the build reads or writes.
for (const locale of REFERENCE_LOCALES) {
  const out = join(ROOT, locale.dir);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const page of refPages) {
    // README is the landing (/reference/); every other page keeps its stem.
    const route = page.stem === "README" ? "index" : page.stem;
    writeFileSync(
      join(out, `${route}.md`),
      projectPage(page, {
        source: `${SOURCE_DIR}${page.stem}.md`,
        demo: demoNames.has(page.stem) ? page.stem : undefined,
        extra: page.stem === "README" ? landingIndex(refPages, locale.base) : undefined,
        landing: page.stem === "README",
        notice: locale.notice,
      }),
    );
  }
}
// Each page's own markdown, served from THIS origin, for the strip's "Copy
// for AI". Fetching the GitHub blob from the page cannot work: the site CSP
// is `connect-src 'self'` and widening it for github-raw is the exact hole
// `headers.test.ts` refuses. Bodies only — the `reference:` front-matter is
// projection metadata, and an agent handed it would read it as syntax.
for (const page of refPages) {
  putText(page.body, join(PUB, "data", "reference", `${page.stem}.md`));
}
for (const name of [...demoNames].sort()) {
  const from = join(ROOT, DEMO_DIR, name);
  const files = readdirSync(from).sort();
  for (const f of files) put(join(from, f), join(PUB, "data", "reference", name, f));
  putText(JSON.stringify({ files }), join(PUB, "data", "reference", name, "index.json"));
}

// Prove the run: input counts first, then the cap check over every emitted
// file (a zero anywhere here is a broken assembly, not a clean one).
if (gallery.length === 0 || wasmFiles.length === 0) throw new Error("empty inputs");
if (refPages.length === 0 || demoNames.size === 0) throw new Error("empty reference inputs");
let over = 0;
for (const f of emitted) {
  if (statSync(f).size >= MAX_FILE_BYTES) {
    console.error(`OVER 25 MiB Pages cap: ${f}`);
    over += 1;
  }
}
if (over > 0) throw new Error(`${over} file(s) exceed the Pages per-file cap`);
console.log(
  `assembled: wasm ${wasmFiles.length} files, tiers ${TIERS.length}, gallery ${gallery.length} entries, reference ${refPages.length} pages + ${demoNames.size} demos, emitted ${emitted.length} files, all under 25 MiB`,
);
