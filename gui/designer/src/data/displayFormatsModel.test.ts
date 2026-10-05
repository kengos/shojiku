// A field's declared display formats as a list model: what reads as editable
// and what as read-only (hostile shapes included), each edit as ONE whole-list
// op, the refusals, and the cap at the snippet budget — asserted on the model,
// not by rendering a list that long.

import type { Op } from '@shojiku/designer-core';
import { MAX_SNIPPET_NODES } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { applyDefinitionOps } from './definitionsEdit';
import {
  addFormat,
  FORMATS_MAX_BARE,
  FORMATS_MAX_LABELED,
  type FormatRow,
  formatsNodes,
  moveFormat,
  readFormats,
  removeFormat,
  setFormatId,
  setFormatLabel,
  writeFormats,
} from './displayFormatsModel';

const AT = ['properties', 'when'];
const keys = [...AT, 'displayFormats'];
const defs = (list: string) =>
  `type: object\nproperties:\n  when:\n    type: string\n    displayFormats: ${list}\n`;

describe('readFormats', () => {
  it('reads labeled, bare and mixed rows, and an absent list as none', () => {
    expect(readFormats(defs('[ { id: long, label: 長い }, { id: wareki } ]'), AT)).toEqual({
      kind: 'rows',
      rows: [
        { id: 'long', label: '長い' },
        { id: 'wareki', label: '' },
      ],
    });
    expect(readFormats('type: object\nproperties:\n  when: { type: string }\n', AT)).toEqual({
      kind: 'rows',
      rows: [],
    });
  });

  it('reads every shape it could not write back as found as read-only', () => {
    for (const list of [
      '{ id: long }',
      '[ long ]',
      '[ { id: long, extra: 1 } ]',
      '[ { id: 1 } ]',
      '[ { id: long, label: 3 } ]',
      '[ { id: long, label: "" } ]',
      '[ { label: x } ]',
      '[ { id: long }, { id: long } ]',
    ]) {
      expect(readFormats(defs(list), AT).kind, list).toBe('readonly');
    }
  });

  it('reads a prototype-named id as data', () => {
    expect(readFormats(defs('[ { id: __proto__ }, { id: constructor } ]'), AT)).toEqual({
      kind: 'rows',
      rows: [
        { id: '__proto__', label: '' },
        { id: 'constructor', label: '' },
      ],
    });
  });

  it('reads a list over the writable bound as too long, without walking all of it', () => {
    const many = `[ ${Array.from({ length: 5000 }, (_, i) => `{ id: v${i} }`).join(', ')} ]`;
    expect(readFormats(defs(many), AT)).toEqual({
      kind: 'readonly',
      reason: 'too_long',
      count: 5000,
    });
  });
});

describe('the cap', () => {
  const rows = (count: number, label: string): FormatRow[] =>
    Array.from({ length: count }, (_, i) => ({ id: `v${i}`, label }));

  it('is the snippet budget: 85 labeled rows or 127 bare ones', () => {
    expect(FORMATS_MAX_LABELED).toBe(85);
    expect(FORMATS_MAX_BARE).toBe(127);
    expect(formatsNodes(rows(FORMATS_MAX_LABELED, 'n'))).toBeLessThanOrEqual(MAX_SNIPPET_NODES);
    expect(writeFormats(AT, rows(FORMATS_MAX_LABELED, 'n')).ok).toBe(true);
    expect(writeFormats(AT, rows(FORMATS_MAX_BARE, '')).ok).toBe(true);
  });

  it('refuses the row past it', () => {
    const target = { keysPath: AT, rows: rows(FORMATS_MAX_LABELED, 'n') };
    expect(addFormat(target, 'more', 'n')).toEqual({ ok: false, refusal: 'full' });
    expect(writeFormats(AT, rows(FORMATS_MAX_BARE + 1, ''))).toEqual({
      ok: false,
      refusal: 'full',
    });
  });
});

describe('the edits', () => {
  const target = {
    keysPath: AT,
    rows: [
      { id: 'long', label: '長い' },
      { id: 'wareki', label: '' },
    ],
  };

  it('appends a row, writing no label when it has none', () => {
    expect(addFormat(target, 'compact', '')).toEqual({
      ok: true,
      op: {
        op: 'putValue',
        keys,
        value: [{ id: 'long', label: '長い' }, { id: 'wareki' }, { id: 'compact' }],
      },
    });
  });

  it('refuses an empty or a duplicate id', () => {
    expect(addFormat(target, ' ', '')).toEqual({ ok: false, refusal: 'empty' });
    expect(addFormat(target, 'long', '')).toEqual({ ok: false, refusal: 'duplicate' });
    expect(setFormatId(target, 1, 'long')).toEqual({ ok: false, refusal: 'duplicate' });
    expect(setFormatId(target, 1, '')).toEqual({ ok: false, refusal: 'empty' });
  });

  it('changes an id or a label, and an unchanged entry authors nothing', () => {
    expect(setFormatId(target, 1, 'wareki')).toEqual({ ok: true, op: null });
    expect(setFormatLabel(target, 0, '長い')).toEqual({ ok: true, op: null });
    expect(setFormatId(target, 1, 'date')).toMatchObject({
      op: { value: [{ id: 'long', label: '長い' }, { id: 'date' }] },
    });
    expect(setFormatLabel(target, 0, '')).toMatchObject({
      op: { value: [{ id: 'long' }, { id: 'wareki' }] },
    });
  });

  it('removes a row, and removing the last removes the key', () => {
    expect(removeFormat(target, 0)).toMatchObject({ op: { value: [{ id: 'wareki' }] } });
    expect(removeFormat({ keysPath: AT, rows: [target.rows[0]] }, 0)).toEqual({
      ok: true,
      op: { op: 'removeKey', keys },
    });
  });

  it('moves a row either way, and a move to where it is authors nothing', () => {
    expect(moveFormat(target, 0, 2)).toMatchObject({
      value: [{ id: 'wareki' }, { id: 'long', label: '長い' }],
    });
    expect(moveFormat(target, 1, 0)).toMatchObject({
      value: [{ id: 'wareki' }, { id: 'long', label: '長い' }],
    });
    expect(moveFormat(target, 0, 1)).toBeNull();
  });
});

describe('a list edit in the file', () => {
  it('rewrites only the list: a comment outside it and every other key survive', () => {
    const text = `type: object
properties:
  # the issue date
  when:
    type: string
    displayFormats: [ { id: long } ]
    title: 日付 # shown in the rail
`;
    const edit = addFormat({ keysPath: AT, rows: [{ id: 'long', label: '' }] }, 'wareki', '');
    const after = applyDefinitionOps(text, [edit.ok ? (edit.op as Op) : ({} as Op)]);
    expect(after).toContain('  # the issue date\n');
    expect(after).toContain('title: 日付 # shown in the rail');
    expect(readFormats(after, AT)).toEqual({
      kind: 'rows',
      rows: [
        { id: 'long', label: '' },
        { id: 'wareki', label: '' },
      ],
    });
  });
});
