// Tests for ops.ts — the op layer's entry point: `applyOp`'s dispatch and
// the root-addressed form (omitted `path` = the document ROOT map), the only
// way to reach top-level keys the structural grammar cannot spell. Per-op
// behavior lives with the module that owns it: keyOps.test.ts /
// seqOps.test.ts / snippet.test.ts.
import { describe, expect, it } from 'vitest';
import { parseTemplate } from './document';
import { applyOp, type Op } from './ops';

// A realistic template with comments, nested maps, a flow-item sequence, and
// mixed flow/block styles — the round-trip subject. It is written in the
// `eemeli/yaml` canonical form (a fixed point of parse -> toString, e.g. the
// `[ heading ]` inner spacing the library emits), so an op that touches one key
// leaves every other byte identical.
const FIXTURE = [
  'version: 0.1.0',
  'name: receipt',
  '# Presentation defaults',
  'defaults:',
  '  locale: ja-JP',
  '  currency: JPY',
  'styles:',
  '  heading:',
  '    fontSize: 24 # title size',
  '    textAlign: center',
  'sections:',
  '  body:',
  '    items:',
  '      - type: text',
  '        text: 領収書',
  '        styleNames: [ heading ]',
  '      - type: text',
  '        data: { key: customerName }',
  '      - type: rect',
  '        box: { x: 0, y: 100, w: 200, h: 40 }',
  '',
].join('\n');

function apply(source: string, op: Op): string {
  const doc = parseTemplate(source);
  const result = applyOp(doc, op);
  expect(result.ok).toBe(true);
  return String(doc);
}

// The page-setup surface addresses top-level document keys (`page.size`,
// `page.orientation`) the structural path grammar cannot spell. Omitting `path`
// resolves `keys` from the document root map.
describe('root-addressed ops (omitted path)', () => {
  it('setScalar drills a nested key from the root, touching only it', () => {
    const out = apply(FIXTURE, { op: 'setScalar', keys: ['defaults', 'currency'], value: 'USD' });
    expect(out).toBe(FIXTURE.replace('currency: JPY', 'currency: USD'));
  });

  it('setScalar auto-creates a missing top-level map at the root', () => {
    const out = apply(FIXTURE, { op: 'setScalar', keys: ['page', 'size'], value: 'A4' });
    // The new key is appended at the root's end (yaml map insertion order).
    expect(out).toBe(`${FIXTURE}page:\n  size: A4\n`);
  });

  it('setStrings writes a flow sequence at a root-relative key path', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'setStrings', keys: ['tags'], values: ['a', 'b'] });
    expect(result.ok).toBe(true);
    expect(String(doc)).toContain('tags: [ a, b ]');
  });

  it('removeKey prunes a root-level map left empty by the delete', () => {
    const doc = parseTemplate(['version: 0.1.0', 'page:', '  size: A4', ''].join('\n'));
    const result = applyOp(doc, { op: 'removeKey', keys: ['page', 'size'] });
    expect(result.ok).toBe(true);
    expect(String(doc)).toBe('version: 0.1.0\n');
  });

  it('removeKey reports document root in the message when the key path is absent', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'removeKey', keys: ['page', 'size'] });
    expect(result.ok === false && result.error.code).toBe('key_not_found');
    expect(result.ok === false && result.error.message).toContain('document root');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('fails not_a_map on a scalar document root without mutating', () => {
    const doc = parseTemplate('just-a-scalar\n');
    const result = applyOp(doc, { op: 'setScalar', keys: ['page'], value: 'A4' });
    expect(result.ok === false && result.error.code).toBe('not_a_map');
    expect(result.ok === false && result.error.message).toContain('document root is not a map');
    expect(String(doc)).toBe('just-a-scalar\n');
  });

  it('fails not_a_map on a sequence document root', () => {
    const doc = parseTemplate(['- a', '- b', ''].join('\n'));
    const result = applyOp(doc, { op: 'removeKey', keys: ['page'] });
    expect(result.ok === false && result.error.code).toBe('not_a_map');
  });

  it('fails path_not_found on an empty document root', () => {
    const doc = parseTemplate('');
    const result = applyOp(doc, { op: 'setScalar', keys: ['page', 'size'], value: 'A4' });
    expect(result.ok === false && result.error.code).toBe('path_not_found');
    expect(result.ok === false && result.error.message).toContain('document root is empty');
  });
});
