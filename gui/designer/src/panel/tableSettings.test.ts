// The table's row and page settings below the UI: what `readTableSettings`
// reports for authored, absent and hostile documents, and what every
// `tableSettingsOps` builder authors or refuses — including the round trips
// through a real designer-core Editor that say an edit touches only its keys.

import { Editor, type Op } from '@shojiku/designer-core';
import { describe, expect, it } from 'vitest';
import { readTableSettings, type TableSettingsView } from './tableSettingsModel';
import {
  addHeaderGroupOp,
  canStepCellPadding,
  cellPaddingOp,
  cellPaddingStepOp,
  emptyBehaviorOp,
  flagToggleOp,
  MAX_CELL_PADDING_PT,
  MAX_ROW_HEIGHT_PT,
  removeHeaderGroupOp,
  rowLengthOp,
  rowLengthStepOp,
  rowModeOps,
  uncoveredColumns,
} from './tableSettingsOps';

const P = 'sections.body.items[0]';
const ROW_H = ['row', 'height'];
const MIN_H = ['row', 'minHeight'];

function view(over: Partial<TableSettingsView> = {}): TableSettingsView {
  return { ...readTableSettings({}), ...over };
}

describe('readTableSettings', () => {
  it('reports the engine defaults for a table carrying none of the keys', () => {
    expect(readTableSettings({ type: 'table', columns: [] })).toEqual({
      rowMode: 'auto',
      rowHeight: '',
      minHeight: '',
      minHeightAuthored: false,
      headerHeight: '',
      cellPadding: '',
      emptyBehavior: 'collapse',
      mergeEmptyCells: false,
      autoPageBreak: true,
      repeatHeader: true,
      keepTogether: false,
    });
  });

  it('degrades a hostile document to the defaults without throwing', () => {
    const defaults = readTableSettings({});
    expect(readTableSettings('table')).toEqual(defaults);
    expect(readTableSettings(null)).toEqual(defaults);
    expect(readTableSettings([1, 2])).toEqual(defaults);
    expect(readTableSettings({ row: [{ height: 9 }], header: 'tall', headerGroups: 'x' })).toEqual(
      defaults,
    );
    expect(readTableSettings({ row: { height: Number.NaN }, cellPadding: {} }).cellPadding).toBe(
      '',
    );
  });

  it('reads own keys only — nothing through the prototype', () => {
    const inherited = Object.create({ keepTogether: true, row: { height: 10 } });
    expect(readTableSettings(inherited)).toEqual(readTableSettings({}));
    const hostile = JSON.parse(
      '{"__proto__": {"cellPadding": 9}, "row": {"__proto__": {"height": 3}}}',
    );
    const read = readTableSettings(hostile);
    expect(read.cellPadding).toBe('');
    expect(read.rowMode).toBe('auto');
  });

  it('shows authored lengths verbatim, relative units included', () => {
    const read = readTableSettings({
      row: { height: '12mm', minHeight: 30 },
      header: { height: '50%' },
      cellPadding: 6,
    });
    expect(read.rowMode).toBe('fixed');
    expect(read.rowHeight).toBe('12mm');
    expect(read.minHeight).toBe('30');
    expect(read.headerHeight).toBe('50%');
    expect(read.cellPadding).toBe('6');
  });

  it('shows a relative fixed row height verbatim too', () => {
    const read = readTableSettings({ row: { height: '50%' } });
    expect(read.rowMode).toBe('fixed');
    expect(read.rowHeight).toBe('50%');
  });

  it('reads the switches strictly against their defaults', () => {
    const strings = readTableSettings({
      keepTogether: 'true',
      mergeEmptyCells: 1,
      autoPageBreak: 'false',
      repeatHeader: 0,
      emptyBehavior: 'bogus',
    });
    expect(strings.keepTogether).toBe(false);
    expect(strings.mergeEmptyCells).toBe(false);
    expect(strings.autoPageBreak).toBe(true);
    expect(strings.repeatHeader).toBe(true);
    expect(strings.emptyBehavior).toBe('collapse');
    const real = readTableSettings({
      keepTogether: true,
      mergeEmptyCells: true,
      autoPageBreak: false,
      repeatHeader: false,
      emptyBehavior: 'reserve',
    });
    expect(real).toMatchObject({
      keepTogether: true,
      mergeEmptyCells: true,
      autoPageBreak: false,
      repeatHeader: false,
      emptyBehavior: 'reserve',
    });
  });
});

describe('rowModeOps', () => {
  it('fixes the rows at the engine floor when no minimum is authored', () => {
    expect(rowModeOps(P, view(), 'fixed')).toEqual([
      { op: 'setScalar', path: P, keys: ROW_H, value: 24 },
    ]);
  });

  it('fixes the rows at the authored minimum and drops it in the same batch', () => {
    expect(rowModeOps(P, view({ minHeight: '10mm', minHeightAuthored: true }), 'fixed')).toEqual([
      { op: 'setScalar', path: P, keys: ROW_H, value: '10mm' },
      { op: 'removeKey', path: P, keys: MIN_H },
    ]);
    expect(rowModeOps(P, view({ minHeight: '30', minHeightAuthored: true }), 'fixed')?.[0]).toEqual(
      {
        op: 'setScalar',
        path: P,
        keys: ROW_H,
        value: 30,
      },
    );
  });

  it('seeds from the engine floor when the minimum is unusable, and still drops it', () => {
    for (const minHeight of ['50%', '0', 'abc', '99999']) {
      expect(rowModeOps(P, view({ minHeight, minHeightAuthored: true }), 'fixed')).toEqual([
        { op: 'setScalar', path: P, keys: ROW_H, value: 24 },
        { op: 'removeKey', path: P, keys: MIN_H },
      ]);
    }
  });

  it('drops a minimum the field cannot show, rather than leaving it behind', () => {
    for (const minHeight of [{}, [], true, null]) {
      expect(rowModeOps(P, readTableSettings({ row: { minHeight } }), 'fixed')).toEqual([
        { op: 'setScalar', path: P, keys: ROW_H, value: 24 },
        { op: 'removeKey', path: P, keys: MIN_H },
      ]);
    }
  });

  it('returns to auto by removing only the fixed height', () => {
    expect(rowModeOps(P, view({ rowMode: 'fixed', rowHeight: '20' }), 'auto')).toEqual([
      { op: 'removeKey', path: P, keys: ROW_H },
    ]);
  });

  it('makes no edit when the mode on screen is picked again', () => {
    expect(rowModeOps(P, view(), 'auto')).toBeNull();
    expect(rowModeOps(P, view({ rowMode: 'fixed' }), 'fixed')).toBeNull();
  });
});

describe('rowLengthOp', () => {
  it('clears on empty and authors absolute lengths in their typed form', () => {
    expect(rowLengthOp(P, MIN_H, '  ', 'zero')).toEqual({ op: 'removeKey', path: P, keys: MIN_H });
    expect(rowLengthOp(P, MIN_H, '12', 'zero')).toEqual({
      op: 'setScalar',
      path: P,
      keys: MIN_H,
      value: 12,
    });
    expect(rowLengthOp(P, ROW_H, '10mm', 'positive')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ROW_H,
      value: '10mm',
    });
  });

  it('refuses negatives, relative units, garbage and absurd magnitudes', () => {
    for (const raw of ['-1', '50%', '2em', 'abc', '12 mm', String(MAX_ROW_HEIGHT_PT + 1)]) {
      expect(rowLengthOp(P, MIN_H, raw, 'zero')).toBeNull();
    }
    expect(rowLengthOp(P, MIN_H, String(MAX_ROW_HEIGHT_PT), 'zero')).not.toBeNull();
  });

  it('takes 0 as a minimum but never as a fixed height', () => {
    expect(rowLengthOp(P, MIN_H, '0', 'zero')).toEqual({
      op: 'setScalar',
      path: P,
      keys: MIN_H,
      value: 0,
    });
    expect(rowLengthOp(P, ROW_H, '0', 'positive')).toBeNull();
  });
});

describe('rowLengthStepOp', () => {
  it('steps an empty field from its base', () => {
    expect(rowLengthStepOp(P, MIN_H, '', 24, 1, 'zero')).toMatchObject({ value: 25 });
    expect(rowLengthStepOp(P, ['header', 'height'], '', 31, -1, 'positive')).toMatchObject({
      value: 30,
    });
  });

  it('steps an authored value in its own unit', () => {
    expect(rowLengthStepOp(P, ROW_H, '20', 24, 1, 'positive')).toMatchObject({ value: 21 });
  });

  it('stops at the floor without an edit', () => {
    expect(rowLengthStepOp(P, ROW_H, '1', 24, -1, 'positive')).toBeNull();
    expect(rowLengthStepOp(P, MIN_H, '0', 24, -1, 'zero')).toBeNull();
    expect(rowLengthStepOp(P, MIN_H, '50%', 24, 1, 'zero')).toBeNull();
  });
});

describe('cellPadding', () => {
  it('sets a bare numeral and refuses anything else', () => {
    expect(cellPaddingOp(P, '', '6')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['cellPadding'],
      value: 6,
    });
    for (const raw of [
      '-1',
      '2mm',
      'abc',
      '+3',
      String(MAX_CELL_PADDING_PT + 1),
      '9'.repeat(400),
    ]) {
      expect(cellPaddingOp(P, '', raw)).toBeNull();
    }
    expect(cellPaddingOp(P, '', String(MAX_CELL_PADDING_PT))).not.toBeNull();
  });

  it('clears an authored padding and makes no edit when there is none', () => {
    expect(cellPaddingOp(P, '6', '')).toEqual({ op: 'removeKey', path: P, keys: ['cellPadding'] });
    expect(cellPaddingOp(P, '', ' ')).toBeNull();
  });

  it('steps from the engine default when unset, clamped at 0', () => {
    expect(cellPaddingStepOp(P, '', 1)).toMatchObject({ value: 5 });
    expect(cellPaddingStepOp(P, '', -1)).toMatchObject({ value: 3 });
    expect(cellPaddingStepOp(P, '0.5', -1)).toMatchObject({ value: 0 });
    expect(cellPaddingStepOp(P, '0', -1)).toBeNull();
  });

  it('cannot step a value that is not a bare numeral', () => {
    expect(canStepCellPadding('')).toBe(true);
    expect(canStepCellPadding('4')).toBe(true);
    expect(canStepCellPadding('4mm')).toBe(false);
    expect(cellPaddingStepOp(P, '4mm', 1)).toBeNull();
  });
});

describe('emptyBehaviorOp', () => {
  it('writes reserve, and removes it when the default is picked back', () => {
    expect(emptyBehaviorOp(P, 'collapse', 'reserve')).toEqual({
      op: 'setScalar',
      path: P,
      keys: ['emptyBehavior'],
      value: 'reserve',
    });
    expect(emptyBehaviorOp(P, 'reserve', 'collapse')).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['emptyBehavior'],
    });
  });

  it('makes no edit for a re-pick or a value outside the engine set', () => {
    expect(emptyBehaviorOp(P, 'collapse', 'collapse')).toBeNull();
    expect(emptyBehaviorOp(P, 'collapse', 'bogus')).toBeNull();
  });
});

describe('flagToggleOp', () => {
  it('writes a default-on flag off, and removes it when turned back on', () => {
    for (const flag of ['autoPageBreak', 'repeatHeader'] as const) {
      expect(flagToggleOp(P, flag, true)).toEqual({
        op: 'setScalar',
        path: P,
        keys: [flag],
        value: false,
      });
      expect(flagToggleOp(P, flag, false)).toEqual({ op: 'removeKey', path: P, keys: [flag] });
    }
  });

  it('writes a default-off flag on, and removes it when turned back off', () => {
    for (const flag of ['keepTogether', 'mergeEmptyCells'] as const) {
      expect(flagToggleOp(P, flag, false)).toEqual({
        op: 'setScalar',
        path: P,
        keys: [flag],
        value: true,
      });
      expect(flagToggleOp(P, flag, true)).toEqual({ op: 'removeKey', path: P, keys: [flag] });
    }
  });
});

describe('header groups', () => {
  it('adds the first group over every column', () => {
    expect(addHeaderGroupOp(P, [], 3, 'Group')).toEqual({
      op: 'insertItem',
      path: `${P}.headerGroups`,
      index: 0,
      value: { label: 'Group', span: 3 },
    });
  });

  it('adds a later group over the columns still uncovered', () => {
    const groups = [{ label: 'A', span: '2' }];
    expect(addHeaderGroupOp(P, groups, 4, 'Group')).toEqual({
      op: 'insertItem',
      path: `${P}.headerGroups`,
      index: 1,
      value: { label: 'Group', span: 2 },
    });
  });

  it('counts a garbage span as the one column layout gives it', () => {
    expect(uncoveredColumns([{ label: '', span: '' }], 3)).toBe(2);
  });

  it('adds nothing when every column is covered, or there are none', () => {
    expect(addHeaderGroupOp(P, [{ label: 'A', span: '3' }], 3, 'Group')).toBeNull();
    expect(addHeaderGroupOp(P, [{ label: 'A', span: '9' }], 3, 'Group')).toBeNull();
    expect(addHeaderGroupOp(P, [], 0, 'Group')).toBeNull();
  });

  it('removes one of several groups by index, and the last one with its key', () => {
    expect(removeHeaderGroupOp(P, 1, 2)).toEqual({
      op: 'removeItem',
      path: `${P}.headerGroups`,
      index: 1,
    });
    expect(removeHeaderGroupOp(P, 0, 1)).toEqual({
      op: 'removeKey',
      path: P,
      keys: ['headerGroups'],
    });
  });
});

const SOURCE = `sections:
  body:
    type: flow
    items:
      # the invoice lines
      - type: table
        data: { key: lines }
        row:
          minHeight: 20 # a comment that must survive
        columns:
          - { label: Item, data: { key: name } }
          - { label: Qty, data: { key: qty } }
`;

function roundTrip(ops: readonly Op[], undo = true): string {
  const editor = Editor.create(SOURCE);
  expect(editor.applyAll(ops).ok).toBe(true);
  const edited = editor.text();
  if (undo) {
    editor.undo();
    expect(editor.text()).toBe(SOURCE);
  }
  return edited;
}

describe('the settings edits against a real document', () => {
  it('each edit is one undo step, and touches only its own keys', () => {
    const edited = roundTrip([cellPaddingOp(P, '', '6') as Op]);
    expect(edited).toContain('cellPadding: 6');
    expect(edited).toContain('minHeight: 20 # a comment that must survive');
    expect(edited).toContain('# the invoice lines');
  });

  it('undoes every other settings edit in one step as well', () => {
    const single: readonly Op[] = [
      rowLengthOp(P, MIN_H, '30', 'zero') as Op,
      rowLengthOp(P, ['header', 'height'], '28', 'positive') as Op,
      emptyBehaviorOp(P, 'collapse', 'reserve') as Op,
      flagToggleOp(P, 'autoPageBreak', true),
      flagToggleOp(P, 'repeatHeader', true),
      flagToggleOp(P, 'keepTogether', false),
      flagToggleOp(P, 'mergeEmptyCells', false),
      addHeaderGroupOp(P, [], 2, 'Group') as Op,
    ];
    for (const op of single) {
      expect(roundTrip([op])).not.toBe(SOURCE);
    }
  });

  it('switches the rows to fixed and back as single steps', () => {
    const fixed = roundTrip(
      rowModeOps(P, view({ minHeight: '20', minHeightAuthored: true }), 'fixed') as Op[],
    );
    expect(fixed).toContain('height: 20');
    expect(fixed).not.toContain('minHeight');
  });

  it('returns byte-identical after adding and removing the only header group', () => {
    const editor = Editor.create(SOURCE);
    expect(editor.apply(addHeaderGroupOp(P, [], 2, 'Group') as Op).ok).toBe(true);
    expect(editor.text()).toContain('headerGroups:');
    expect(editor.apply(removeHeaderGroupOp(P, 0, 1)).ok).toBe(true);
    expect(editor.text()).toBe(SOURCE);
  });

  it('returns byte-identical after a switch goes off and back on', () => {
    const editor = Editor.create(SOURCE);
    editor.apply(flagToggleOp(P, 'repeatHeader', true));
    expect(editor.text()).toContain('repeatHeader: false');
    editor.apply(flagToggleOp(P, 'repeatHeader', false));
    expect(editor.text()).toBe(SOURCE);
  });
});
