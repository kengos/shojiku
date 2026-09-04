import { describe, expect, it, vi } from 'vitest';
import { type InsertArming, insertMenuGroups } from '../insert/insertMenu';
import {
  buildMenubar,
  MAX_HOST_MENU_ENTRIES,
  MAX_MENU_ID_LEN,
  MAX_MENU_LABEL_LEN,
  type MenubarWiring,
  validateHostEntries,
} from './model';

/** Nothing armed — each call turns on only the rows its assertion is about. */
const NO_ARMING: InsertArming = {
  iterable: false,
  image: false,
  field: false,
  cutLine: false,
  line: false,
  ellipse: false,
  checkbox: false,
  pageBreak: false,
  charGrid: false,
};

const t = (key: string) => key;

function baseWiring(over: Partial<MenubarWiring> = {}): MenubarWiring {
  return {
    onSave: vi.fn(),
    onDocumentSettings: vi.fn(),
    onDataEditor: vi.fn(),
    bandTarget: false,
    flowTarget: false,
    onBand: vi.fn(),
    onTutorial: vi.fn(),
    hostEntries: [],
    onUndo: vi.fn(),
    canUndo: true,
    onRedo: vi.fn(),
    canRedo: true,
    insert: insertMenuGroups({ ...NO_ARMING, cutLine: true }),
    onInsertKind: vi.fn(),
    onContainer: vi.fn(),
    onIterable: vi.fn(),
    onField: vi.fn(),
    onImage: vi.fn(),
    onPaste: vi.fn(),
    onSaveBlock: vi.fn(),
    onInsertBlock: vi.fn(),
    onManageBlocks: vi.fn(),
    blockSavable: true,
    onShortcuts: vi.fn(),
    onGlossary: vi.fn(),
    ...over,
  };
}

describe('validateHostEntries', () => {
  it('returns nothing for a non-array', () => {
    expect(validateHostEntries(null)).toEqual([]);
    expect(validateHostEntries('nope')).toEqual([]);
  });

  it('accepts a well-formed entry and trims the label', () => {
    const run = vi.fn();
    const out = validateHostEntries([{ id: 'help-desk', label: '  Help desk  ', onSelect: run }]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('help-desk');
    expect(out[0].label).toBe('Help desk');
    out[0].run();
    expect(run).toHaveBeenCalledOnce();
  });

  it('drops a non-object element', () => {
    expect(validateHostEntries([null, 42])).toEqual([]);
  });

  it('drops an entry whose id is not a string', () => {
    expect(validateHostEntries([{ id: 1, label: 'x', onSelect: () => {} }])).toEqual([]);
  });

  it('drops an empty id', () => {
    expect(validateHostEntries([{ id: '', label: 'x', onSelect: () => {} }])).toEqual([]);
  });

  it('drops an over-length id', () => {
    const id = 'a'.repeat(MAX_MENU_ID_LEN + 1);
    expect(validateHostEntries([{ id, label: 'x', onSelect: () => {} }])).toEqual([]);
  });

  it('drops an id with a disallowed charset', () => {
    expect(validateHostEntries([{ id: 'bad id!', label: 'x', onSelect: () => {} }])).toEqual([]);
  });

  it('drops prototype-chain reserved ids (no pollution)', () => {
    const out = validateHostEntries([
      { id: '__proto__', label: 'x', onSelect: () => {} },
      { id: 'constructor', label: 'y', onSelect: () => {} },
      { id: 'prototype', label: 'z', onSelect: () => {} },
    ]);
    expect(out).toEqual([]);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });

  it('drops an entry whose onSelect is not a function', () => {
    expect(validateHostEntries([{ id: 'x', label: 'x', onSelect: 'go' }])).toEqual([]);
  });

  it('drops an entry whose label is not a string', () => {
    expect(validateHostEntries([{ id: 'x', label: 5, onSelect: () => {} }])).toEqual([]);
  });

  it('drops a blank (whitespace-only) label', () => {
    expect(validateHostEntries([{ id: 'x', label: '   ', onSelect: () => {} }])).toEqual([]);
  });

  it('drops an over-length label', () => {
    const label = 'a'.repeat(MAX_MENU_LABEL_LEN + 1);
    expect(validateHostEntries([{ id: 'x', label, onSelect: () => {} }])).toEqual([]);
  });

  it('drops a label with a control character', () => {
    expect(validateHostEntries([{ id: 'x', label: 'a\nb', onSelect: () => {} }])).toEqual([]);
  });

  it('drops a duplicate id, keeping the first', () => {
    const out = validateHostEntries([
      { id: 'x', label: 'first', onSelect: () => {} },
      { id: 'x', label: 'second', onSelect: () => {} },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe('first');
  });

  it('caps the number of accepted entries', () => {
    const raw = Array.from({ length: MAX_HOST_MENU_ENTRIES + 3 }, (_, i) => ({
      id: `e${i}`,
      label: `E${i}`,
      onSelect: () => {},
    }));
    expect(validateHostEntries(raw)).toHaveLength(MAX_HOST_MENU_ENTRIES);
  });
});

describe('buildMenubar', () => {
  it('always builds File, Edit, Insert, Help columns', () => {
    const columns = buildMenubar(t, baseWiring());
    expect(columns.map((c) => c.id)).toEqual(['file', 'edit', 'insert', 'help']);
  });

  it('builds a Help column of tutorial + shortcuts + glossary — all built in', () => {
    const onTutorial = vi.fn();
    const onShortcuts = vi.fn();
    const onGlossary = vi.fn();
    const columns = buildMenubar(t, baseWiring({ onTutorial, onShortcuts, onGlossary }));
    const help = columns[3].groups[0];
    expect(help.map((i) => i.label)).toEqual([
      'menu.help.tutorial',
      'shortcuts.title',
      'glossary.title',
    ]);
    help[0].run();
    expect(onTutorial).toHaveBeenCalledOnce();
    help[1].run();
    expect(onShortcuts).toHaveBeenCalledOnce();
    help[2].run();
    expect(onGlossary).toHaveBeenCalledOnce();
  });

  it('disables the page-number row outside a band, naming the reason', () => {
    const onInsertKind = vi.fn();
    const groups = insertMenuGroups({ ...NO_ARMING, cutLine: true });
    const outside = buildMenubar(t, baseWiring({ insert: groups, onInsertKind }))[2].groups[0];
    const blocked = outside.find((i) => i.label.startsWith('insert.pageNumber'));
    expect(blocked?.disabled).toBe(true);
    expect(blocked?.label).toContain('insert.pageNumber.bandOnly');

    const inBand = buildMenubar(
      t,
      baseWiring({ insert: groups, onInsertKind, bandTarget: true }),
    )[2].groups[0];
    const allowed = inBand.find((i) => i.label === 'insert.pageNumber');
    expect(allowed?.disabled).toBe(false);
    allowed?.run();
    expect(onInsertKind).toHaveBeenCalledWith('pageNumber');
  });

  it('disables the page-break row outside the flow, naming the reason', () => {
    // The mirror of the page-number row above, and the reason it needs its OWN
    // gate: `bandTarget` is false inside a container too, where a page break is
    // equally skipped — so "not a band" would have offered it there.
    const onInsertKind = vi.fn();
    const groups = insertMenuGroups({ ...NO_ARMING, pageBreak: true });
    const outside = buildMenubar(t, baseWiring({ insert: groups, onInsertKind }))[2].groups[0];
    const blocked = outside.find((i) => i.label.startsWith('insert.pageBreak'));
    expect(blocked?.disabled).toBe(true);
    expect(blocked?.label).toContain('insert.pageBreak.flowOnly');

    const inFlow = buildMenubar(
      t,
      baseWiring({ insert: groups, onInsertKind, flowTarget: true }),
    )[2].groups[0];
    const allowed = inFlow.find((i) => i.label === 'insert.pageBreak');
    expect(allowed?.disabled).toBe(false);
    allowed?.run();
    expect(onInsertKind).toHaveBeenCalledWith('pageBreak');
  });

  it('never disables the char-grid row on a placement gate', () => {
    // It carries neither gate, so it stays enabled in the one state that
    // blocks both of its neighbours.
    const groups = insertMenuGroups({ ...NO_ARMING, charGrid: true });
    const rows = buildMenubar(
      t,
      baseWiring({ insert: groups, bandTarget: false, flowTarget: false }),
    )[2].groups[0];
    const row = rows.find((i) => i.label === 'insert.charGrid');
    expect(row?.disabled).toBe(false);
  });

  it('maps the reusable-block entries: save (armed), insert-by-id, manage', () => {
    const onSaveBlock = vi.fn();
    const onInsertBlock = vi.fn();
    const onManageBlocks = vi.fn();
    const insert = [
      {
        labelKey: 'insert.group.reuseBlock',
        entries: [
          { kind: 'saveBlock', labelKey: 'insert.saveBlock' },
          { kind: 'block', blockId: 'block-1', name: '社判＋住所', flowOnly: false },
          { kind: 'manageBlock', labelKey: 'insert.manageBlock' },
        ],
      },
    ] as const;
    const group = buildMenubar(
      t,
      baseWiring({ insert, onSaveBlock, onInsertBlock, onManageBlocks }),
    )[2].groups[0];

    const save = group[0];
    expect(save.label).toBe('insert.saveBlock');
    expect(save.disabled).toBe(false);
    save.run();
    expect(onSaveBlock).toHaveBeenCalledOnce();

    // The block row's label is the user-chosen name; run inserts by id.
    expect(group[1].label).toBe('社判＋住所');
    group[1].run();
    expect(onInsertBlock).toHaveBeenCalledWith('block-1');

    group[2].run();
    expect(onManageBlocks).toHaveBeenCalledOnce();
  });

  it('disables a FLOW-ONLY block inside a band, naming the reason', () => {
    // Unlike the band-only page number, which merely warns in the wrong place,
    // a `repeat`/`repeat_flow`/`page_break` inside a band does not parse — the
    // whole document stops rendering — so the row must not act.
    const insert = [
      {
        labelKey: 'insert.group.reuseBlock',
        entries: [
          { kind: 'saveBlock', labelKey: 'insert.saveBlock' },
          { kind: 'block', blockId: 'b1', name: '明細ブロック', flowOnly: true },
        ],
      },
    ] as const;
    const onInsertBlock = vi.fn();
    const inBand = buildMenubar(t, baseWiring({ insert, onInsertBlock, bandTarget: true }))[2]
      .groups[0][1];
    expect(inBand.disabled).toBe(true);
    expect(inBand.label).toContain('insert.block.flowOnly');

    // Outside a band the SAME block is an ordinary row — the flag alone never
    // disables it, which is the control for the assertion above.
    const outside = buildMenubar(t, baseWiring({ insert, onInsertBlock, bandTarget: false }))[2]
      .groups[0][1];
    expect(outside.disabled).toBe(false);
    expect(outside.label).toBe('明細ブロック');
    outside.run();
    expect(onInsertBlock).toHaveBeenCalledWith('b1');
  });

  it('disables the save-block row without a savable selection, naming the reason', () => {
    const insert = [
      {
        labelKey: 'insert.group.reuseBlock',
        entries: [{ kind: 'saveBlock', labelKey: 'insert.saveBlock' }],
      },
    ] as const;
    const save = buildMenubar(t, baseWiring({ insert, blockSavable: false }))[2].groups[0][0];
    expect(save.disabled).toBe(true);
    expect(save.label).toContain('insert.saveBlock.needsSelection');
  });

  it('includes every injected file action, plus Save', () => {
    const onBack = vi.fn();
    const onOpen = vi.fn();
    const onExport = vi.fn();
    const onAddFont = vi.fn();
    const onSave = vi.fn();
    const onDocumentSettings = vi.fn();
    const columns = buildMenubar(
      t,
      baseWiring({ onBack, onOpen, onExport, onAddFont, onSave, onDocumentSettings }),
    );
    const file = columns[0].groups[0];
    expect(file.map((i) => i.label)).toEqual([
      'menu.back',
      'menu.open',
      'menu.export',
      'menu.addFont',
      'app.save',
      'menu.documentSettings',
      'menu.dataEditor',
    ]);
    file[0].run();
    expect(onBack).toHaveBeenCalledOnce();
    file[4].run();
    expect(onSave).toHaveBeenCalledOnce();
    file[5].run();
    expect(onDocumentSettings).toHaveBeenCalledOnce();
  });

  it('omits absent file actions, keeping Save + document settings + data editor', () => {
    const columns = buildMenubar(t, baseWiring());
    expect(columns[0].groups).toHaveLength(1);
    expect(columns[0].groups[0].map((i) => i.label)).toEqual([
      'app.save',
      'menu.documentSettings',
      'menu.dataEditor',
    ]);
  });

  it('adds the restore-points item (before Save) only when the host wires it', () => {
    expect(buildMenubar(t, baseWiring())[0].groups[0].map((i) => i.label)).not.toContain(
      'menu.snapshots',
    );
    const onSnapshots = vi.fn();
    const file = buildMenubar(t, baseWiring({ onSnapshots }))[0].groups[0];
    const labels = file.map((i) => i.label);
    expect(labels).toContain('menu.snapshots');
    expect(labels.indexOf('menu.snapshots')).toBe(labels.indexOf('app.save') - 1);
    file[labels.indexOf('menu.snapshots')].run();
    expect(onSnapshots).toHaveBeenCalledOnce();
  });

  it('appends validated host entries as a divided group', () => {
    const run = vi.fn();
    const columns = buildMenubar(
      t,
      baseWiring({ hostEntries: [{ id: 'h', label: 'Host item', run }] }),
    );
    expect(columns[0].groups).toHaveLength(2);
    const hostGroup = columns[0].groups[1];
    expect(hostGroup[0].label).toBe('Host item');
    hostGroup[0].run();
    expect(run).toHaveBeenCalledOnce();
  });

  it('marks undo/redo disabled when their stacks are empty', () => {
    const columns = buildMenubar(t, baseWiring({ canUndo: false, canRedo: false }));
    const edit = columns[1].groups[0];
    expect(edit[0].disabled).toBe(true);
    expect(edit[1].disabled).toBe(true);
  });

  it('enables undo/redo when their stacks are non-empty', () => {
    const columns = buildMenubar(t, baseWiring());
    const edit = columns[1].groups[0];
    expect(edit[0].disabled).toBe(false);
    expect(edit[1].disabled).toBe(false);
  });

  it('adds duplicate/delete only when a sequence item is selected', () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const columns = buildMenubar(t, baseWiring({ onDuplicate, onDelete }));
    expect(columns[1].groups).toHaveLength(2);
    const sel = columns[1].groups[1];
    expect(sel.map((i) => i.label)).toEqual(['menu.duplicate', 'menu.delete']);
    sel[0].run();
    expect(onDuplicate).toHaveBeenCalledOnce();
    sel[1].run();
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('omits the selection group when nothing is selected', () => {
    const columns = buildMenubar(t, baseWiring());
    expect(columns[1].groups).toHaveLength(1);
  });

  it('dispatches insert entries per kind', () => {
    const onInsertKind = vi.fn();
    const onContainer = vi.fn();
    const onIterable = vi.fn();
    const onField = vi.fn();
    const onImage = vi.fn();
    const onPaste = vi.fn();
    const onBand = vi.fn();
    const columns = buildMenubar(
      t,
      baseWiring({
        insert: insertMenuGroups({
          iterable: true,
          image: true,
          field: true,
          cutLine: true,
          line: true,
          ellipse: true,
          checkbox: true,
          pageBreak: true,
          charGrid: true,
        }),
        onInsertKind,
        onContainer,
        onIterable,
        onField,
        onImage,
        onPaste,
        onBand,
      }),
    );
    const groups = columns[2].groups;
    // Elements group: text/rect/line/qrCode dispatch onInsertKind with the kind.
    groups[0][0].run();
    expect(onInsertKind).toHaveBeenCalledWith('text');
    // The plain rule is an ordinary immediately-acting row: a bare noun, never
    // disabled, dispatching its kind.
    const lineItem = groups[0].find((item) => item.label === 'insert.line');
    expect(lineItem?.disabled).toBe(false);
    lineItem?.run();
    expect(onInsertKind).toHaveBeenCalledWith('line');
    // The container entry (before paste) opens the picker.
    const containerItem = groups[0].find((item) => item.label === 'insert.container');
    expect(containerItem).toBeDefined();
    containerItem?.run();
    expect(onContainer).toHaveBeenCalledOnce();
    // The always-present paste entry (last in the element group) → onPaste.
    groups[0].at(-1)?.run();
    expect(onPaste).toHaveBeenCalledOnce();
    // The band group sits right under the elements, next to the page-number
    // row whose disabled reason names it: header, then footer.
    expect(groups[1].map((item) => item.label)).toEqual([
      'tree.section.header',
      'tree.section.footer',
    ]);
    groups[1][1].run();
    expect(onBand).toHaveBeenCalledWith('footer');
    // Data-field group → onField; list-data → onIterable; image → onImage.
    groups[2][0].run();
    expect(onField).toHaveBeenCalledOnce();
    groups[3][0].run();
    expect(onIterable).toHaveBeenCalledOnce();
    groups[4][0].run();
    expect(onImage).toHaveBeenCalledOnce();
  });
});
