import { Editor, MAX_BATCH_OPS } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { cascadeContext } from '../toolbar/cascade';
import { effectiveValueIn } from '../toolbar/effective';
import {
  capturableStyleProps,
  captureStyleOps,
  updateStyleOps,
  updateTargetName,
} from './captureModel';

const PATH = 'sections.body.items[0]';

describe('capturableStyleProps', () => {
  it('picks exactly the STYLE_FIELDS string/number scalars', () => {
    const captured = capturableStyleProps({
      type: 'text',
      style: { fontWeight: 'bold', fontSize: 20, color: '#123456' },
    });
    expect(captured).toEqual({ fontWeight: 'bold', fontSize: 20, color: '#123456' });
  });

  it('excludes non-scalar style values (map/array/bool/null)', () => {
    const captured = capturableStyleProps({
      style: {
        fontWeight: 'bold',
        borderWidth: { top: 2 },
        fontFamily: ['a', 'b'],
        fontStyle: true,
        color: null,
      },
    });
    // Only the scalar `fontWeight` survives; the map/array/bool/null are dropped.
    expect(captured).toEqual({ fontWeight: 'bold' });
  });

  it('excludes unknown style keys (not in STYLE_FIELDS)', () => {
    const captured = capturableStyleProps({ style: { fontSize: 12, nonsense: 'x' } });
    expect(captured).toEqual({ fontSize: 12 });
  });

  it('yields {} for an absent or hostile (non-map) item / style', () => {
    expect(capturableStyleProps(undefined)).toEqual({});
    expect(capturableStyleProps('nope')).toEqual({});
    expect(capturableStyleProps([])).toEqual({});
    expect(capturableStyleProps({ type: 'text' })).toEqual({});
    expect(capturableStyleProps({ style: 'not-a-map' })).toEqual({});
  });
});

describe('captureStyleOps', () => {
  it('plans putValue → setStrings → removeKey-per-prop, in that order', () => {
    const plan = captureStyleOps(PATH, 'title', { fontWeight: 'bold', fontSize: 20 }, [], []);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ops[0]).toEqual({
      op: 'putValue',
      keys: ['styles', 'title'],
      value: { fontWeight: 'bold', fontSize: 20 },
    });
    expect(plan.ops[1]).toEqual({
      op: 'setStrings',
      path: PATH,
      keys: ['styleNames'],
      values: ['title'],
    });
    expect(plan.ops.slice(2)).toEqual([
      { op: 'removeKey', path: PATH, keys: ['style', 'fontWeight'] },
      { op: 'removeKey', path: PATH, keys: ['style', 'fontSize'] },
    ]);
  });

  it('preserves the authored value form (a numeric fontSize stays a number)', () => {
    const plan = captureStyleOps(PATH, 'title', { fontSize: 12 }, [], []);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const put = plan.ops[0];
    expect(put.op === 'putValue' && typeof (put.value as { fontSize: unknown }).fontSize).toBe(
      'number',
    );
  });

  it('refuses an empty name', () => {
    expect(captureStyleOps(PATH, '', { fontSize: 12 }, [], [])).toEqual({
      ok: false,
      reason: 'empty_name',
    });
  });

  it('refuses a duplicate name', () => {
    expect(captureStyleOps(PATH, 'dup', { fontSize: 12 }, ['dup'], [])).toEqual({
      ok: false,
      reason: 'duplicate_name',
    });
  });

  it('refuses past the registry cap', () => {
    const full = Array.from({ length: 256 }, (_, i) => `s${i}`);
    expect(captureStyleOps(PATH, 'one-more', { fontSize: 12 }, full, [])).toEqual({
      ok: false,
      reason: 'too_many_styles',
    });
  });

  it('refuses when there is nothing to capture', () => {
    expect(captureStyleOps(PATH, 'title', {}, [], [])).toEqual({
      ok: false,
      reason: 'nothing_captured',
    });
  });

  it('appends the new name after the existing styleNames', () => {
    const plan = captureStyleOps(PATH, 'title', { fontSize: 12 }, [], ['base', 'accent']);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ops[1]).toEqual({
      op: 'setStrings',
      path: PATH,
      keys: ['styleNames'],
      values: ['base', 'accent', 'title'],
    });
  });

  it('dedupes a dangling reference equal to the new name (single occurrence)', () => {
    const plan = captureStyleOps(PATH, 'title', { fontSize: 12 }, [], ['title']);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ops[1]).toMatchObject({ values: ['title'] });
  });

  it('moves an existing dangling occurrence of the new name to the END (look preserved)', () => {
    // styleNames [title (dangling), base (real)] + capture named "title": the
    // definition being created must win the later-wins cascade, so the name is
    // MOVED last — ['title', 'base'] would let base override the captured props.
    const plan = captureStyleOps(
      PATH,
      'title',
      { fontWeight: 'bold' },
      ['base'],
      ['title', 'base'],
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ops[1]).toMatchObject({ values: ['base', 'title'] });
  });

  it('addresses a hostile name by a literal keys array, safe by construction', () => {
    const plan = captureStyleOps(PATH, '__proto__', { fontSize: 12 }, [], []);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ops[0]).toEqual({
      op: 'putValue',
      keys: ['styles', '__proto__'],
      value: { fontSize: 12 },
    });
  });

  it('treats a prototype-named registry entry as an ordinary duplicate', () => {
    // `existingNames.includes` is an array scan, never a prototype-walking
    // object lookup — `toString` collides only when actually registered.
    expect(captureStyleOps(PATH, 'toString', { fontSize: 12 }, ['toString'], [])).toEqual({
      ok: false,
      reason: 'duplicate_name',
    });
    const plan = captureStyleOps(PATH, 'toString', { fontSize: 12 }, [], []);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ops[0]).toEqual({
      op: 'putValue',
      keys: ['styles', 'toString'],
      value: { fontSize: 12 },
    });
  });

  it('stays within the batch cap when every style field is captured', () => {
    const captured = {
      fontSize: 12,
      fontFamily: 'a',
      fontWeight: 'bold',
      fontStyle: 'italic',
      textAlign: 'left',
      lineHeight: 1.5,
      color: '#000000',
      backgroundColor: '#ffffff',
    };
    const plan = captureStyleOps(PATH, 'everything', captured, [], []);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    // 1 putValue + 1 setStrings + 8 removeKey = 10 ops.
    expect(plan.ops).toHaveLength(10);
    expect(plan.ops.length).toBeLessThanOrEqual(MAX_BATCH_OPS);
  });
});

describe('updateStyleOps', () => {
  it('plans per-prop setScalar + inline removeKey — never a whole-map putValue', () => {
    const plan = updateStyleOps(PATH, 'base', { color: '#222222', fontSize: 14 });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.ops.some((op) => op.op === 'putValue')).toBe(false);
    expect(plan.ops).toEqual([
      { op: 'setScalar', keys: ['styles', 'base', 'color'], value: '#222222' },
      { op: 'setScalar', keys: ['styles', 'base', 'fontSize'], value: 14 },
      { op: 'removeKey', path: PATH, keys: ['style', 'color'] },
      { op: 'removeKey', path: PATH, keys: ['style', 'fontSize'] },
    ]);
  });

  it('refuses when there is nothing to capture', () => {
    expect(updateStyleOps(PATH, 'base', {})).toEqual({ ok: false, reason: 'nothing_captured' });
  });

  it('addresses a hostile target name by a literal keys array', () => {
    for (const name of ['constructor', 'toString'] as const) {
      const plan = updateStyleOps(PATH, name, { color: '#000000' });
      expect(plan.ok).toBe(true);
      if (!plan.ok) return;
      expect(plan.ops[0]).toEqual({
        op: 'setScalar',
        keys: ['styles', name, 'color'],
        value: '#000000',
      });
    }
  });
});

describe('updateTargetName', () => {
  it('returns the last styleName that exists in the registry (later wins)', () => {
    expect(updateTargetName(['base', 'accent'], ['base', 'accent'])).toBe('accent');
  });

  it('skips dangling names not in the registry', () => {
    expect(updateTargetName(['base', 'ghost'], ['base'])).toBe('base');
  });

  it('returns null when every name is dangling', () => {
    expect(updateTargetName(['ghost', 'phantom'], ['base'])).toBeNull();
  });

  it('returns null for an empty styleNames list', () => {
    expect(updateTargetName([], ['base'])).toBeNull();
  });

  it('is safe for a prototype-named registry entry', () => {
    expect(updateTargetName(['constructor'], ['constructor'])).toBe('constructor');
    expect(updateTargetName(['toString'], ['toString'])).toBe('toString');
    expect(updateTargetName(['toString'], [])).toBeNull();
  });
});

// --- Integration over the real Editor (the ops applied transactionally) ---

const SRC = `styles:
  base: { color: "#111111" }
sections:
  body:
    type: flow
    items:
      # keep this comment
      - { type: text, text: hi, style: { fontWeight: bold, fontSize: 20 }, styleNames: [base] }
`;

function read(ed: Editor): (path: string) => unknown {
  return (path) => ed.read(path);
}

describe('captureModel — Editor integration', () => {
  it('applies a capture as ONE undo step (byte-exact restore)', () => {
    const ed = Editor.create(SRC);
    const before = ed.text();
    const captured = capturableStyleProps(ed.read(PATH));
    const plan = captureStyleOps(PATH, 'title', captured, ['base'], ['base']);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    ed.applyAll(plan.ops);
    expect(ed.text()).toContain('title:');
    ed.undo();
    expect(ed.text()).toBe(before);
  });

  it('touches only its keys: strips the inline style, keeps siblings + comment', () => {
    const ed = Editor.create(SRC);
    const captured = capturableStyleProps(ed.read(PATH));
    const plan = captureStyleOps(PATH, 'title', captured, ['base'], ['base']);
    if (!plan.ok) return;
    ed.applyAll(plan.ops);
    const text = ed.text();
    // The inline style map is emptied and pruned (no fontWeight left inline).
    const item = ed.read(PATH) as Record<string, unknown>;
    expect(item.style).toBeUndefined();
    // Untouched siblings survive byte-intact.
    expect(text).toContain('keep this comment');
    expect(text).toContain('color: "#111111"');
    expect(text).toContain('text: hi');
  });

  it('preserves the selection’s effective look after the capture', () => {
    const ed = Editor.create(SRC);
    const captured = capturableStyleProps(ed.read(PATH));
    const keys = Object.keys(captured);
    const beforeEff = keys.map((k) => effectiveValueIn(cascadeContext(read(ed), PATH), k).value);
    const plan = captureStyleOps(PATH, 'title', captured, ['base'], ['base']);
    if (!plan.ok) return;
    ed.applyAll(plan.ops);
    const afterEff = keys.map((k) => effectiveValueIn(cascadeContext(read(ed), PATH), k).value);
    expect(afterEff).toEqual(beforeEff);
    // Captured in STYLE_FIELDS order (fontSize before fontWeight).
    expect(afterEff).toEqual(['20', 'bold']);
  });

  it('update propagates the drifted prop to another user of the style', () => {
    const src = `styles:
  base: { color: "#111111" }
sections:
  body:
    type: flow
    items:
      - { type: text, text: a, style: { color: "#222222" }, styleNames: [base] }
      - { type: text, text: b, styleNames: [base] }
`;
    const ed = Editor.create(src);
    const captured = capturableStyleProps(ed.read('sections.body.items[0]'));
    const plan = updateStyleOps('sections.body.items[0]', 'base', captured);
    if (!plan.ok) return;
    ed.applyAll(plan.ops);
    // The second item (unchanged inline) now renders the pushed color.
    const eff = effectiveValueIn(cascadeContext(read(ed), 'sections.body.items[1]'), 'color');
    expect(eff.value).toBe('#222222');
  });

  it('update leaves a registry entry’s non-STYLE_FIELDS props byte-intact', () => {
    const src = `styles:
  base: { color: "#111111", borderWidth: { top: 2, bottom: 4 } }
sections:
  body:
    type: flow
    items:
      - { type: text, text: a, style: { color: "#222222" }, styleNames: [base] }
`;
    const ed = Editor.create(src);
    const captured = capturableStyleProps(ed.read('sections.body.items[0]'));
    const plan = updateStyleOps('sections.body.items[0]', 'base', captured);
    if (!plan.ok) return;
    ed.applyAll(plan.ops);
    const text = ed.text();
    // The per-side border map (not a STYLE_FIELDS prop) survives the update.
    expect(text).toContain('borderWidth: { top: 2, bottom: 4 }');
    // And the color was rewritten.
    expect((ed.read('styles.base') as Record<string, unknown>).color).toBe('#222222');
  });

  it('does not pollute Object.prototype from a __proto__ style name', () => {
    const ed = Editor.create(SRC);
    const captured = capturableStyleProps(ed.read(PATH));
    const plan = captureStyleOps(PATH, '__proto__', captured, [], []);
    if (!plan.ok) return;
    ed.applyAll(plan.ops);
    // The name is stored as inert document data, never a prototype write.
    expect(({} as Record<string, unknown>).fontWeight).toBeUndefined();
    expect(ed.text()).toContain('__proto__');
  });
});
