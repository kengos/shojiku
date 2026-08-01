// Round-trip against the real bundled examples (not synthetic fixtures): ops
// applied to `examples/business/receipt-ja/templates.yml` must touch only their keys,
// and EVERY bundled `templates.yml` must be stored at the Designer's canonical
// fixed point so a template-engineer's first-edit diff stays clean (the
// adoption gate). The canonical form is `serializeTemplate` (folding
// off); the fixed-point block below is the permanent gate a future example
// re-drifting would trip.

// Node types are referenced HERE only (the base tsconfig sets `types: []`):
// this test reads the bundled examples off disk, but designer-core source stays
// browser-pure with no ambient node globals.
/// <reference types="node" />

import { globSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseTemplate, serializeTemplate } from './document';
import { applyOp } from './ops';

const EXAMPLES_DIR = new URL('../../../examples/', import.meta.url);

const AUTHORED = readFileSync(new URL('business/receipt-ja/templates.yml', EXAMPLES_DIR), 'utf8');
const CANONICAL = serializeTemplate(parseTemplate(AUTHORED));

describe('receipt-ja round-trip', () => {
  it('the on-disk example already equals its canonical form', () => {
    expect(AUTHORED).toBe(CANONICAL);
  });

  it('canonical form is a fixed point of parse -> serialize', () => {
    expect(serializeTemplate(parseTemplate(CANONICAL))).toBe(CANONICAL);
  });

  it('keeps the authored comments through the round-trip', () => {
    for (const comment of ['# Document presentation defaults', '# Named styles (CSS classes)']) {
      expect(AUTHORED).toContain(comment);
      expect(CANONICAL).toContain(comment);
    }
  });

  it('setScalar on defaults changes exactly that line', () => {
    const doc = parseTemplate(CANONICAL);
    const result = applyOp(doc, {
      op: 'setScalar',
      path: 'defaults',
      keys: ['currency'],
      value: 'USD',
    });
    expect(result.ok).toBe(true);
    expect(serializeTemplate(doc)).toBe(CANONICAL.replace('currency: JPY', 'currency: USD'));
  });

  it('setScalar on a named style leaves every other byte identical', () => {
    const doc = parseTemplate(CANONICAL);
    const result = applyOp(doc, {
      op: 'setScalar',
      path: 'styles.heading',
      keys: ['fontSize'],
      value: 28,
    });
    expect(result.ok).toBe(true);
    expect(serializeTemplate(doc)).toBe(CANONICAL.replace('fontSize: 24', 'fontSize: 28'));
  });
});

// The permanent fixed-point gate: every bundled example is stored canonical, so
// `serializeTemplate(parseTemplate(src)) === src` byte-for-byte. A new or edited
// example that isn't run through `pnpm normalize:examples` reds here.
describe('bundled examples are stored at the canonical fixed point', () => {
  const files = globSync('*/*/templates.yml', { cwd: fileURLToPath(EXAMPLES_DIR) }).sort();

  it('discovers the bundled example templates', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const rel of files) {
    it(`${rel} satisfies serialize(parse(src)) === src`, () => {
      const src = readFileSync(new URL(rel, EXAMPLES_DIR), 'utf8');
      expect(serializeTemplate(parseTemplate(src))).toBe(src);
    });
  }
});
