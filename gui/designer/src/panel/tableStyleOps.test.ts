import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  bandStyleOp,
  clearIneffectiveFillOp,
  DEFAULT_ZEBRA_FILL,
  zebraToggleOp,
} from './tableStyleOps';

const TABLE = 'sections.body.items[0]';

describe('bandStyleOp', () => {
  it('authors a header property at header.style, touching nothing else', () => {
    expect(bandStyleOp(TABLE, 'header', 'backgroundColor', '#dbe7ff')).toEqual({
      op: 'setScalar',
      path: TABLE,
      keys: ['header', 'style', 'backgroundColor'],
      value: '#dbe7ff',
    });
  });

  it('authors a body-row property at row.style', () => {
    expect(bandStyleOp(TABLE, 'row', 'textAlign', 'center')).toEqual({
      op: 'setScalar',
      path: TABLE,
      keys: ['row', 'style', 'textAlign'],
      value: 'center',
    });
  });

  it('removes the key when the value is cleared, so the emptied maps prune', () => {
    // The op layer prunes a map its removal emptied, which is what returns a
    // table whose last band property was cleared to the shape it had before the
    // section was ever opened.
    expect(bandStyleOp(TABLE, 'header', 'fontWeight', '')).toEqual({
      op: 'removeKey',
      path: TABLE,
      keys: ['header', 'style', 'fontWeight'],
    });
  });

  it('addresses the zebra overlay at alternateStyle, not at row.style', () => {
    expect(bandStyleOp(TABLE, 'zebra', 'backgroundColor', '#f6f8fa')).toEqual({
      op: 'setScalar',
      path: TABLE,
      keys: ['row', 'alternateStyle', 'backgroundColor'],
      value: '#f6f8fa',
    });
  });
});

describe('zebraToggleOp', () => {
  it('seeds the default stripe when the band carries no fill', () => {
    expect(zebraToggleOp(TABLE, '')).toEqual({
      op: 'setScalar',
      path: TABLE,
      keys: ['row', 'alternateStyle', 'backgroundColor'],
      value: DEFAULT_ZEBRA_FILL,
    });
  });

  it('removes ONLY the backgroundColor when the band carries one', () => {
    // Not the whole `alternateStyle` map: a sibling this panel does not edit —
    // `alternateStyleNames`, or a text property an external author put there —
    // must survive, and the op layer prunes the map if nothing else is in it.
    expect(zebraToggleOp(TABLE, '#f6f8fa')).toEqual({
      op: 'removeKey',
      path: TABLE,
      keys: ['row', 'alternateStyle', 'backgroundColor'],
    });
  });

  it('never overwrites a colour the user chose — seeding is reachable only from empty', () => {
    // The Phase-A requirement was "switching zebra ON must not discard an
    // existing colour", written when the builder took a boolean. Taking the
    // CURRENT value instead makes that structural rather than guarded: there is
    // no input that both carries a colour and seeds the default.
    expect(zebraToggleOp(TABLE, '#eeddcc')).toEqual({
      op: 'removeKey',
      path: TABLE,
      keys: ['row', 'alternateStyle', 'backgroundColor'],
    });
    expect(zebraToggleOp(TABLE, '')).toMatchObject({ value: DEFAULT_ZEBRA_FILL });
  });

  it('round-trips over a REAL document: on then off is byte-identical', () => {
    // The op shapes alone would not prove this — it holds only because
    // `removeKey` prunes the maps its removal emptied, so `row:` and
    // `alternateStyle:` disappear again rather than being left behind empty.
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: table',
      '        data: { key: rows }',
      '        columns:',
      '          - { label: 品名, data: { key: name } }',
      '',
    ].join('\n');
    const session = Editor.create(source);
    const before = session.text();
    expect(session.apply(zebraToggleOp(TABLE, '')).ok).toBe(true);
    expect(session.text()).toContain('alternateStyle');
    expect(session.apply(zebraToggleOp(TABLE, DEFAULT_ZEBRA_FILL)).ok).toBe(true);
    expect(session.text()).toBe(before);
  });

  it('round-trips a band property the same way, leaving no empty header map', () => {
    const source = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: table',
      '        data: { key: rows }',
      '        columns:',
      '          - { label: 品名, data: { key: name } }',
      '',
    ].join('\n');
    const session = Editor.create(source);
    const before = session.text();
    expect(session.apply(bandStyleOp(TABLE, 'header', 'fontWeight', 'bold')).ok).toBe(true);
    expect(session.text()).toContain('fontWeight: bold');
    expect(session.apply(bandStyleOp(TABLE, 'header', 'fontWeight', '')).ok).toBe(true);
    expect(session.text()).toBe(before);
  });
});

describe('what a clear leaves BEHIND (proven over a real document)', () => {
  // The op-literal assertions above cannot see this: they show which key the op
  // names, not what survives in the file. These fixtures CARRY the sibling each
  // requirement is about.
  const doc = (tableTail: readonly string[]) =>
    Editor.create(
      [
        'sections:',
        '  body:',
        '    type: flow',
        '    items:',
        '      - type: table',
        '        data: { key: rows }',
        '        columns:',
        '          - { label: 品名, data: { key: name } }',
        ...tableTail,
        '',
      ].join('\n'),
    );

  it('leaves alternateStyleNames standing when the zebra fill is removed', () => {
    const session = doc([
      '        row:',
      '          alternateStyleNames: [ stripe ]',
      '          alternateStyle:',
      '            backgroundColor: "#f6f8fa"',
    ]);
    expect(session.apply(zebraToggleOp(TABLE, '#f6f8fa')).ok).toBe(true);
    expect(session.text()).toContain('alternateStyleNames: [ stripe ]');
    expect(session.text()).not.toContain('backgroundColor');
    // The emptied map is pruned, the sibling key is not.
    expect(session.text()).not.toContain('alternateStyle:\n');
  });

  it('leaves the grid stroke standing when the ineffective table fill is removed', () => {
    const session = doc([
      '        style:',
      '          borderWidth: 2',
      '          backgroundColor: "#00ff00"',
    ]);
    expect(session.apply(clearIneffectiveFillOp(TABLE)).ok).toBe(true);
    expect(session.text()).toContain('borderWidth: 2');
    expect(session.text()).not.toContain('#00ff00');
  });
});

describe('clearIneffectiveFillOp', () => {
  it('removes only the table’s own backgroundColor, leaving the grid stroke', () => {
    expect(clearIneffectiveFillOp(TABLE)).toEqual({
      op: 'removeKey',
      path: TABLE,
      keys: ['style', 'backgroundColor'],
    });
  });
});
