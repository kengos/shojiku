import { Editor } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import {
  addRuleOp,
  removeRuleOp,
  repointRuleOps,
  setRuleEqualsOp,
  setRuleKeyOp,
  setRuleStyleOp,
} from './rowConditionOps';
import { readRawEntries } from './rowConditionsModel';

const TABLE = 'sections.body.items[0]';

describe('op builders', () => {
  const ONE = [{ when: { key: 'a' } }];

  it('seeds the list for the FIRST rule (nothing exists to index into)', () => {
    expect(addRuleOp(TABLE, [])).toEqual({
      op: 'putValue',
      path: TABLE,
      keys: ['row', 'conditionalStyles'],
      value: [{ when: { key: '' } }],
    });
  });

  it('splices a later rule into the existing list', () => {
    expect(addRuleOp(TABLE, ONE)).toEqual({
      op: 'insertItem',
      path: `${TABLE}.row.conditionalStyles`,
      index: 1,
      value: { when: { key: '' } },
    });
  });

  it('removes one rule of several by index', () => {
    expect(removeRuleOp(TABLE, [{}, {}, {}], 1)).toEqual({
      op: 'removeItem',
      path: `${TABLE}.row.conditionalStyles`,
      index: 1,
    });
  });

  it('drops the whole key when the LAST rule goes, leaving no empty list', () => {
    expect(removeRuleOp(TABLE, ONE, 0)).toEqual({
      op: 'removeKey',
      path: TABLE,
      keys: ['row', 'conditionalStyles'],
    });
  });

  it('repoints a rule through its own entry path', () => {
    expect(setRuleKeyOp(TABLE, ONE, 0, 'b')).toEqual({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'key'],
      value: 'b',
    });
  });

  it('sets equals, and REMOVES it to make the rule the boolean form', () => {
    expect(setRuleEqualsOp(TABLE, ONE, 0, 'heading')).toEqual({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
      value: 'heading',
    });
    const removal = {
      op: 'removeKey',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['when', 'equals'],
    };
    expect(setRuleEqualsOp(TABLE, ONE, 0, null)).toEqual(removal);
    expect(setRuleEqualsOp(TABLE, ONE, 0, '')).toEqual(removal);
  });

  it('authors a NUMBER literal for a numeric field so the strict predicate matches', () => {
    // The engine compares type-strictly: a quoted "2" never equals 2, and
    // the user typed digits into a number field, not a string.
    for (const type of ['number', 'currency', 'percentage', 'quantity']) {
      expect(setRuleEqualsOp(TABLE, ONE, 0, '2', type)).toEqual({
        op: 'setScalar',
        path: `${TABLE}.row.conditionalStyles[0]`,
        keys: ['when', 'equals'],
        value: 2,
      });
    }
  });

  it('keeps the text verbatim for a non-numeric field', () => {
    expect(setRuleEqualsOp(TABLE, ONE, 0, '2', 'string')).toMatchObject({ value: '2' });
    expect(setRuleEqualsOp(TABLE, ONE, 0, 'heading', 'string')).toMatchObject({
      value: 'heading',
    });
    // No type known (an undeclared key) also stays a string.
    expect(setRuleEqualsOp(TABLE, ONE, 0, '2')).toMatchObject({ value: '2' });
  });

  it('leaves an unparseable numeric entry as text rather than authoring NaN', () => {
    for (const raw of ['abc', '1,2', 'Infinity', ' ']) {
      expect(setRuleEqualsOp(TABLE, ONE, 0, raw, 'number')).toMatchObject({ value: raw });
    }
  });

  it('parses a decimal and a negative for a numeric field', () => {
    expect(setRuleEqualsOp(TABLE, ONE, 0, '2.5', 'number')).toMatchObject({ value: 2.5 });
    expect(setRuleEqualsOp(TABLE, ONE, 0, ' -3 ', 'number')).toMatchObject({ value: -3 });
  });

  it('sets and clears one style property', () => {
    expect(setRuleStyleOp(TABLE, ONE, 0, 'textAlign', 'center')).toEqual({
      op: 'setScalar',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'textAlign'],
      value: 'center',
    });
    expect(setRuleStyleOp(TABLE, ONE, 0, 'textAlign', null)).toEqual({
      op: 'removeKey',
      path: `${TABLE}.row.conditionalStyles[0]`,
      keys: ['style', 'textAlign'],
    });
  });

  it('repointing composes a batch: key alone, or key + equals removal for boolean', () => {
    const withEquals = [{ when: { key: 'kind', equals: 'heading' } }];
    // Non-boolean target, equals present → key only (the value control
    // stays rendered, so the equals remains visible and editable).
    expect(repointRuleOps(TABLE, withEquals, 0, 'note', 'string', [], true, 'heading')).toEqual([
      {
        op: 'setScalar',
        path: `${TABLE}.row.conditionalStyles[0]`,
        keys: ['when', 'key'],
        value: 'note',
      },
    ]);
    // Boolean target, equals present → key + equals removal in ONE batch.
    expect(repointRuleOps(TABLE, withEquals, 0, 'flagged', 'boolean', [], true, 'heading')).toEqual(
      [
        {
          op: 'setScalar',
          path: `${TABLE}.row.conditionalStyles[0]`,
          keys: ['when', 'key'],
          value: 'flagged',
        },
        { op: 'removeKey', path: `${TABLE}.row.conditionalStyles[0]`, keys: ['when', 'equals'] },
      ],
    );
    // Boolean target but no equals → key only.
    expect(repointRuleOps(TABLE, ONE, 0, 'flagged', 'boolean', [], false, '')).toHaveLength(1);
    // A boolean field with a declared enum keeps its enum FORM, so an equals
    // the new enum LISTS survives the repoint — the select can still show it.
    expect(
      repointRuleOps(TABLE, withEquals, 0, 'flagged', 'boolean', ['true'], true, 'true'),
    ).toHaveLength(1);
    // …but one it does not list is cleared: the select would fall back to
    // "unset" while the wire still carried the old value.
    expect(
      repointRuleOps(TABLE, withEquals, 0, 'flagged', 'boolean', ['true'], true, 'heading'),
    ).toHaveLength(2);
    // Out of range → empty batch.
    expect(repointRuleOps(TABLE, ONE, 9, 'b', 'string', [], false, '')).toEqual([]);
  });

  it('refuses an out-of-range index instead of writing', () => {
    expect(removeRuleOp(TABLE, ONE, 5)).toBeNull();
    expect(removeRuleOp(TABLE, ONE, -1)).toBeNull();
    expect(setRuleKeyOp(TABLE, ONE, 5, 'b')).toBeNull();
    expect(setRuleEqualsOp(TABLE, ONE, -1, 'x')).toBeNull();
    expect(setRuleStyleOp(TABLE, ONE, 9, 'textAlign', 'center')).toBeNull();
  });
});

/** A real document, so the ops are exercised against the CST writer rather
 * than a stub: an edit must land as one undoable step and must leave the
 * rules around it byte-exact. Written at the serializer's fixed point (flow
 * collections keep their inner spacing `[ x ]`), so an undo can be compared
 * to it byte-for-byte. */
const SOURCE = [
  'sections:',
  '  body:',
  '    type: flow',
  '    items:',
  '      - type: table',
  '        data: { key: rows }',
  '        cellPadding: 4',
  '        row:',
  '          minHeight: 20',
  '          conditionalStyles:',
  '            - when: { key: kind, equals: heading }',
  '              styleNames: [ banner ]',
  '              style: { textAlign: center }',
  '            - when: { key: other, equals: end }',
  '              style: { textAlign: right }',
  '        columns:',
  '          - data: { key: label }',
  '',
].join('\n');

describe('over a real document', () => {
  function edited(op: ReturnType<typeof setRuleKeyOp>) {
    const ed = Editor.create(SOURCE);
    expect(op).not.toBeNull();
    if (op === null) {
      throw new Error('expected an op');
    }
    expect(ed.apply(op).ok).toBe(true);
    return ed;
  }

  it('applies an edit as ONE undo step that reverts byte-exact', () => {
    const entries = readRawEntries((path) => Editor.create(SOURCE).read(path), TABLE);
    const ed = edited(setRuleStyleOp(TABLE, entries, 0, 'fontWeight', 'bold'));
    expect(ed.text()).toContain('fontWeight: bold');
    expect(ed.canUndo()).toBe(true);
    ed.undo();
    expect(ed.text()).toBe(SOURCE);
  });

  it('leaves the OTHER rules and the keys around the list byte-exact', () => {
    // The whole point of addressing one entry: a rule the user never opened
    // must not move in the diff.
    const entries = readRawEntries((path) => Editor.create(SOURCE).read(path), TABLE);
    const text = edited(setRuleStyleOp(TABLE, entries, 0, 'fontWeight', 'bold')).text();
    expect(text).toContain('- when: { key: other, equals: end }');
    expect(text).toContain('style: { textAlign: right }');
    expect(text).toContain('cellPadding: 4');
    expect(text).toContain('minHeight: 20');
    // The edited entry keeps its own untouched keys, in their authored form.
    expect(text).toContain('styleNames: [ banner ]');
    expect(text).toContain('{ textAlign: center, fontWeight: bold }');
  });

  it('clearing the last style property leaves no empty style map', () => {
    const entries = readRawEntries((path) => Editor.create(SOURCE).read(path), TABLE);
    const text = edited(setRuleStyleOp(TABLE, entries, 1, 'textAlign', null)).text();
    expect(text).toContain('- when: { key: other, equals: end }');
    expect(text).not.toContain('style: {}');
  });

  it('removing the last rule drops the list without emptying the row map', () => {
    const ed = Editor.create(SOURCE);
    const entries = readRawEntries((path) => ed.read(path), TABLE);
    const first = removeRuleOp(TABLE, entries, 1);
    expect(first).not.toBeNull();
    if (first === null) {
      return;
    }
    expect(ed.apply(first).ok).toBe(true);
    const rest = readRawEntries((path) => ed.read(path), TABLE);
    const last = removeRuleOp(TABLE, rest, 0);
    expect(last).not.toBeNull();
    if (last === null) {
      return;
    }
    expect(ed.apply(last).ok).toBe(true);
    expect(ed.text()).not.toContain('conditionalStyles');
    // `row:` keeps the key that was there before.
    expect(ed.text()).toContain('minHeight: 20');
  });

  it('adds the first rule to a table that has no row: map at all', () => {
    const bare = [
      'sections:',
      '  body:',
      '    type: flow',
      '    items:',
      '      - type: table',
      '        data: { key: rows }',
      '        columns:',
      '          - data: { key: label }',
      '',
    ].join('\n');
    const ed = Editor.create(bare);
    expect(ed.apply(addRuleOp(TABLE, [])).ok).toBe(true);
    expect(ed.text()).toContain('conditionalStyles:');
    expect(ed.text()).toContain('key: ""');
  });
});

describe('a hostile entry is refused by the op layer, not half-written', () => {
  const HOSTILE = [
    'sections:',
    '  body:',
    '    type: flow',
    '    items:',
    '      - type: table',
    '        data: { key: rows }',
    '        row:',
    '          conditionalStyles:',
    '            - 5',
    '        columns:',
    '          - data: { key: label }',
    '',
  ].join('\n');

  it('leaves the document byte-exact when the entry is not a map', () => {
    const ed = Editor.create(HOSTILE);
    const entries = readRawEntries((path) => ed.read(path), TABLE);
    expect(entries).toHaveLength(1);
    const op = setRuleKeyOp(TABLE, entries, 0, 'kind');
    expect(op).not.toBeNull();
    if (op === null) {
      return;
    }
    const res = ed.apply(op);
    expect(res.ok).toBe(false);
    expect(ed.text()).toBe(HOSTILE);
  });
});
