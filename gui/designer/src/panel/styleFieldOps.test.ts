import { describe, expect, it } from 'vitest';
import { createStyleWithFieldsOps, styleFieldOp, updateStyleFieldsOps } from './styleFieldOps';
import type { StyleFieldSpec } from './styleFieldSpecs';
import { MAX_STYLES } from './stylesModel';

/** A minimal spec for the kind-dispatch test (styleFieldOp reads only
 * `key`/`kind`), avoiding a `.find(...)!` non-null assertion. */
const spec = (key: string, kind: StyleFieldSpec['kind']): StyleFieldSpec => ({
  key,
  labelKey: `panel.field.${key}`,
  kind,
  options: [],
});

describe('createStyleWithFieldsOps', () => {
  it('authors the entry then a canonical op per NON-EMPTY field, one batch', () => {
    const plan = createStyleWithFieldsOps(
      'framed',
      { fontSize: '18', fontWeight: 'bold', color: '#cc0000', lineHeight: '' },
      ['heading'],
    );
    expect(plan).toEqual({
      ok: true,
      ops: [
        { op: 'putValue', keys: ['styles', 'framed'], value: {} },
        // A bare number stays a number (canonical), never a quoted string.
        { op: 'setScalar', keys: ['styles', 'framed', 'fontSize'], value: 18 },
        { op: 'setScalar', keys: ['styles', 'framed', 'fontWeight'], value: 'bold' },
        { op: 'setScalar', keys: ['styles', 'framed', 'color'], value: '#cc0000' },
      ],
    });
  });

  it('authors just the empty map when no field is set', () => {
    expect(createStyleWithFieldsOps('bare', {}, [])).toEqual({
      ok: true,
      ops: [{ op: 'putValue', keys: ['styles', 'bare'], value: {} }],
    });
  });

  it('omits a field whose value cannot be authored (non-finite number)', () => {
    const plan = createStyleWithFieldsOps('framed', { fontSize: '12', lineHeight: 'x' }, []);
    expect(plan.ok && plan.ops).toEqual([
      { op: 'putValue', keys: ['styles', 'framed'], value: {} },
      { op: 'setScalar', keys: ['styles', 'framed', 'fontSize'], value: 12 },
    ]);
  });

  it('refuses an empty, duplicate, or over-cap name', () => {
    expect(createStyleWithFieldsOps('', {}, [])).toEqual({ ok: false, reason: 'empty_name' });
    expect(createStyleWithFieldsOps('heading', {}, ['heading'])).toEqual({
      ok: false,
      reason: 'duplicate_name',
    });
    const full = Array.from({ length: MAX_STYLES }, (_, i) => `s${i}`);
    expect(createStyleWithFieldsOps('one-more', {}, full)).toEqual({
      ok: false,
      reason: 'too_many_styles',
    });
  });
});

describe('updateStyleFieldsOps', () => {
  it('emits an op ONLY for a field whose value changed — untouched keys stay put', () => {
    // fontSize changed, fontWeight unchanged (must emit nothing), color cleared.
    const plan = updateStyleFieldsOps(
      'heading',
      { fontSize: '20', fontWeight: 'bold', color: '' },
      { fontSize: '18', fontWeight: 'bold', color: '#cc0000' },
    );
    expect(plan.ok && plan.ops).toEqual([
      { op: 'setScalar', keys: ['styles', 'heading', 'fontSize'], value: 20 },
      { op: 'removeKey', keys: ['styles', 'heading', 'color'] },
    ]);
  });

  it('never references a non-STYLE_FIELDS prop, so it survives byte-intact', () => {
    // The current view holds only STYLE_FIELDS keys (a per-side border map lives
    // outside them and is never in `current`), so no op ever addresses it.
    const plan = updateStyleFieldsOps('framed', { fontSize: '10' }, { fontSize: '' });
    expect(plan.ok && plan.ops).toEqual([
      { op: 'setScalar', keys: ['styles', 'framed', 'fontSize'], value: 10 },
    ]);
    expect(JSON.stringify(plan.ok && plan.ops).includes('border')).toBe(false);
  });

  it('yields an empty, inert batch when nothing changed', () => {
    expect(updateStyleFieldsOps('h', { fontSize: '12' }, { fontSize: '12' })).toEqual({
      ok: true,
      ops: [],
    });
  });

  it('omits a changed field that cannot be authored (non-finite number)', () => {
    expect(updateStyleFieldsOps('h', { lineHeight: 'x' }, { lineHeight: '1.4' })).toEqual({
      ok: true,
      ops: [],
    });
  });
});

describe('styleFieldOp', () => {
  it('dispatches by field kind at styles.<name>.<prop>', () => {
    expect(styleFieldOp('h', spec('fontSize', 'length'), '18')).toMatchObject({
      op: 'setScalar',
      keys: ['styles', 'h', 'fontSize'],
      value: 18,
    });
    expect(styleFieldOp('h', spec('lineHeight', 'number'), 'x')).toBeNull();
    expect(styleFieldOp('h', spec('color', 'text'), '')).toMatchObject({ op: 'removeKey' });
  });
});
