// @vitest-environment node
//
// One fragment's marks as wire keys. Two things are load-bearing here and both
// are about what is NOT written: a mark that is off authors a REMOVAL rather
// than the engine's explicit `normal`/`none` keyword (minimal wire), and that
// removal is presence-guarded, because `removeKey` on an absent key fails and
// `applyAll` then discards the whole batch — including the reader's typing.

import type { Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { NO_MARKS, type RunMarks } from '../text/spanRuns';
import { inheritedKeys, markStyleOps, markStyleValue, markValues } from './spanWire';

const PATH = 'sections.body.items[0].spans[1]';
const ALL: RunMarks = { bold: true, italic: true, decoration: 'underline', color: '#c2402a' };

describe('markValues', () => {
  it('spells each set mark, and answers null for each unset one', () => {
    expect(markValues(ALL)).toEqual({
      fontWeight: 'bold',
      fontStyle: 'italic',
      textDecoration: 'underline',
      color: '#c2402a',
    });
    expect(markValues(NO_MARKS)).toEqual({
      fontWeight: null,
      fontStyle: null,
      textDecoration: null,
      color: null,
    });
  });
});

describe('markStyleValue', () => {
  it('omits the style map entirely when a fragment sets no mark', () => {
    expect(markStyleValue(NO_MARKS)).toBeUndefined();
  });

  it('carries only the keys that say something', () => {
    expect(markStyleValue({ ...NO_MARKS, bold: true })).toEqual({ fontWeight: 'bold' });
  });
});

describe('markStyleOps', () => {
  it('writes only the keys whose value CHANGED', () => {
    expect(markStyleOps(PATH, { fontWeight: 'bold' }, { ...NO_MARKS, bold: true })).toEqual([]);
  });

  it('sets a mark the fragment did not carry', () => {
    expect(markStyleOps(PATH, undefined, { ...NO_MARKS, italic: true })).toEqual([
      { op: 'setScalar', path: PATH, keys: ['style', 'fontStyle'], value: 'italic' },
    ]);
  });

  it('REMOVES a mark rather than authoring the engine keyword for "off"', () => {
    // `normal`/`none` are real wire values, but authoring one would leave a key
    // behind on every fragment a reader ever un-bolded.
    expect(markStyleOps(PATH, { fontWeight: 'bold' }, NO_MARKS)).toEqual([
      { op: 'removeKey', path: PATH, keys: ['style', 'fontWeight'] },
    ]);
  });

  it('does NOT remove a key the fragment never had', () => {
    // The guard the whole file exists for: an unguarded `removeKey` returns
    // `key_not_found` and `applyAll` discards the batch around it.
    expect(markStyleOps(PATH, {}, NO_MARKS)).toEqual([]);
    expect(markStyleOps(PATH, undefined, NO_MARKS)).toEqual([]);
  });

  it('treats a hostile style value as setting nothing, so no removal is proposed', () => {
    for (const hostile of [null, 'style', 42, ['fontWeight']]) {
      expect(markStyleOps(PATH, hostile, NO_MARKS)).toEqual([]);
    }
  });

  it('replaces a decoration rather than adding a second line', () => {
    expect(
      markStyleOps(
        PATH,
        { textDecoration: 'underline' },
        { ...NO_MARKS, decoration: 'line_through' },
      ),
    ).toEqual([
      { op: 'setScalar', path: PATH, keys: ['style', 'textDecoration'], value: 'line_through' },
    ]);
  });

  // `Op` is a union and only some arms carry `keys`, so the assertions below
  // read them through one narrowing rather than casting at each site.
  const keysOf = (ops: readonly Op[]): readonly string[] =>
    ops.flatMap((op) => ('keys' in op ? op.keys : []));

  it('writes every changed key in one pass', () => {
    expect(keysOf(markStyleOps(PATH, {}, ALL)).filter((key) => key !== 'style')).toEqual([
      'fontWeight',
      'fontStyle',
      'textDecoration',
      'color',
    ]);
  });

  it('never addresses a METRIC key', () => {
    // The WYSIWYG boundary again, this time on the WRITE side: a surface that
    // shows no metric must author none, or it would silently drop a fontSize
    // the panel set.
    const keys = keysOf(markStyleOps(PATH, { fontSize: '18pt', fontFamily: 'Serif' }, ALL));
    expect(keys).not.toContain('fontSize');
    expect(keys).not.toContain('fontFamily');
  });
});

describe('inheritedKeys', () => {
  it('carries the keys this surface does not edit onto a split-out fragment', () => {
    expect(
      inheritedKeys({ text: 'x', styleNames: ['strong'], link: { url: 'https://example.com' } }),
    ).toEqual({ styleNames: ['strong'], link: { url: 'https://example.com' } });
  });

  it('carries nothing from a fragment that sets neither', () => {
    expect(inheritedKeys({ text: 'x' })).toEqual({});
    expect(inheritedKeys(undefined)).toEqual({});
  });

  it('NARROWS rather than copying a hostile shape onto the new fragment', () => {
    // The engine would report a bad `styleNames` entry — but the report would
    // name a node the reader never authored, which is the worst kind.
    expect(inheritedKeys({ styleNames: ['ok', 42, null] })).toEqual({ styleNames: ['ok'] });
    expect(inheritedKeys({ styleNames: [42] })).toEqual({});
    expect(inheritedKeys({ styleNames: 'strong' })).toEqual({});
    expect(inheritedKeys({ link: { url: 42 } })).toEqual({});
    expect(inheritedKeys({ link: 'https://x' })).toEqual({});
  });

  it("copies the url only, never a link's other keys", () => {
    expect(inheritedKeys({ link: { url: 'https://x', extra: 'no' } })).toEqual({
      link: { url: 'https://x' },
    });
  });
});
