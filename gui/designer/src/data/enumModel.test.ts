// The choices model: reading the full member list (forms kept), the read-only
// arms for a list the editor cannot write back, typed member values per base
// type, and the one-op-per-edit row builders with their refusals — including
// the capacity bound (designer-core's snippet budget and the engine's cap).

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MAX_SNIPPET_NODES } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { applyDefinitionOps } from './definitionsEdit';
import { addRow, type EnumTarget, moveRow, removeRow, setRowLabel, setRowValue } from './enumEdits';
import {
  type EnumRow,
  fits,
  MAX_ENUM_VALUES,
  parseEnumValue,
  readEnum,
  snippetNodes,
  writeRows,
} from './enumModel';

const defs = (enumYaml: string) => `type: object
properties:
  status:
    type: string
    enum: ${enumYaml}
`;
const AT = ['properties', 'status'];
const KEYS = [...AT, 'enum'];

const bare = (value: string | number | boolean): EnumRow => ({ value, label: '', labeled: false });
const pair = (value: string | number | boolean, label: string): EnumRow => ({
  value,
  label,
  labeled: true,
});

describe('readEnum', () => {
  it('reads bare and labeled members in order, keeping each form', () => {
    const read = readEnum(
      defs('[ draft, { value: sent, label: 送付済み }, { value: paid, label: "" }, 3, true ]'),
      AT,
    );
    expect(read).toEqual({
      kind: 'rows',
      rows: [bare('draft'), pair('sent', '送付済み'), pair('paid', ''), bare(3), bare(true)],
    });
  });

  it('is absent when the field declares no choices', () => {
    expect(
      readEnum('type: object\nproperties:\n  a: { type: string }\n', ['properties', 'a']),
    ).toEqual({ kind: 'absent' });
  });

  it('is read-only for a list it could not write back as found', () => {
    for (const shape of [
      'draft',
      '[ [ 1 ] ]',
      '[ { a: 1 } ]',
      '[ { value: [ 1 ], label: x } ]',
      '[ { value: x } ]',
      '[ { value: x, label: y, extra: z } ]',
      '[ { value: x, label: 1 } ]',
    ]) {
      expect(readEnum(defs(shape), AT)).toMatchObject({ kind: 'readonly', reason: 'shape' });
    }
  });

  it('is read-only when a number is spelled other than it would be written back', () => {
    for (const spelled of [
      '[ 2.0 ]',
      '[ 1e3 ]',
      '[ 0x10 ]',
      '[ { value: 2.0, label: two } ]',
      '[ 9007199254740993 ]',
    ]) {
      expect(readEnum(defs(spelled), AT)).toEqual({ kind: 'readonly', reason: 'shape', count: 1 });
    }
    expect(readEnum(defs('[ 2, -1.5, { value: 3, label: three } ]'), AT).kind).toBe('rows');
  });

  it('is read-only for an aliased list or member, which has no spelling of its own', () => {
    const shared = (enumYaml: string) =>
      `x-shared: &list [ a, b ]\nx-one: &one c\n${defs(enumYaml)}`;
    expect(readEnum(shared('*list'), AT)).toMatchObject({ kind: 'readonly', reason: 'shape' });
    expect(readEnum(shared('[ a, *one ]'), AT)).toMatchObject({
      kind: 'readonly',
      reason: 'shape',
    });
  });

  it('is read-only past what one op may write', () => {
    const many = `[ ${Array.from({ length: MAX_SNIPPET_NODES }, (_, i) => `v${i}`).join(', ')} ]`;
    expect(readEnum(defs(many), AT)).toEqual({
      kind: 'readonly',
      reason: 'too_long',
      count: MAX_SNIPPET_NODES,
    });
    expect(readEnum(defs('draft'), AT)).toEqual({ kind: 'readonly', reason: 'shape', count: 0 });
  });

  it('keeps a `__proto__` value or label as ordinary text', () => {
    expect(readEnum(defs('[ __proto__, { value: x, label: __proto__ } ]'), AT)).toEqual({
      kind: 'rows',
      rows: [bare('__proto__'), pair('x', '__proto__')],
    });
  });
});

describe('capacity', () => {
  it('counts a list node, one node per bare member and three per labeled member', () => {
    expect(snippetNodes([])).toBe(1);
    expect(snippetNodes([bare('a'), pair('b', 'B')])).toBe(5);
  });

  it('fits within both the snippet budget and the engine cap, and no further', () => {
    const bares = (n: number) => Array.from({ length: n }, (_, i) => bare(`v${i}`));
    expect(fits(bares(MAX_SNIPPET_NODES - 1))).toBe(true);
    expect(fits(bares(MAX_SNIPPET_NODES))).toBe(false);
    expect(fits(bares(MAX_ENUM_VALUES + 1))).toBe(false);
    const labeled = (n: number) => Array.from({ length: n }, (_, i) => pair(`v${i}`, 'L'));
    expect(fits(labeled(85))).toBe(true);
    expect(fits(labeled(86))).toBe(false);
  });

  it('mirrors the engine member cap it stands in for', () => {
    const source = readFileSync(
      resolve(process.cwd(), '../../engine/core/src/definitions/schema.rs'),
      'utf8',
    );
    const declared = /pub const MAX_ENUM_VALUES: usize = (\d+);/.exec(source);
    expect(Number(declared?.[1])).toBe(MAX_ENUM_VALUES);
  });
});

describe('parseEnumValue', () => {
  it('types the entry by the field', () => {
    expect(parseEnumValue('string', '001')).toEqual({ ok: true, value: '001' });
    expect(parseEnumValue('string', 'empty')).toEqual({ ok: true, value: 'empty' });
    expect(parseEnumValue('number', '1.5')).toEqual({ ok: true, value: 1.5 });
    expect(parseEnumValue('integer', '7')).toEqual({ ok: true, value: 7 });
    expect(parseEnumValue('boolean', 'false')).toEqual({ ok: true, value: false });
  });

  it('refuses an empty entry and what the type cannot hold', () => {
    expect(parseEnumValue('string', '  ')).toEqual({ ok: false, refusal: 'empty' });
    expect(parseEnumValue('number', 'abc')).toEqual({ ok: false, refusal: 'not_a_number' });
    expect(parseEnumValue('integer', '1.5')).toEqual({ ok: false, refusal: 'not_whole' });
    expect(parseEnumValue('number', '1e400')).toEqual({ ok: false, refusal: 'too_large' });
  });
});

describe('writeRows', () => {
  it('writes the whole list, each member in its form', () => {
    expect(writeRows(AT, [bare('a'), pair('b', 'B'), pair('c', '')])).toEqual({
      ok: true,
      op: {
        op: 'putValue',
        keys: KEYS,
        value: ['a', { value: 'b', label: 'B' }, { value: 'c', label: '' }],
      },
    });
  });

  it('removes the key once the list is empty', () => {
    expect(writeRows(AT, [])).toEqual({ ok: true, op: { op: 'removeKey', keys: KEYS } });
  });
});

describe('row edits', () => {
  const target = (rows: readonly EnumRow[], type = 'string'): EnumTarget => ({
    keysPath: AT,
    type,
    rows,
  });
  const put = (value: unknown) => ({ ok: true, op: { op: 'putValue', keys: KEYS, value } });
  const ROWS = [bare('draft'), pair('sent', '送付済み'), bare('paid')];

  it('adds a bare member for an empty label and a pair otherwise', () => {
    expect(addRow(target([]), 'draft', '')).toEqual(put(['draft']));
    expect(addRow(target([bare('a')]), 'b', 'B')).toEqual(put(['a', { value: 'b', label: 'B' }]));
  });

  it('adds a typed number and refuses a non-number on a number field', () => {
    expect(addRow(target([bare(1)], 'number'), '2.5', '')).toEqual(put([1, 2.5]));
    expect(addRow(target([], 'number'), 'abc', '')).toEqual({ ok: false, refusal: 'not_a_number' });
    expect(addRow(target([], 'integer'), '1.5', '')).toEqual({ ok: false, refusal: 'not_whole' });
  });

  it('refuses an empty or duplicate value, and a member past the capacity', () => {
    expect(addRow(target(ROWS), ' ', 'x')).toEqual({ ok: false, refusal: 'empty' });
    expect(addRow(target(ROWS), 'paid', '')).toEqual({ ok: false, refusal: 'duplicate' });
    const full = Array.from({ length: MAX_SNIPPET_NODES - 1 }, (_, i) => bare(`v${i}`));
    expect(addRow(target(full), 'one-more', '')).toEqual({ ok: false, refusal: 'full' });
  });

  it('changes a value keeping its label, and refuses a duplicate of ANOTHER member', () => {
    expect(setRowValue(target(ROWS), 1, 'shipped')).toEqual(
      put(['draft', { value: 'shipped', label: '送付済み' }, 'paid']),
    );
    expect(setRowValue(target(ROWS), 1, 'sent')).toEqual({ ok: true, op: null });
    expect(setRowValue(target(ROWS), 1, 'paid')).toEqual({ ok: false, refusal: 'duplicate' });
    expect(setRowValue(target(ROWS), 1, '')).toEqual({ ok: false, refusal: 'empty' });
  });

  it('writes a mistyped OTHER member back verbatim', () => {
    expect(setRowValue(target([bare('1'), bare(2)], 'number'), 1, '3')).toEqual(put(['1', 3]));
  });

  it('labels a bare member, unlabels with an empty label, and authors nothing unchanged', () => {
    expect(setRowLabel(target(ROWS), 0, '下書き')).toEqual(
      put([{ value: 'draft', label: '下書き' }, { value: 'sent', label: '送付済み' }, 'paid']),
    );
    expect(setRowLabel(target(ROWS), 1, '')).toEqual(put(['draft', 'sent', 'paid']));
    expect(setRowLabel(target(ROWS), 1, '送付済み')).toEqual({ ok: true, op: null });
    expect(setRowLabel(target(ROWS), 2, '')).toEqual({ ok: true, op: null });
    expect(setRowLabel(target([pair('x', '')]), 0, '')).toEqual({ ok: true, op: null });
  });

  it('refuses a label that would take the list past the capacity', () => {
    const full = Array.from({ length: MAX_SNIPPET_NODES - 1 }, (_, i) => bare(`v${i}`));
    expect(setRowLabel(target(full), 0, 'L')).toEqual({ ok: false, refusal: 'full' });
  });

  it('removes a member, and the last one removes the key', () => {
    expect(removeRow(target(ROWS), 0)).toEqual(put([{ value: 'sent', label: '送付済み' }, 'paid']));
    expect(removeRow(target([bare('a')]), 0)).toEqual({
      ok: true,
      op: { op: 'removeKey', keys: KEYS },
    });
  });

  it('moves a member by insertion slot, and a slot that does not move authors nothing', () => {
    expect(moveRow(target(ROWS), 0, 3)).toEqual(
      put([{ value: 'sent', label: '送付済み' }, 'paid', 'draft']).op,
    );
    expect(moveRow(target(ROWS), 2, 0)).toEqual(
      put(['paid', 'draft', { value: 'sent', label: '送付済み' }]).op,
    );
    expect(moveRow(target(ROWS), 1, 1)).toBeNull();
    expect(moveRow(target(ROWS), 1, 2)).toBeNull();
  });
});

describe('round trip', () => {
  // A fixed-point fixture (block style throughout), so byte-exact holds.
  const SOURCE = `# Order data.
type: object
properties:
  # How far along the order is.
  status:
    type: string # free text before
    enum:
      - draft
      - sent
    maxLength: 10 # keep it short
  memo: { type: string }
`;

  it('rewrites only the list: every key and comment outside it stays byte-exact', () => {
    const edit = setRowLabel(
      { keysPath: AT, type: 'string', rows: [bare('draft'), bare('sent')] },
      1,
      '送付済み',
    );
    const op = edit.ok ? edit.op : null;
    expect(op).not.toBeNull();
    const out = applyDefinitionOps(SOURCE, [op as NonNullable<typeof op>]);
    expect(out).toBe(
      SOURCE.replace('      - sent\n', '      - value: sent\n        label: 送付済み\n'),
    );
  });

  it('removes the emptied list and nothing else', () => {
    const edit = removeRow({ keysPath: AT, type: 'string', rows: [bare('draft')] }, 0);
    const op = edit.ok ? edit.op : null;
    const out = applyDefinitionOps(SOURCE, [op as NonNullable<typeof op>]);
    expect(out).toBe(SOURCE.replace('    enum:\n      - draft\n      - sent\n', ''));
  });
});
