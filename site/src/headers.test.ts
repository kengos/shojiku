// S1: the deployed _headers is pinned — the /designer/* scope must equal the
// Designer's canonical CSP verbatim (gui/designer-app/public/_headers), and
// the site scope must stay STRICTER (no raw.githubusercontent.com) while
// carrying exactly the additions the site needs (blob: images, the analytics
// beacon). A widened origin anywhere here is a red diff, not a silent ship.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const SITE_HEADERS = readFileSync(join(ROOT, "site", "public", "_headers"), "utf8");
const DESIGNER_HEADERS = readFileSync(join(ROOT, "gui", "designer-app", "public", "_headers"), "utf8");

function cspOf(text: string, afterMarker: string): string {
  const from = text.indexOf(afterMarker);
  const m = text.slice(from).match(/^\s*Content-Security-Policy: (.+)$/m);
  if (!m) throw new Error(`no CSP after ${afterMarker}`);
  return m[1]!.trim();
}

describe("_headers", () => {
  const siteCsp = cspOf(SITE_HEADERS, "/*");
  const designerScopeCsp = cspOf(SITE_HEADERS, "/designer/*");
  const designerCanonical = cspOf(DESIGNER_HEADERS, "/*");

  it("keeps the /designer/* CSP identical to the Designer's canonical file", () => {
    expect(designerScopeCsp).toBe(designerCanonical);
  });

  it("detaches the site CSP before re-setting it in the /designer/* scope", () => {
    const scope = SITE_HEADERS.slice(SITE_HEADERS.indexOf("/designer/*"));
    expect(scope).toMatch(/^\s*! Content-Security-Policy$/m);
  });

  it("site scope never allows the Designer's github-raw hole", () => {
    expect(siteCsp).not.toContain("raw.githubusercontent.com");
  });

  it("site scope carries exactly the site's additions", () => {
    expect(siteCsp).toContain("img-src 'self' data: blob:");
    expect(siteCsp).toContain("script-src 'self' 'wasm-unsafe-eval' https://static.cloudflareinsights.com");
    expect(siteCsp).toContain("connect-src 'self' https://cloudflareinsights.com");
    expect(siteCsp).toContain("frame-ancestors 'none'");
  });

  it("no CDN or Google-Fonts origin anywhere in the site source (S3)", () => {
    const dirs = ["src", ".vitepress/theme", "scripts", "public"];
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const e of readdirSync(join(ROOT, "site", d), { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(d, e.name));
        else files.push(join(d, e.name));
      }
    };
    for (const d of dirs) walk(d);
    const pages = readdirSync(join(ROOT, "site")).filter((f) => f.endsWith(".md"));
    const all = [...files, ...pages, ...readdirSync(join(ROOT, "site", "ja")).map((f) => join("ja", f))];
    expect(all.length).toBeGreaterThan(30); // positive control: the sweep saw the tree
    for (const f of all.filter((f) => !f.endsWith("headers.test.ts"))) {
      const text = readFileSync(join(ROOT, "site", f), "utf8");
      expect(text, f).not.toMatch(/fonts\.gstatic|fonts\.googleapis|cdn\.jsdelivr|unpkg\.com|cdnjs/);
    }
  });

  it("both scopes keep the hard lines", () => {
    for (const csp of [siteCsp, designerScopeCsp]) {
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("base-uri 'self'");
      expect(csp).not.toContain("'unsafe-eval'"); // only 'wasm-unsafe-eval'
    }
    expect(SITE_HEADERS).toContain("X-Content-Type-Options: nosniff");
    expect(SITE_HEADERS).toContain("Referrer-Policy: no-referrer");
  });
});
