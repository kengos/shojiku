// Replaces the __INLINE_SCRIPT_HASHES__ token in the BUILT _headers with the
// sha256 of every inline <script> the built HTML actually carries (VitePress
// emits three: the dark-mode probe, the mac-os probe, and the site-data
// bootstrap — the last one changes content per build, so the hashes must be
// computed here, not hand-pinned). This keeps the site scope's
// no-'unsafe-inline' posture while letting exactly the shipped scripts run.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIST = join(import.meta.dirname, "..", ".vitepress", "dist");

function htmlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    // The Designer's dist keeps its own CSP scope — its inline content (if
    // any) is not the site scope's business.
    if (e.name === "designer") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...htmlFiles(p));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

const files = htmlFiles(DIST);
if (files.length === 0) throw new Error("no HTML in dist — build first");

const hashes = new Set<string>();
for (const f of files) {
  const html = readFileSync(f, "utf8");
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const body = m[1]!;
    if (body.trim() === "") continue;
    hashes.add(`'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`);
  }
}

const headersPath = join(DIST, "_headers");
const text = readFileSync(headersPath, "utf8");
if (!text.includes("__INLINE_SCRIPT_HASHES__")) {
  throw new Error("_headers has no __INLINE_SCRIPT_HASHES__ token");
}
const joined = [...hashes].sort().join(" ");
const out = text.replaceAll("__INLINE_SCRIPT_HASHES__", joined).replace(/ {2,}/g, " ");
if (out.includes("__INLINE_SCRIPT_HASHES__")) throw new Error("token survived the replace");
writeFileSync(headersPath, out);
console.log(`csp hashes: ${files.length} pages scanned, ${hashes.size} unique inline scripts allowed`);
