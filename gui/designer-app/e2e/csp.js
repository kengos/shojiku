// Every e2e test runs under the Content-Security-Policy production serves the
// Designer with, and fails on any violation of it. The nginx image these tests
// drive sends no CSP at all, which is how a policy that blocked the app's own
// `blob:` images and PDF preview once passed every browser test and was found
// only on the hosted preview.
//
// The policy is READ from the deployment's own `site/public/_headers` (the
// whole Pages deployment, the Designer under `/designer/`), never copied: a
// copy here would pass while production drifted. run-e2e.sh mounts that file
// and names it in CSP_HEADERS_FILE.
//
// Spec files take `test` and `expect` from here, not from `@playwright/test`,
// or they run without the policy.
const { readFileSync } = require('node:fs');
const path = require('node:path');
const base = require('@playwright/test');

const HEADERS_FILE =
  process.env.CSP_HEADERS_FILE || path.join(__dirname, '../../../site/public/_headers');
// Where Pages serves the Designer; its CSP is the one `/designer/*` resolves to.
const DESIGNER_PATH = '/designer/';

/** The headers Cloudflare Pages attaches to `urlPath` under a `_headers` file:
 * every block whose pattern matches (a `*` is a splat) applies in file order, a
 * repeated name joins with `, `, and `! Name` detaches what blocks ABOVE it set
 * — measured against the deployment: `/designer/` is served the Designer's
 * policy alone, not joined to the site's and not dropped.
 * Keys are lower-cased. Only the shapes the file uses today are read; a
 * `:placeholder`, an absolute-URL pattern or a rule with no colon throws,
 * rather than resolving to a policy production would not send. */
function resolveHeaders(text, urlPath) {
  const headers = new Map();
  let applies = false;
  for (const line of text.split('\n')) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      if (!line.startsWith('/') || line.includes(':')) {
        throw new Error(`unsupported _headers pattern: ${line}`);
      }
      const pattern = line.trim().split('*').map(escapeRegExp).join('.*');
      applies = new RegExp(`^${pattern}$`).test(urlPath);
      continue;
    }
    if (!applies) continue;
    const rule = line.trim();
    if (rule.startsWith('!')) {
      headers.delete(rule.slice(1).trim().toLowerCase());
      continue;
    }
    const colon = rule.indexOf(':');
    if (colon < 1) throw new Error(`unsupported _headers rule: ${rule}`);
    const name = rule.slice(0, colon).trim().toLowerCase();
    const value = rule.slice(colon + 1).trim();
    headers.set(name, headers.has(name) ? `${headers.get(name)}, ${value}` : value);
  }
  return headers;
}

function escapeRegExp(s) {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function designerCsp() {
  const csp = resolveHeaders(readFileSync(HEADERS_FILE, 'utf8'), DESIGNER_PATH).get(
    'content-security-policy',
  );
  // A file that resolved to no policy would run every test without one, which
  // is exactly the state this module exists to end.
  if (!csp) throw new Error(`${HEADERS_FILE} sets no Content-Security-Policy for ${DESIGNER_PATH}`);
  return csp;
}

const CSP = designerCsp();

const test = base.test.extend({
  // Auto: every test gets the policy and the violation check without asking.
  // A test that EXPECTS a violation takes this list and empties it itself.
  cspViolations: [
    // Takes `page` so this tears down BEFORE the page does, while its frames
    // can still be flushed.
    async ({ context, page: _page }, use) => {
      const violations = [];
      // On the CONTEXT, so a page the app opened itself would be covered too.
      await context.exposeBinding('__shojikuCspViolation', (_source, v) => violations.push(v));
      await context.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (e) => {
          window.__shojikuCspViolation({
            directive: e.effectiveDirective,
            blocked: e.blockedURI,
            source: e.sourceFile ? `${e.sourceFile}:${e.lineNumber}` : undefined,
          });
        });
      });
      // A policy applies per DOCUMENT: every document fetched over the network
      // gets the header here, a frame as much as the first navigation. A
      // `blob:` frame (the PDF preview) never reaches a route; it inherits the
      // policy of the document that minted it. The app runs no worker, which
      // would have needed its own.
      await context.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.continue();
        // A redirect goes back to the browser as is, so its target is a
        // document request of its own (and gets the header) at its real URL.
        const response = await route.fetch({ maxRedirects: 0 });
        // The fetched body arrives decoded, so its encoding headers no longer
        // describe it.
        const {
          'content-encoding': _encoding,
          'content-length': _length,
          ...headers
        } = response.headers();
        await route.fulfill({
          response,
          headers: { ...headers, 'content-security-policy': CSP },
        });
      });
      await use(violations);
      // A violation is dispatched as a task and crosses the binding
      // asynchronously, so one raised by the test's LAST step can still be in
      // flight: one round trip through every frame of every open page lets it
      // land first.
      for (const open of context.pages().filter((p) => !p.isClosed())) {
        for (const frame of open.frames()) {
          // A frame that went away mid-flush has nothing left to deliver.
          await frame
            .evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)))
            .catch(() => {});
        }
      }
      base.expect(violations, `CSP violations under ${HEADERS_FILE}`).toEqual([]);
    },
    { auto: true },
  ],
});

module.exports = { test, expect: base.expect };
