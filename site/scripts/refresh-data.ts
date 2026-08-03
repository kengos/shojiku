// The committed halves of the site's generated inputs, in three modes:
//
//   `make site-data`          (default)        the README gallery section,
//                                              generated from examples/gallery.yml
//   `make site-check`         (--check)        both halves, compared not written
//   `make site-wasm-release`  (--release-wasm) RELEASE TIME ONLY: point
//                                              site/.data/wasm at a released build
//
// The wasm half is deliberately NOT part of the routine refresh. site/.data/wasm
// is what Cloudflare Pages serves, so it holds a RELEASED engine and moves only
// when a release moves it; --check pins it by the sha256 digests recorded in
// site/.data/wasm-source.json rather than by rebuilding, which is what keeps the
// check honest (a rebuild comparison forces the committed copy to track HEAD,
// and it cannot even agree with itself across host architectures — the .wasm
// binary differs between an arm64 host and CI's x86_64).
//
// CANONICAL WASM = the x86_64 CI build (the `wasm-pkg` artifact). At release
// time, refresh engine/wasm/pkg from the release commit's run
// (`gh run download <run> -n wasm-pkg -R kengos/shojiku`) before --release-wasm.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseGallery } from "../src/lib/gallery.ts";
import { renderReadmeGallery, spliceReadme } from "../src/lib/readme.ts";
import {
  checkWasmSource,
  parseWasmSource,
  releasedVersions,
  renderWasmSource,
  repinRefusal,
  workspacePackageVersion,
  type WasmSource,
} from "../src/lib/wasmSource.ts";

const SITE = join(import.meta.dirname, "..");
const ROOT = join(SITE, "..");
const WASM_DIR = join(SITE, ".data", "wasm");
const SOURCE_FILE = join(SITE, ".data", "wasm-source.json");
const mode = process.argv.includes("--release-wasm") ? "release-wasm" : process.argv.includes("--check") ? "check" : "refresh";

let drift = 0;
function settle(dest: string, next: Buffer): void {
  let cur: Buffer | undefined;
  try {
    cur = readFileSync(dest);
  } catch {
    cur = undefined;
  }
  if (cur !== undefined && Buffer.compare(cur, next) === 0) return;
  if (mode === "check") {
    console.error(`stale: ${dest}`);
    drift += 1;
  } else {
    writeFileSync(dest, next);
  }
}

/** Every file under site/.data/wasm, name → sha256 of the committed bytes. */
function digestsOf(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of readdirSync(dir).sort()) {
    out[f] = createHash("sha256").update(readFileSync(join(dir, f))).digest("hex");
  }
  return out;
}

function readSource(): WasmSource | undefined {
  try {
    return parseWasmSource(readFileSync(SOURCE_FILE, "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

function released(): string[] {
  return releasedVersions(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"));
}

// 1. The README gallery section from examples/gallery.yml.
const entries = parseGallery(readFileSync(join(ROOT, "examples", "gallery.yml"), "utf8"));
const readmePath = join(ROOT, "README.md");
if (mode !== "release-wasm") {
  settle(readmePath, Buffer.from(spliceReadme(readFileSync(readmePath, "utf8"), renderReadmeGallery(entries))));
}

// 2. The committed engine, against the release it records.
if (mode === "check") {
  const source = readSource();
  if (source === undefined) {
    console.error(`missing: ${SOURCE_FILE} — site/.data/wasm has no recorded release`);
    drift += 1;
  } else if (!existsSync(WASM_DIR)) {
    console.error(`missing: ${WASM_DIR} — the committed site engine is not there`);
    drift += 1;
  } else {
    for (const message of checkWasmSource(source, digestsOf(WASM_DIR), released())) {
      console.error(message);
      drift += 1;
    }
    console.log(`site engine: ${Object.keys(source.files).length} files pinned to ${source.version}`);
  }
}

// 3. Release time: point the site at a released build of engine/wasm/pkg.
if (mode === "release-wasm") {
  const pkg = join(ROOT, "engine", "wasm", "pkg");
  const files = readdirSync(pkg).sort();
  if (files.length === 0) throw new Error("engine/wasm/pkg is empty — run `make wasm` first");
  const next: WasmSource = {
    version: workspacePackageVersion(readFileSync(join(ROOT, "engine", "Cargo.toml"), "utf8")),
    files: Object.fromEntries(
      files.map((f) => [f, createHash("sha256").update(readFileSync(join(pkg, f))).digest("hex")]),
    ),
  };
  const refusal = repinRefusal(readSource(), next, released());
  if (refusal !== undefined) throw new Error(`refusing to re-pin the site engine: ${refusal}`);
  // Never commit a record the check would then refuse to read: the parser is
  // the authority on what a pinnable name and digest look like.
  parseWasmSource(renderWasmSource(next));
  rmSync(WASM_DIR, { recursive: true, force: true });
  mkdirSync(WASM_DIR, { recursive: true });
  for (const f of files) writeFileSync(join(WASM_DIR, f), readFileSync(join(pkg, f)));
  writeFileSync(SOURCE_FILE, renderWasmSource(next));
  console.log(`site engine: ${files.length} files re-pinned to ${next.version}`);
}

console.log(
  `${mode === "check" ? "checked" : "refreshed"}: gallery ${entries.length} entries${mode === "check" ? `, drift ${drift}` : ""}`,
);
if (mode === "check" && drift > 0) process.exit(1);
