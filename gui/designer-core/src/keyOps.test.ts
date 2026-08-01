// Tests for keyOps.ts — the five map-key ops (setScalar / setStrings /
// removeKey / renameKey / putValue), exercised through `applyOp` (the ONE
// public entry). The opTarget.ts resolution errors (path_not_found /
// not_a_map / key_not_found) and the opCreate.ts intermediate-map
// auto-creation legs these ops take are pinned here too.
import { describe, expect, it } from 'vitest';
import { parseTemplate } from './document';
import {
  applyOp,
  MAX_KEY_DEPTH,
  MAX_SNIPPET_DEPTH,
  MAX_SNIPPET_NODES,
  MAX_STRING_VALUES,
  type Op,
  type SnippetValue,
} from './ops';

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

const ITEM0 = 'sections.body.items[0]';
const ITEM1 = 'sections.body.items[1]';
const ITEM2 = 'sections.body.items[2]';

describe('setScalar', () => {
  it('changes only the targeted value, preserving comments and key order', () => {
    const out = apply(FIXTURE, {
      op: 'setScalar',
      path: 'defaults',
      keys: ['currency'],
      value: 'USD',
    });
    expect(out).toBe(FIXTURE.replace('currency: JPY', 'currency: USD'));
  });

  it('sets a nested scalar and keeps the sibling comment', () => {
    const out = apply(FIXTURE, {
      op: 'setScalar',
      path: 'styles.heading',
      keys: ['fontSize'],
      value: 18,
    });
    expect(out).toContain('fontSize: 18 # title size');
    expect(out).toContain('textAlign: center');
  });

  it('adds a new key without disturbing existing ones', () => {
    const out = apply(FIXTURE, { op: 'setScalar', path: 'defaults', keys: ['style'], value: 'x' });
    expect(out).toContain('currency: JPY');
    expect(out).toContain('style: x');
  });

  it('sets a value in an existing intermediate map', () => {
    const out = apply(FIXTURE, { op: 'setScalar', path: ITEM2, keys: ['box', 'x'], value: 12 });
    const box = parseTemplate(out).toJS().sections.body.items[2].box;
    expect(box).toEqual({ x: 12, y: 100, w: 200, h: 40 });
  });

  it('creates one missing intermediate map', () => {
    const out = apply(FIXTURE, { op: 'setScalar', path: ITEM1, keys: ['box', 'x'], value: 5 });
    expect(parseTemplate(out).toJS().sections.body.items[1].box).toEqual({ x: 5 });
  });

  it('creates two missing intermediate maps', () => {
    const out = apply(FIXTURE, {
      op: 'setScalar',
      path: ITEM1,
      keys: ['a', 'b', 'c'],
      value: 1,
    });
    expect(parseTemplate(out).toJS().sections.body.items[1].a).toEqual({ b: { c: 1 } });
  });

  it('fails when the path does not resolve, leaving the doc untouched', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'setScalar', path: 'nope', keys: ['a'], value: 1 });
    expect(result).toEqual({
      ok: false,
      error: { code: 'path_not_found', message: 'no node at nope' },
    });
    expect(String(doc)).toBe(FIXTURE);
  });

  it('fails when the path is not a map', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'setScalar',
      path: 'sections.body.items',
      keys: ['a'],
      value: 1,
    });
    expect(result.ok === false && result.error.code).toBe('not_a_map');
  });

  it('fails when an intermediate key is a scalar, not a map', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'setScalar', path: ITEM0, keys: ['text', 'sub'], value: 1 });
    expect(result.ok === false && result.error.code).toBe('not_a_map');
    expect(String(doc)).toBe(FIXTURE);
  });

  it.each([Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN])(
    'refuses the non-finite number %s the engine would parse-reject',
    (value) => {
      const doc = parseTemplate(FIXTURE);
      const result = applyOp(doc, { op: 'setScalar', path: 'defaults', keys: ['x'], value });
      expect(result.ok === false && result.error.code).toBe('invalid_value');
      expect(String(doc)).toBe(FIXTURE);
    },
  );

  it('clips an over-long path echoed in an error message', () => {
    const doc = parseTemplate(FIXTURE);
    const longPath = 'a'.repeat(300);
    const result = applyOp(doc, { op: 'setScalar', path: longPath, keys: ['a'], value: 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('path_not_found');
      expect(result.error.message.length).toBeLessThan(250);
      expect(result.error.message).toContain('…');
    }
  });
});

describe('setScalar key-path caps', () => {
  it('rejects an empty key path', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'setScalar', path: 'defaults', keys: [], value: 1 });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects a key path deeper than the cap', () => {
    const doc = parseTemplate(FIXTURE);
    const keys = Array.from({ length: MAX_KEY_DEPTH + 1 }, (_, i) => `k${i}`);
    const result = applyOp(doc, { op: 'setScalar', path: 'defaults', keys, value: 1 });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
  });

  it('rejects an empty-string key segment', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'setScalar', path: ITEM2, keys: ['box', ''], value: 1 });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
  });
});

describe('setStrings', () => {
  it('writes a flow sequence of strings, matching the preset list form', () => {
    const out = apply(FIXTURE, {
      op: 'setStrings',
      path: ITEM1,
      keys: ['styleNames'],
      values: ['bold', 'muted'],
    });
    expect(out).toContain('styleNames: [ bold, muted ]');
  });

  it('replaces an existing string list', () => {
    const out = apply(FIXTURE, {
      op: 'setStrings',
      path: ITEM0,
      keys: ['styleNames'],
      values: ['title'],
    });
    expect(out).toContain('styleNames: [ title ]');
    expect(out).not.toContain('[ heading ]');
  });

  it('rejects an empty string list (removeKey clears instead)', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'setStrings',
      path: ITEM0,
      keys: ['styleNames'],
      values: [],
    });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects a list over the cap', () => {
    const doc = parseTemplate(FIXTURE);
    const values = Array.from({ length: MAX_STRING_VALUES + 1 }, (_, i) => `s${i}`);
    const result = applyOp(doc, { op: 'setStrings', path: ITEM0, keys: ['styleNames'], values });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
  });

  it('rejects an out-of-shape key path before touching the document', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'setStrings', path: ITEM0, keys: [], values: ['a'] });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });
});

describe('removeKey', () => {
  it('removes a top-level key and leaves the rest byte-identical', () => {
    const out = apply(FIXTURE, { op: 'removeKey', path: 'defaults', keys: ['locale'] });
    expect(out).toBe(FIXTURE.replace('  locale: ja-JP\n', ''));
  });

  it('removes a nested key but keeps the still-populated parent', () => {
    const out = apply(FIXTURE, { op: 'removeKey', path: ITEM2, keys: ['box', 'x'] });
    expect(parseTemplate(out).toJS().sections.body.items[2].box).toEqual({ y: 100, w: 200, h: 40 });
  });

  it('prunes an intermediate map left empty by the removal', () => {
    const out = apply(FIXTURE, { op: 'removeKey', path: ITEM1, keys: ['data', 'key'] });
    expect(parseTemplate(out).toJS().sections.body.items[1]).toEqual({ type: 'text' });
    expect(out).not.toContain('data:');
  });

  it('fails when the final key is absent', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'removeKey', path: 'defaults', keys: ['missing'] });
    expect(result.ok === false && result.error.code).toBe('key_not_found');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('fails when an intermediate key is absent', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'removeKey', path: ITEM1, keys: ['nope', 'key'] });
    expect(result.ok === false && result.error.code).toBe('key_not_found');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('fails when an intermediate key is a scalar, not a map', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'removeKey', path: ITEM0, keys: ['text', 'x'] });
    expect(result.ok === false && result.error.code).toBe('not_a_map');
  });

  it('fails when the path is not a map', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'removeKey', path: 'sections.body.items', keys: ['a'] });
    expect(result.ok === false && result.error.code).toBe('not_a_map');
  });

  it('rejects an empty key path', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'removeKey', path: 'defaults', keys: [] });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
  });
});

describe('renameKey', () => {
  it('renames a nested map key in place, preserving the value node byte-for-byte', () => {
    // The `heading` style's value (its map + the `# title size` comment) must
    // survive intact — only the key scalar changes, and its map position holds.
    const out = apply(FIXTURE, { op: 'renameKey', path: 'styles', keys: ['heading'], to: 'title' });
    expect(out).toBe(FIXTURE.replace('  heading:', '  title:'));
    expect(out).toContain('fontSize: 24 # title size');
  });

  it('renames a root-level key (omitted path) without touching other keys', () => {
    const out = apply(FIXTURE, { op: 'renameKey', keys: ['name'], to: 'title' });
    expect(out).toBe(FIXTURE.replace('name: receipt', 'title: receipt'));
  });

  it('renames an op-created (raw-string) key, matching eemeli map.set keys too', () => {
    // A key added via a prior op is stored as a RAW STRING (map.set), not a
    // Scalar — findPairByKey must match that form as well as parsed Scalar keys.
    const doc = parseTemplate(FIXTURE);
    expect(applyOp(doc, { op: 'putValue', keys: ['styles', 'sub'], value: {} }).ok).toBe(true);
    const result = applyOp(doc, { op: 'renameKey', keys: ['styles', 'sub'], to: 'renamed' });
    expect(result.ok).toBe(true);
    const styles = parseTemplate(String(doc)).toJS().styles;
    expect(styles).toHaveProperty('renamed');
    expect(styles).not.toHaveProperty('sub');
  });

  it('fails when the final key is absent', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'renameKey', path: 'defaults', keys: ['missing'], to: 'x' });
    expect(result.ok === false && result.error.code).toBe('key_not_found');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('fails when an intermediate key is absent', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'renameKey',
      path: 'defaults',
      keys: ['nope', 'x'],
      to: 'y',
    });
    expect(result.ok === false && result.error.code).toBe('key_not_found');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('fails when an intermediate key is a scalar, not a map', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'renameKey',
      path: 'defaults',
      keys: ['locale', 'x'],
      to: 'y',
    });
    expect(result.ok === false && result.error.code).toBe('not_a_map');
  });

  it('fails when the path does not resolve to a map', () => {
    const doc = parseTemplate(FIXTURE);
    const missing = applyOp(doc, {
      op: 'renameKey',
      path: 'sections.footer',
      keys: ['a'],
      to: 'b',
    });
    expect(missing.ok === false && missing.error.code).toBe('path_not_found');
    const notMap = applyOp(doc, {
      op: 'renameKey',
      path: 'sections.body.items',
      keys: ['a'],
      to: 'b',
    });
    expect(notMap.ok === false && notMap.error.code).toBe('not_a_map');
  });

  it('rejects an empty rename target', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'renameKey', path: 'defaults', keys: ['locale'], to: '' });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects renaming a key to itself', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'renameKey',
      path: 'defaults',
      keys: ['locale'],
      to: 'locale',
    });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects a target that collides with an existing key', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'renameKey',
      path: 'defaults',
      keys: ['locale'],
      to: 'currency',
    });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects an empty key path', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'renameKey', path: 'defaults', keys: [], to: 'x' });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
  });

  it('rejects a key path deeper than the cap', () => {
    const doc = parseTemplate(FIXTURE);
    const keys = Array.from({ length: MAX_KEY_DEPTH + 1 }, (_, i) => `k${i}`);
    const result = applyOp(doc, { op: 'renameKey', path: 'defaults', keys, to: 'x' });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
  });

  it('authors a YAML-syntax rename target as a quoted scalar (no structural injection)', () => {
    // A hostile `to` carrying `: ` / quotes / a newline must land as ONE quoted
    // map key that round-trips to the exact string, never a second key or block.
    for (const to of ['a: b', 'has "quotes"', 'line1\nline2', '[flow]', '#comment']) {
      const doc = parseTemplate(FIXTURE);
      const result = applyOp(doc, { op: 'renameKey', path: 'styles', keys: ['heading'], to });
      expect(result.ok).toBe(true);
      const styles = parseTemplate(String(doc)).toJS().styles;
      expect(Object.keys(styles)).toContain(to);
    }
  });

  it('holds the serialized fixed point after a rename', () => {
    const out = apply(FIXTURE, { op: 'renameKey', path: 'styles', keys: ['heading'], to: 'title' });
    expect(String(parseTemplate(out))).toBe(out);
  });

  it('keeps a comment line and blank line above the renamed key', () => {
    // At the root level the `# comment` above an entry (and its preceding blank
    // line) attach to the KEY node itself — a wholesale key replacement that
    // does not carry them over silently deletes the author's comment.
    const source = ['name: x', '', '# document styles', 'styles:', '  h: { fontSize: 1 }', ''].join(
      '\n',
    );
    const out = apply(source, { op: 'renameKey', keys: ['styles'], to: 'renamed' });
    expect(out).toBe(source.replace('styles:', 'renamed:'));
  });

  it('keeps an anchored key working: the alias still serializes after the rename', () => {
    // Dropping the key's anchor would make the NEXT serialization throw
    // "Unresolved alias" — a crash reachable from a hostile-but-valid document.
    const source = ['&s heading: { fontSize: 1 }', 'ref: *s', ''].join('\n');
    const out = apply(source, { op: 'renameKey', keys: ['heading'], to: 'title' });
    expect(out).toContain('&s title:');
    expect(out).toContain('ref: *s');
  });
});

describe('putValue', () => {
  it('creates an empty map at a new key (the create-style form)', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'putValue', keys: ['styles', 'framed'], value: {} });
    expect(result.ok).toBe(true);
    expect(parseTemplate(String(doc)).toJS().styles.framed).toEqual({});
    expect(String(doc)).toContain('framed: {}');
  });

  it('sets a nested map, a scalar, and an array value', () => {
    const nested = apply(FIXTURE, {
      op: 'putValue',
      keys: ['styles', 'box'],
      value: { borderWidth: 1, borderColor: '#333333' },
    });
    expect(parseTemplate(nested).toJS().styles.box).toEqual({
      borderWidth: 1,
      borderColor: '#333333',
    });
    const scalar = apply(FIXTURE, {
      op: 'putValue',
      path: 'defaults',
      keys: ['currency'],
      value: 'USD',
    });
    expect(parseTemplate(scalar).toJS().defaults.currency).toBe('USD');
    const array = apply(FIXTURE, {
      op: 'putValue',
      path: ITEM0,
      keys: ['styleNames'],
      value: ['heading', 'framed'],
    });
    expect(parseTemplate(array).toJS().sections.body.items[0].styleNames).toEqual([
      'heading',
      'framed',
    ]);
  });

  it('replaces an existing value and auto-creates intermediate maps', () => {
    const replaced = apply(FIXTURE, {
      op: 'putValue',
      path: 'defaults',
      keys: ['locale'],
      value: 'en-US',
    });
    expect(parseTemplate(replaced).toJS().defaults.locale).toBe('en-US');
    const created = apply(FIXTURE, {
      op: 'putValue',
      keys: ['page', 'margin', 'top'],
      value: 10,
    });
    expect(parseTemplate(created).toJS().page.margin.top).toBe(10);
  });

  it('rejects a non-finite number in the value without mutating', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'putValue',
      keys: ['styles', 'x'],
      value: { infinite: Number.POSITIVE_INFINITY },
    });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects a value deeper than the snippet cap without mutating', () => {
    let value: SnippetValue = 'leaf';
    for (let i = 0; i <= MAX_SNIPPET_DEPTH; i++) {
      value = { nested: value };
    }
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'putValue', keys: ['styles', 'x'], value });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects a value over the snippet node budget without mutating', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'putValue',
      keys: ['styles', 'x'],
      value: Array.from({ length: MAX_SNIPPET_NODES + 1 }, () => 'x'),
    });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects a CYCLIC value without hanging (depth bound terminates it)', () => {
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'putValue',
      keys: ['styles', 'x'],
      value: cycle as SnippetValue,
    });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects a non-plain-object map (class instance) in the value', () => {
    class Sneaky {
      fontSize = 1;
    }
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, {
      op: 'putValue',
      keys: ['styles', 'x'],
      value: new Sneaky() as unknown as SnippetValue,
    });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
    expect(String(doc)).toBe(FIXTURE);
  });

  it('rejects an empty key path', () => {
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'putValue', keys: [], value: {} });
    expect(result.ok === false && result.error.code).toBe('invalid_value');
  });

  it('treats a __proto__ key in the value as inert data, never polluting prototypes', () => {
    const hostile = JSON.parse('{"__proto__": {"polluted": true}, "real": 1}');
    const doc = parseTemplate(FIXTURE);
    const result = applyOp(doc, { op: 'putValue', keys: ['styles', 'evil'], value: hostile });
    expect(result.ok).toBe(true);
    expect(Object.prototype).not.toHaveProperty('polluted');
    expect({} as { polluted?: boolean }).not.toHaveProperty('polluted');
    // The hostile key serializes as PLAIN DATA — a reparse shows it as an
    // ordinary quoted map key, not a dropped or prototype-bound entry.
    const out = String(doc);
    expect(out).toContain('__proto__');
    expect(out).toContain('real: 1');
    expect(String(parseTemplate(out))).toBe(out);
  });

  it('holds the serialized fixed point after a putValue', () => {
    const out = apply(FIXTURE, {
      op: 'putValue',
      keys: ['styles', 'framed'],
      value: { borderWidth: 1 },
    });
    expect(String(parseTemplate(out))).toBe(out);
  });
});
