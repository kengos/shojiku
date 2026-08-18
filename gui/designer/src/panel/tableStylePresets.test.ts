import { describe, expect, it } from 'vitest';
import { readTableStyle } from './tableStyleModel';
import { matchPreset, presetById, presetOps, TABLE_PRESETS } from './tableStylePresets';

const TABLE = 'sections.body.items[0]';

const view = (node: unknown) => readTableStyle(node);

describe('presetById', () => {
  it('finds each shipped preset', () => {
    for (const preset of TABLE_PRESETS) {
      expect(presetById(preset.id)?.id).toBe(preset.id);
    }
  });

  it('answers a prototype name with nothing, never an inherited function', () => {
    // A `Record<string, Preset>` index would return `Object.prototype`'s member
    // here, and a truthy value defeats a `?? fallback`. The lookup is a `Map`.
    for (const hostile of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(presetById(hostile)).toBeNull();
    }
  });
});

describe('matchPreset', () => {
  it('matches the plain preset on a table that authors none of the owned keys', () => {
    expect(matchPreset(view({ type: 'table' }), '')).toBe('plain');
  });

  it('matches a preset whose owned keys are all present', () => {
    const node = {
      type: 'table',
      header: { style: { backgroundColor: '#374151', color: '#ffffff', fontWeight: 'bold' } },
    };
    expect(matchPreset(view(node), '')).toBe('darkHeader');
  });

  it('matches nothing once a hand edit moves one owned key off every preset', () => {
    const node = { type: 'table', header: { style: { backgroundColor: '#123456' } } };
    expect(matchPreset(view(node), '')).toBeNull();
  });

  it('reads the grid width as one of the owned keys', () => {
    const striped = { type: 'table', row: { alternateStyle: { backgroundColor: '#f6f8fa' } } };
    expect(matchPreset(view(striped), '')).toBe('striped');
    // The same bands with the grid switched off are a DIFFERENT preset.
    expect(matchPreset(view(striped), '0')).toBe('borderless');
  });
});

describe('presetOps', () => {
  it('authors the keys a preset declares', () => {
    const ops = presetOps(TABLE, view({ type: 'table' }), '', 'darkHeader');
    expect(ops).toEqual([
      {
        op: 'setScalar',
        path: TABLE,
        keys: ['header', 'style', 'backgroundColor'],
        value: '#374151',
      },
      { op: 'setScalar', path: TABLE, keys: ['header', 'style', 'color'], value: '#ffffff' },
      { op: 'setScalar', path: TABLE, keys: ['header', 'style', 'fontWeight'], value: 'bold' },
    ]);
  });

  it('removes the owned keys the new preset does not declare', () => {
    // Switching away from a preset must not leave its fill behind — that is the
    // whole reason the gallery owns a fixed key set.
    const dark = {
      type: 'table',
      header: { style: { backgroundColor: '#374151', color: '#ffffff', fontWeight: 'bold' } },
    };
    const ops = presetOps(TABLE, view(dark), '', 'striped');
    expect(ops).toEqual([
      { op: 'removeKey', path: TABLE, keys: ['header', 'style', 'backgroundColor'] },
      { op: 'removeKey', path: TABLE, keys: ['header', 'style', 'color'] },
      { op: 'removeKey', path: TABLE, keys: ['header', 'style', 'fontWeight'] },
      {
        op: 'setScalar',
        path: TABLE,
        keys: ['row', 'alternateStyle', 'backgroundColor'],
        value: '#f6f8fa',
      },
    ]);
  });

  it('leaves keys OUTSIDE the owned set alone', () => {
    // An alignment and a body-row colour the user set by hand are not the
    // gallery's to revoke; picking a preset must not silently undo them.
    const tuned = {
      type: 'table',
      header: { style: { textAlign: 'center' } },
      row: { style: { color: '#333333' } },
    };
    const ops = presetOps(TABLE, view(tuned), '', 'striped');
    const touched = ops.map((op) => ('keys' in op ? op.keys?.join('.') : ''));
    expect(touched).toEqual(['row.alternateStyle.backgroundColor']);
  });

  it('REVOKES a grid width the border editor set — the gallery owns that key', () => {
    // Deliberate, and the one owned key another control in the SAME decoration
    // tab also writes (`panel/borderOps` authors `style.borderWidth` for a
    // table's grid). Excel's table styles reset borders the same way, and it is
    // one undo — but nothing else states it, so this test is where the intent
    // lives. If the decision ever changes, this is the test that says so.
    const tuned = { type: 'table', style: { borderWidth: 2 } };
    const ops = presetOps(TABLE, view(tuned), '2', 'darkHeader');
    expect(ops).toContainEqual({ op: 'removeKey', path: TABLE, keys: ['style', 'borderWidth'] });
  });

  it('reads a PER-SIDE grid width as hand-tuned, never as unset', () => {
    // A per-side map is what the border editor authors when the sides differ.
    // Reporting it as `''` would mark `plain` active on a table carrying an
    // outer frame; the section passes a sentinel no preset declares.
    expect(matchPreset(view({ type: 'table' }), 'custom')).toBeNull();
  });

  it('authors nothing when the table already matches the preset', () => {
    const striped = { type: 'table', row: { alternateStyle: { backgroundColor: '#f6f8fa' } } };
    expect(presetOps(TABLE, view(striped), '', 'striped')).toEqual([]);
    expect(presetOps(TABLE, view({ type: 'table' }), '', 'plain')).toEqual([]);
  });

  it('authors nothing for an unknown or prototype-named id', () => {
    expect(presetOps(TABLE, view({ type: 'table' }), '', 'constructor')).toEqual([]);
    expect(presetOps(TABLE, view({ type: 'table' }), '', 'nope')).toEqual([]);
  });

  it('authors the grid width as a NUMBER, which is what the wire takes', () => {
    const ops = presetOps(TABLE, view({ type: 'table' }), '', 'borderless');
    expect(ops).toContainEqual({
      op: 'setScalar',
      path: TABLE,
      keys: ['style', 'borderWidth'],
      value: 0,
    });
  });
});
