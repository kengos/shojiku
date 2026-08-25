import { describe, expect, it } from 'vitest';
import { createFormatOps, updateFormatOps } from './fieldOps';
import { MAX_FORMATS } from './model';

describe('createFormatOps', () => {
  it('authors the whole entry as ONE putValue', () => {
    expect(createFormatOps('closing', 'date', 'yyyy.MM.dd', [])).toEqual({
      ok: true,
      ops: [
        {
          op: 'putValue',
          keys: ['formats', 'closing'],
          value: { type: 'date', pattern: 'yyyy.MM.dd' },
        },
      ],
    });
  });

  it('normalizes an unknown kind rather than authoring one the engine refuses', () => {
    const plan = createFormatOps('a', 'quarter', 'y', []);
    expect(plan.ok && plan.ops[0]).toMatchObject({ value: { type: 'date' } });
  });

  it('refuses an empty, duplicate or reserved name, and an over-cap registry', () => {
    expect(createFormatOps('', 'date', 'y', [])).toEqual({ ok: false, reason: 'empty_name' });
    expect(createFormatOps('a', 'date', 'y', ['a'])).toEqual({
      ok: false,
      reason: 'duplicate_name',
    });
    for (const name of ['default', 'symbol', 'name', 'value']) {
      expect(createFormatOps(name, 'date', 'y', [])).toEqual({
        ok: false,
        reason: 'ambiguous_name',
      });
    }
    expect(createFormatOps('image', 'date', 'y', [])).toEqual({
      ok: false,
      reason: 'reserved_name',
    });
    const full = Array.from({ length: MAX_FORMATS }, (_, n) => `f${n}`);
    expect(createFormatOps('a', 'date', 'y', full)).toEqual({
      ok: false,
      reason: 'too_many_formats',
    });
  });

  it('AUTHORS NOTHING on an empty pattern', () => {
    // `NamedFormat.pattern` is a required wire field: writing the entry without
    // one produces a template the engine cannot parse, and no gate would say
    // so — the op succeeds and the YAML stays valid.
    expect(createFormatOps('a', 'date', '', [])).toEqual({ ok: false, reason: 'empty_pattern' });
  });
});

describe('updateFormatOps', () => {
  const current = { kind: 'date', pattern: 'yyyy' };

  it('writes only the CHANGED keys, each as its own setScalar', () => {
    expect(updateFormatOps('a', 'datetime', 'yyyy HH:mm', current)).toEqual({
      ok: true,
      ops: [
        { op: 'setScalar', keys: ['formats', 'a', 'type'], value: 'datetime' },
        { op: 'setScalar', keys: ['formats', 'a', 'pattern'], value: 'yyyy HH:mm' },
      ],
    });
    expect(updateFormatOps('a', 'date', 'y', current)).toEqual({
      ok: true,
      ops: [{ op: 'setScalar', keys: ['formats', 'a', 'pattern'], value: 'y' }],
    });
    expect(updateFormatOps('a', 'datetime', 'yyyy', current)).toEqual({
      ok: true,
      ops: [{ op: 'setScalar', keys: ['formats', 'a', 'type'], value: 'datetime' }],
    });
  });

  it('produces an EMPTY batch when nothing changed — no blank undo step', () => {
    expect(updateFormatOps('a', 'date', 'yyyy', current)).toEqual({ ok: true, ops: [] });
  });

  it('AUTHORS NOTHING on an empty pattern', () => {
    expect(updateFormatOps('a', 'date', '', current)).toEqual({
      ok: false,
      reason: 'empty_pattern',
    });
  });

  it('normalizes an unknown current kind so a no-op edit stays a no-op', () => {
    // An entry the engine could not parse seeds the control to `date`; saving
    // without touching it must WRITE that repair rather than compare against
    // the unparseable spelling.
    expect(updateFormatOps('a', 'date', 'y', { kind: 'quarter', pattern: 'y' })).toEqual({
      ok: true,
      ops: [{ op: 'setScalar', keys: ['formats', 'a', 'type'], value: 'date' }],
    });
  });
});
