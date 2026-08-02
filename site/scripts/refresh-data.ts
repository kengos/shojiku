// `make site-data` (default) and `make site-check` (--check): the committed
// halves of the site's generated inputs — site/.data/wasm (copied from the
// `make wasm` output, which Cloudflare's Node build cannot produce) and the
// README gallery section (generated from examples/gallery.yml). Check mode
// compares instead of writing and exits 1 on any drift.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseGallery } from "../src/lib/gallery.ts";
import { renderReadmeGallery, spliceReadme } from "../src/lib/readme.ts";

const SITE = join(import.meta.dirname, "..");
const ROOT = join(SITE, "..");
const check = process.argv.includes("--check");

let drift = 0;
function read(dest: string): Buffer | undefined {
  try {
    return readFileSync(dest);
  } catch {
    return undefined;
  }
}
function settle(dest: string, next: Buffer): void {
  const cur = read(dest);
  if (cur !== undefined && Buffer.compare(cur, next) === 0) return;
  if (check) {
    console.error(`stale: ${dest}`);
    drift += 1;
  } else {
    writeFileSync(dest, next);
  }
}

// 1. engine/wasm/pkg → site/.data/wasm (requires a prior `make wasm`).
const pkg = join(ROOT, "engine", "wasm", "pkg");
const files = readdirSync(pkg).sort();
if (files.length === 0) throw new Error("engine/wasm/pkg is empty — run `make wasm` first");
const dataDir = join(SITE, ".data", "wasm");
if (!check) {
  rmSync(dataDir, { recursive: true, force: true });
  mkdirSync(dataDir, { recursive: true });
}
for (const f of files) settle(join(dataDir, f), readFileSync(join(pkg, f)));
if (check) {
  // A file committed under .data but no longer produced is drift too.
  const committed = readdirSync(dataDir).sort();
  for (const f of committed) {
    if (!files.includes(f)) {
      console.error(`stale: ${join(dataDir, f)} (no longer produced)`);
      drift += 1;
    }
  }
}

// 2. The README gallery section from examples/gallery.yml.
const entries = parseGallery(readFileSync(join(ROOT, "examples", "gallery.yml"), "utf8"));
const readmePath = join(ROOT, "README.md");
settle(
  readmePath,
  Buffer.from(spliceReadme(readFileSync(readmePath, "utf8"), renderReadmeGallery(entries))),
);

console.log(
  `${check ? "checked" : "refreshed"}: wasm ${files.length} files, gallery ${entries.length} entries${check ? `, drift ${drift}` : ""}`,
);
if (check && drift > 0) process.exit(1);
