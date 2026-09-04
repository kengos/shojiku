// @vitest-environment node
//
// The drift guard for the panel's copy of the hyperlink gate. `linkUrlProblem`
// mirrors `engine/layout/src/engine/link.rs::check_link_url`, and a mirror with
// nothing holding it to its original is how a field starts refusing what the
// engine accepts (or, worse, accepting what it drops) with every gate green.
//
// Three things are DERIVED from the Rust rather than restated: the scheme
// allowlist, the byte cap, and the set of item types whose wire struct carries
// a `link:` field at all. Same shape as `noBoxWire.test.ts` and
// `borderTypes.test.ts`.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LINK_SCHEMES, LINK_TYPES, MAX_LINK_URL_BYTES } from './linkModel';

const ENGINE = new URL('../../../../engine/', import.meta.url);

function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, ENGINE)), 'utf8');
}

describe('the link gate the panel mirrors', () => {
  const source = read('layout/src/engine/link.rs');

  it('reads the same scheme allowlist the engine gates on', () => {
    // `let allowed = ["http:", "https:", "mailto:", "tel:"];`
    const match = /let allowed = \[([^\]]*)\]/.exec(source);
    expect(match, 'the allowlist literal moved in link.rs').not.toBeNull();
    const schemes = [...(match?.[1] ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    // A positive control: the extraction found something, so an equal-to-empty
    // comparison below cannot pass vacuously.
    expect(schemes.length).toBeGreaterThan(0);
    expect(schemes).toEqual([...LINK_SCHEMES]);
  });

  it('reads the same byte cap', () => {
    const match = /const MAX_LINK_URL: usize = (\d+)/.exec(source);
    expect(match, 'MAX_LINK_URL moved in link.rs').not.toBeNull();
    expect(Number(match?.[1])).toBe(MAX_LINK_URL_BYTES);
  });

  it('gates the RESOLVED url, which is why an interpolating one is passed through', () => {
    // The load-bearing fact behind `linkUrlProblem`'s first branch: the
    // interpolation runs BEFORE the check, so nothing about the authored
    // string can be judged here. If this order ever inverts, the panel would
    // be right to start refusing `{key}` URLs — and this test says so.
    const body = source.slice(source.indexOf('fn resolve_link'));
    expect(body.indexOf('resolve_content')).toBeLessThan(body.indexOf('check_link_url'));
  });
});

describe('the item types that carry a link', () => {
  it('is exactly the `Item` variants whose struct has a `link` field', () => {
    const items = read('core/src/template/items.rs');
    // Each `pub struct XItem {` … up to the closing brace at column 0.
    const withLink = [...items.matchAll(/pub struct (\w+)Item \{([\s\S]*?)\n\}/g)]
      .filter((m) => /^\s*pub link: Option<Link>,$/m.test(m[2]))
      .map((m) => m[1].replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase());
    expect(withLink.length, 'the struct scan matched nothing').toBeGreaterThan(0);
    expect([...withLink].sort()).toEqual([...LINK_TYPES].sort());
  });

  it('leaves the span carrier out, deliberately — it has no panel surface', () => {
    // `Span.link` is the third carrier and is NOT in `LINK_TYPES`: a span is a
    // fragment inside a text item, not an item the panel selects. Pinning it
    // here means the day a span editor ships, this test is the reminder.
    expect(/pub link: Option<Link>,/.test(read('core/src/template/spans.rs'))).toBe(true);
    expect(LINK_TYPES.has('span')).toBe(false);
  });
});
