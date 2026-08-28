// The char_grid editing surface, driven through PropertyPanel — the tabs a
// char_grid gets, the controls in each, and the two things the panel must NOT
// offer for this type.
//
// Before this, a char_grid was in NEITHER the content-tab set nor the
// decoration set, so a preset's manuscript paper had no content surface at all
// and no way to change the one thing that decides its drawn size.

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { unitHintsFor } from '../testkit/unitHint';
import { PropertyPanel } from './PropertyPanel';

const P = 'sections.body.items[0]';

function makeController(node: unknown): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => (path === P ? node : undefined),
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

const GRID = {
  type: 'char_grid',
  data: { key: 'manuscript' },
  grid: { charsPerLine: 20, lines: 10, cellSize: '9mm', lineGap: '4.5mm' },
  writingMode: 'vertical_rl',
  box: { w: 372 },
};

function draw(node: unknown, capabilities?: readonly string[], gridStep = 0): EditorController {
  const controller = makeController(node);
  const panel: ReactElement = (
    <PropertyPanel
      controller={controller}
      path={P}
      capabilities={capabilities}
      gridStep={gridStep}
    />
  );
  render(<I18nProvider locale="en">{panel}</I18nProvider>);
  return controller;
}

const openLayout = () => fireEvent.click(screen.getByRole('tab', { name: 'Layout' }));

/** The ▲/▼ belonging to ONE field. The placement tab carries the box steppers
 * too, so an index into all of them would silently address `x`. */
function stepButton(label: string, name: 'Increase' | 'Decrease'): HTMLElement {
  const input = screen.getByLabelText(label);
  // input → the relative wrapper → the row holding the wrapper and the ▲▼ column
  const row = input.parentElement?.parentElement;
  if (row === null || row === undefined) {
    throw new Error(`no stepper row for ${label}`);
  }
  return within(row).getByRole('button', { name });
}

describe('CharGridSection', () => {
  it('renders the grid controls on the placement tab, seeded from the document', () => {
    draw(GRID);
    openLayout();
    expect(screen.getByText('Manuscript grid')).not.toBeNull();
    expect((screen.getByLabelText('Cells per line') as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText('Lines') as HTMLInputElement).value).toBe('10');
    // Lengths keep the unit they were authored in.
    expect((screen.getByLabelText('Cell size') as HTMLInputElement).value).toBe('9mm');
    expect((screen.getByLabelText('Line gap') as HTMLInputElement).value).toBe('4.5mm');
    expect((screen.getByRole('radio', { name: 'Vertical' }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('is ABSENT when the engine lacks the char_grid capability', () => {
    draw(GRID, ['item.visible']);
    openLayout();
    expect(screen.queryByText('Manuscript grid')).toBeNull();
    expect(screen.queryByLabelText('Cells per line')).toBeNull();
  });

  it('is PRESENT when the capability list carries the key', () => {
    draw(GRID, ['char_grid']);
    openLayout();
    expect(screen.getByLabelText('Cells per line')).not.toBeNull();
  });

  it('labels an unset cell size rather than leaving a bare empty box', () => {
    draw({ ...GRID, grid: { charsPerLine: 20, lines: 10 } });
    openLayout();
    const cell = screen.getByLabelText('Cell size') as HTMLInputElement;
    expect(cell.value).toBe('');
    // An unset cell side is not "nothing": the engine derives it.
    expect(cell.placeholder).toBe('auto');
    // …and an unset GAP means 0, the same rule the coordinates follow.
    expect((screen.getByLabelText('Line gap') as HTMLInputElement).placeholder).toBe('0');
    expect((screen.getByLabelText('Cell gap') as HTMLInputElement).placeholder).toBe('0');
    // The COUNTS deliberately get none: they are REQUIRED keys, so an empty
    // one is a broken document, not a default worth stating.
    expect((screen.getByLabelText('Cells per line') as HTMLInputElement).placeholder).toBe('');
  });

  it('authors a count, and clearing one authors NOTHING (a required key)', () => {
    const controller = draw(GRID);
    openLayout();
    const cells = screen.getByLabelText('Cells per line') as HTMLInputElement;
    fireEvent.change(cells, { target: { value: '24' } });
    fireEvent.blur(cells);
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'charsPerLine'],
      value: 24,
    });
    vi.mocked(controller.apply).mockClear();
    const lines = screen.getByLabelText('Lines') as HTMLInputElement;
    fireEvent.change(lines, { target: { value: '' } });
    fireEvent.blur(lines);
    expect(controller.apply).not.toHaveBeenCalled();
    // …and the cleared field does not KEEP the blank on screen: authoring
    // nothing and showing nothing are two different failures, and only the
    // second is visible to the person typing.
    expect((screen.getByLabelText('Lines') as HTMLInputElement).value).toBe('10');
  });

  it('clears the cell size, returning it to the derived width', () => {
    const controller = draw(GRID);
    openLayout();
    const cell = screen.getByLabelText('Cell size') as HTMLInputElement;
    fireEvent.change(cell, { target: { value: '' } });
    fireEvent.blur(cell);
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'removeKey',
      path: P,
      keys: ['grid', 'cellSize'],
    });
  });

  it('steps a count by one whole cell', () => {
    const controller = draw(GRID);
    openLayout();
    fireEvent.click(stepButton('Cells per line', 'Increase'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'charsPerLine'],
      value: 21,
    });
  });

  it('steps a grid LENGTH by the canvas grid step, keeping its unit', () => {
    // The lengths step by the canvas grid (the box fields' rule); only the
    // COUNTS are pinned to one whole cell.
    const controller = draw(GRID, undefined, 2);
    openLayout();
    fireEvent.click(stepButton('Line gap', 'Decrease'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'lineGap'],
      value: '3.8mm',
    });
  });

  it('greys the ▲▼ on a RELATIVE grid length and says why', () => {
    // `cellSize: 5%` is legal wire — `CharGridSpec.cell_size` is an
    // `Option<Length>` and `Length` carries `Percent`/`Em`/`Rem` — but the
    // panel cannot step it by points, so `stepValueOp` returns null. Gated on
    // "non-empty" the buttons rendered ENABLED and did nothing, which is the
    // defect the width field was fixed for.
    draw({ ...GRID, grid: { ...GRID.grid, cellSize: '5%' } }, undefined, 6);
    openLayout();
    const cell = screen.getByLabelText('Cell size') as HTMLInputElement;
    expect(cell.value).toBe('5%');
    expect((stepButton('Cell size', 'Increase') as HTMLButtonElement).disabled).toBe(true);
    const row = cell.parentElement?.parentElement as HTMLElement;
    expect(within(row).getByText(/cannot be stepped/)).not.toBeNull();
  });

  it('greys the ▲▼ on a GARBAGE grid length without calling it a relative unit', () => {
    // The distinction C2 exists for: unsteppable is not the same as "percent
    // or em", and telling this author their typo is a relative unit
    // contradicts the engine's own `invalid_length` diagnostic.
    draw({ ...GRID, grid: { ...GRID.grid, cellSize: '9mmm' } }, undefined, 6);
    openLayout();
    const cell = screen.getByLabelText('Cell size') as HTMLInputElement;
    expect((stepButton('Cell size', 'Increase') as HTMLButtonElement).disabled).toBe(true);
    const row = cell.parentElement?.parentElement as HTMLElement;
    expect(within(row).queryByText(/cannot be stepped/)).toBeNull();
  });

  it('falls back to a 1pt step when the canvas grid is off', () => {
    const controller = draw({ ...GRID, grid: { charsPerLine: 20, lines: 10, charGap: 4 } });
    openLayout();
    fireEvent.click(stepButton('Cell gap', 'Increase'));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['grid', 'charGap'],
      value: 5,
    });
  });

  it('never authors the engine-default writing mode', () => {
    const controller = draw(GRID);
    openLayout();
    fireEvent.click(screen.getByRole('radio', { name: 'Horizontal' }));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'removeKey',
      path: P,
      keys: ['writingMode'],
    });
  });
});

describe('char_grid panel tabs', () => {
  it('gets a content tab and a placement tab, and NO decoration tab', () => {
    draw(GRID);
    // `borderWidth` on a char_grid is the GRID RULING width, not a border box —
    // the border cluster would author a different property under the same
    // spelling, so the decoration tab stays away from this type.
    expect(screen.getByRole('tab', { name: 'Content' })).not.toBeNull();
    expect(screen.getByRole('tab', { name: 'Layout' })).not.toBeNull();
    expect(screen.queryByRole('tab', { name: 'Style' })).toBeNull();
  });

  it('offers the binding AND its format and placeholder on the content tab', () => {
    draw(GRID);
    fireEvent.click(screen.getByRole('tab', { name: 'Content' }));
    expect(screen.getByLabelText('Data key')).not.toBeNull();
    // Both ride the BINDING (`data.format` / `data.placeholder`), which a
    // `char_grid` carries like any other data-bound item — `deny_unknown_fields`
    // on `CharGridItem` governs the item ROOT, which is not where these land.
    expect(screen.getByLabelText('Format')).not.toBeNull();
    expect(screen.getByLabelText('Blank placeholder')).not.toBeNull();
  });
});

// The unit affordance (`stepper.unitHint`) is OPT-IN per field, because the
// WIRE decides which keys take `25mm`. Pinned AT the site: an optional prop
// whose default is the disabled value can be dropped in a refactor with no
// type error, no lint and no red test.

describe('CharGridSection unit affordance', () => {
  // A BARE cellSize on purpose: the shipped fixture authors `9mm`, which
  // spells its own unit — no badge, and so no invitation to change it. The
  // affordance exists for the value whose `pt` is invisible.
  it('invites another unit on a bare cell size', () => {
    draw({ ...GRID, grid: { ...GRID.grid, cellSize: 24 } });
    openLayout();
    expect(unitHintsFor('Cell size').length).toBeGreaterThan(0);
  });
});

// Every refusal class of `countOp`, at the field the item was filed against.
// A refused commit authors nothing (it always did) AND now takes the rejected
// text back off the screen (it did not).
//
// Driven through the REAL editor, not the mock controller the rest of this
// file uses, and that is load-bearing. Against a mock the document never
// moves, so the field reseeds to the fixture value after EVERY blur and a
// "snaps back to 20" assertion cannot fail — it would hold just as well for an
// implementation that accepted the garbage. Only a live document makes the
// accepted case show a DIFFERENT value, which is what gives the refused case
// its contrast.

const LIVE_GRID = `sections:
  body:
    type: flow
    items:
      - type: char_grid
        data: { key: manuscript }
        grid: { charsPerLine: 20, lines: 10 }
`;

function LiveHarness() {
  const editor = useEditor(LIVE_GRID);
  return (
    <I18nProvider locale="en">
      <PropertyPanel controller={editor} path={P} />
      <pre data-testid="doc">{editor.text}</pre>
      <button type="button" data-testid="undo" onClick={editor.undo}>
        undo
      </button>
    </I18nProvider>
  );
}

const liveDoc = () => screen.getByTestId('doc').textContent ?? '';
const cellsField = () => screen.getByLabelText('Cells per line') as HTMLInputElement;

describe('CharGridSection refusal snap-back', () => {
  const REFUSED: readonly (readonly [string, string])[] = [
    ['empty', ''],
    ['non-integer', 'abc'],
    ['a fraction', '2.5'],
    ['below the floor', '0'],
    ['past the layout cap', '4097'],
  ];

  for (const [label, typed] of REFUSED) {
    it(`snaps back and authors nothing for ${label}`, () => {
      render(<LiveHarness />);
      openLayout();
      const before = liveDoc();
      fireEvent.change(cellsField(), { target: { value: typed } });
      fireEvent.blur(cellsField());
      expect(liveDoc()).toBe(before);
      expect(cellsField().value).toBe('20');
    });
  }

  it('shows the NEW value for an accepted count — the contrast the refusals need', () => {
    render(<LiveHarness />);
    openLayout();
    fireEvent.change(cellsField(), { target: { value: '24' } });
    fireEvent.blur(cellsField());
    expect(liveDoc()).toContain('charsPerLine: 24');
    expect(cellsField().value).toBe('24');
  });

  it('mints no undo step for a refused count', () => {
    render(<LiveHarness />);
    openLayout();
    const before = liveDoc();
    fireEvent.change(cellsField(), { target: { value: '0' } });
    fireEvent.blur(cellsField());
    fireEvent.click(screen.getByTestId('undo'));
    expect(liveDoc()).toBe(before);
  });

  it('keeps the value at the cap itself, which is accepted rather than refused', () => {
    render(<LiveHarness />);
    openLayout();
    fireEvent.change(cellsField(), { target: { value: '4096' } });
    fireEvent.blur(cellsField());
    expect(liveDoc()).toContain('charsPerLine: 4096');
    expect(cellsField().value).toBe('4096');
  });

  it('reseeds a REFUSED field without disturbing a sibling being typed into', () => {
    // The nonce is per-field, so one field taking its text back must not throw
    // away what is half-typed next to it.
    render(<LiveHarness />);
    openLayout();
    const lines = screen.getByLabelText('Lines') as HTMLInputElement;
    fireEvent.change(lines, { target: { value: '77' } });
    const cells = screen.getByLabelText('Cells per line') as HTMLInputElement;
    fireEvent.change(cells, { target: { value: '0' } });
    fireEvent.blur(cells);
    expect((screen.getByLabelText('Cells per line') as HTMLInputElement).value).toBe('20');
    expect((screen.getByLabelText('Lines') as HTMLInputElement).value).toBe('77');
  });

  it('steps from the COMMITTED value after a refusal, with the ▲ still clickable', () => {
    // The nonce rides the inner input, never the widget: keying the whole
    // StepperField would unmount the ▲ between its mousedown and mouseup and
    // the click would never land. Typing garbage first is what makes the
    // preceding blur a refusal, so this is the ordering that pins it.
    render(<LiveHarness />);
    openLayout();
    fireEvent.change(cellsField(), { target: { value: 'abc' } });
    fireEvent.blur(cellsField());
    fireEvent.click(stepButton('Cells per line', 'Increase'));
    expect(liveDoc()).toContain('charsPerLine: 21');
  });

  it('does not reseed a grid LENGTH, which clears rather than refusing', () => {
    // `gridLengthOp` never returns null — an empty cell size is a real edit
    // (it hands the key back to the engine). Asserting the non-reseed keeps a
    // future "make everything reseed" change from turning a clear into a
    // silent revert.
    const controller = draw({ ...GRID, grid: { ...GRID.grid, cellSize: '9mm' } });
    openLayout();
    const cell = screen.getByLabelText('Cell size') as HTMLInputElement;
    fireEvent.change(cell, { target: { value: '' } });
    fireEvent.blur(cell);
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'removeKey',
      path: P,
      keys: ['grid', 'cellSize'],
    });
  });
});

// The INK controls (`CharGridInkFields`), driven through the same real panel. They
// are the item's whole reason for existing: a genkoyoshi preset authors a ruling, a
// ruby size and a markup mode, and until now none of them had a control at all.
describe('CharGridSection — the ruling, ruby and kinsoku controls', () => {
  const RULING = { ...GRID, style: { borderWidth: 1, borderColor: '#b91c1c' }, rubySize: 6 };

  it('seeds every ink control from the document', () => {
    draw(RULING);
    openLayout();
    expect((screen.getByLabelText('Ruling width') as HTMLInputElement).value).toBe('1');
    expect((screen.getByLabelText('Ruby size') as HTMLInputElement).value).toBe('6');
    expect(screen.getByRole('button', { name: 'Ruling color' })).not.toBeNull();
  });

  it('says what an UNSET ruling width means, rather than leaving the field blank', () => {
    // The 0-vs-unset asymmetry is the whole of D2: an absent key draws 0.5pt and
    // an explicit 0 draws nothing. A blank field with no placeholder says neither.
    draw(GRID);
    openLayout();
    const width = screen.getByLabelText('Ruling width') as HTMLInputElement;
    expect(width.value).toBe('');
    expect(width.placeholder).toBe('0.5');
    expect(screen.getByText(/0 draws none/)).not.toBeNull();
  });

  it('authors a typed ruling width', () => {
    const controller = draw(GRID);
    openLayout();
    fireEvent.blur(screen.getByLabelText('Ruling width'), { target: { value: '2' } });
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: P,
      keys: ['style', 'borderWidth'],
      value: 2,
    });
  });

  it('turns the ruling OFF from the menu, with no typing at all', () => {
    // D2's decision, end to end: `0` is a labelled row rather than a magic number
    // the author has to know to type.
    const controller = draw(GRID);
    openLayout();
    fireEvent.click(screen.getByRole('button', { name: /Choose a value for Ruling width/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /no ruling/ }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: P,
      keys: ['style', 'borderWidth'],
      value: 0,
    });
  });

  it('returns the width to its default from the menu, by REMOVING the key', () => {
    const controller = draw(RULING);
    openLayout();
    fireEvent.click(screen.getByRole('button', { name: /Choose a value for Ruling width/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /leave unset/ }));
    const op = (controller.apply as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(JSON.stringify(op)).toContain('remove');
  });

  it('distinguishes TYPING the default from PICKING the row that clears it', () => {
    // C8. Both land on 0.5pt, and until the row was relabelled both read as the
    // same choice: typing `0.5` AUTHORS `borderWidth: 0.5`, while the row hands
    // the key back to the engine. Both are defensible — the typed one is the
    // expert path, the row is the minimal-wire one — so the row's own label is
    // what has to say which is which, and this pins the pair on ONE value so a
    // later edit cannot quietly make them the same op.
    const typed = draw(RULING);
    openLayout();
    fireEvent.blur(screen.getByLabelText('Ruling width'), { target: { value: '0.5' } });
    expect(typed.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: P,
      keys: ['style', 'borderWidth'],
      value: 0.5,
    });
    cleanup();
    const picked = draw(RULING);
    openLayout();
    fireEvent.click(screen.getByRole('button', { name: /Choose a value for Ruling width/ }));
    // The row is LABELLED by what picking it does, not by the value it lands on.
    fireEvent.click(screen.getByRole('menuitem', { name: /leave unset/ }));
    expect(picked.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'removeKey',
      path: P,
      keys: ['style', 'borderWidth'],
    });
  });

  it('gives the width and the ruby rows DIFFERENT notes for their unset value', () => {
    // Both rows remove their key, but they mean different values — an unset
    // ruling is 0.5pt and an unset ruby size is 0.4 of the cell. One string
    // served both and read as 「自動 既定」 on the ruby row, saying nothing about
    // what the default is. Pinned so the reuse cannot come back.
    draw(GRID);
    openLayout();
    fireEvent.click(screen.getByRole('button', { name: /Choose a value for Ruling width/ }));
    const widthNote = screen.getByRole('menuitem', { name: /^0\.5/ }).textContent ?? '';
    fireEvent.click(screen.getByRole('button', { name: /Choose a value for Ruby size/ }));
    const rubyNote = screen.getByRole('menuitem', { name: /^auto/ }).textContent ?? '';
    expect(widthNote).toContain('leave unset');
    expect(rubyNote).toContain('0.4 × the cell');
    expect(widthNote).not.toBe(rubyNote);
  });

  it('names the style a ruling width came from, when the item does not author it', () => {
    // The engine's `authored()` looks at `styleNames` before the item's own style,
    // so a width can be in effect that this item never wrote. Saying so is the
    // difference between "unset" and "set somewhere you are not looking".
    const controller = makeController({ ...GRID, styleNames: ['genkou'] });
    controller.read = (path: string) =>
      path === P
        ? { ...GRID, styleNames: ['genkou'] }
        : path === 'styles'
          ? { genkou: { borderWidth: 0.25 } }
          : undefined;
    render(
      <I18nProvider locale="en">
        <PropertyPanel controller={controller} path={P} gridStep={0} />
      </I18nProvider>,
    );
    openLayout();
    expect((screen.getByLabelText('Ruling width') as HTMLInputElement).value).toBe('0.25');
    // The HINT line, not any occurrence of the name: the styles picker below now
    // renders `genkou` as a checkbox label too, so a bare /genkou/ matches twice
    // and would pass even if the origin line had disappeared.
    expect(screen.getByText('From the named style “genkou”')).not.toBeNull();
    expect(screen.queryByText(/0 draws none/)).toBeNull();
  });

  it('authors a ruby size picked from the menu', () => {
    const controller = draw(GRID);
    openLayout();
    fireEvent.click(screen.getByRole('button', { name: /Choose a value for Ruby size/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /^6/ }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: P,
      keys: ['rubySize'],
      value: 6,
    });
  });

  it('authors a kinsoku change, and never authors the default', () => {
    const controller = draw(GRID);
    openLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Line-break rules' }));
    fireEvent.click(screen.getByRole('option', { name: 'None' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: P,
      keys: ['kinsoku'],
      value: 'none',
    });
  });

  it('authors a ruling colour picked from the shared palette', () => {
    const controller = draw(GRID);
    openLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Ruling color' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Red, shade 4 of 5' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: P,
      keys: ['style', 'borderColor'],
      value: '#b91c1c',
    });
  });

  it('shows a ruling colour authored as a per-side MAP, which the cascade reads as unset', () => {
    // The engine takes the map's top side for a grid. Reading through the generic
    // cascade instead would report this set colour as blank.
    draw({ ...GRID, style: { borderColor: { top: '#15803d' } } });
    openLayout();
    const chip = screen
      .getByRole('button', { name: 'Ruling color' })
      .querySelector('.sj-color-chip') as HTMLElement;
    expect(chip.style.backgroundColor).toBe('rgb(21, 128, 61)');
  });
});

// The ink ops over a REAL editor. Every assertion above runs against a mock
// controller and checks an `apply(...)` payload, which cannot see what the document
// actually becomes — and the wire is where these ops can go wrong: `borderWidth` is a
// bare pt number with no string form, so authoring text there is a serde type error
// rather than a diagnostic the engine degrades past. A mock records the op and says
// nothing about its shape on the page.
const LIVE_INK = `sections:
  body:
    type: flow
    items:
      - type: char_grid
        data: { key: manuscript }
        grid: { charsPerLine: 20, lines: 10 }
        style: { fontFamily: ipamj-mincho, borderColor: "#a8674f" }
`;

function LiveInkHarness() {
  const editor = useEditor(LIVE_INK);
  return (
    <I18nProvider locale="en">
      <PropertyPanel controller={editor} path={P} />
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

describe('CharGridSection — the ink ops over a real document', () => {
  const doc = () => screen.getByTestId('doc').textContent ?? '';

  it('authors a typed width as a NUMBER, never as the text that was typed', () => {
    // `.5` is the likeliest keystroke that `Number()` accepts and the length
    // builder's own regex does not — it would have been written as the string
    // `".5"`, and `BorderWidth` has no `visit_str` at all.
    render(<LiveInkHarness />);
    openLayout();
    fireEvent.blur(screen.getByLabelText('Ruling width'), { target: { value: '.5' } });
    expect(doc()).toContain('borderWidth: 0.5');
    // Scoped to the width's own value: the fixture quotes `borderColor` legitimately,
    // so a document-wide quote check would pass for the wrong reason.
    expect(doc()).not.toMatch(/borderWidth:\s*['"]/);
  });

  it('authors every accepted width as a number, for the whole gap between the two gates', () => {
    for (const [typed, written] of [
      ['.5', '0.5'],
      ['5.', '5'],
      ['+1', '1'],
      ['1e3', '1000'],
    ] as const) {
      const { unmount } = render(<LiveInkHarness />);
      openLayout();
      fireEvent.blur(screen.getByLabelText('Ruling width'), { target: { value: typed } });
      expect(doc(), typed).toContain(`borderWidth: ${written}`);
      unmount();
    }
  });

  it('leaves the item’s other style keys byte-exact when the ruling changes', () => {
    // The genkoyoshi items carry `fontFamily` and `borderColor` in the same `style`
    // map these ops write into.
    render(<LiveInkHarness />);
    openLayout();
    fireEvent.blur(screen.getByLabelText('Ruling width'), { target: { value: '1' } });
    expect(doc()).toContain('fontFamily: ipamj-mincho');
    expect(doc()).toContain('borderColor: "#a8674f"');
    expect(doc()).toContain('charsPerLine: 20');
  });

  it('REFUSES an over-cap width and writes nothing, and the field snaps back', () => {
    // Against a mock this cannot fail — the fixture never moves either way. Only a
    // live document makes the accepted case show a different value.
    render(<LiveInkHarness />);
    openLayout();
    fireEvent.blur(screen.getByLabelText('Ruling width'), { target: { value: '99999' } });
    expect(doc()).not.toContain('borderWidth');
    expect(doc()).toContain('borderColor');
    expect((screen.getByLabelText('Ruling width') as HTMLInputElement).value).toBe('');
  });

  it('removes the key when the width is cleared, rather than authoring the default', () => {
    render(<LiveInkHarness />);
    openLayout();
    fireEvent.blur(screen.getByLabelText('Ruling width'), { target: { value: '2' } });
    expect(doc()).toContain('borderWidth: 2');
    fireEvent.blur(screen.getByLabelText('Ruling width'), { target: { value: '' } });
    expect(doc()).not.toContain('borderWidth: 2');
    expect(doc()).not.toContain('borderWidth: 0.5');
  });

  it('authors a ruby size and a kinsoku change on the item, not inside its style', () => {
    render(<LiveInkHarness />);
    openLayout();
    fireEvent.blur(screen.getByLabelText('Ruby size'), { target: { value: '6' } });
    expect(doc()).toContain('rubySize: 6');
    fireEvent.click(screen.getByRole('button', { name: 'Line-break rules' }));
    fireEvent.click(screen.getByRole('option', { name: 'None' }));
    expect(doc()).toContain('kinsoku: none');
  });

  it('reads an own per-side map as the engine does, and does NOT fall through to the style', () => {
    // `authored()` replaces by key PRESENCE: an own `borderWidth` of any shape wins
    // and the named styles are never consulted. A map with no `top` gives
    // `sides()[0] = 0`, so the engine draws NO ruling — a panel that fell through on
    // an empty display would show the style's `2` and name it, contradicting the
    // canvas beside it.
    const controller = makeController(null);
    controller.read = (path: string) =>
      path === P
        ? { ...GRID, styleNames: ['frame'], style: { borderWidth: { bottom: 1 } } }
        : path === 'styles'
          ? { frame: { borderWidth: 2 } }
          : undefined;
    render(
      <I18nProvider locale="en">
        <PropertyPanel controller={controller} path={P} gridStep={0} />
      </I18nProvider>,
    );
    openLayout();
    expect((screen.getByLabelText('Ruling width') as HTMLInputElement).value).toBe('');
    // No ORIGIN line. `frame` still appears as a styles checkbox — that is the
    // picker doing its job, and asserting on the bare name would now be asserting
    // the picker is absent.
    expect(screen.queryByText(/From the named style/)).toBeNull();
  });
});

// M10 — the `?` on the fields whose NAME does not carry their meaning. The list is
// a criterion, not a taste: a reader with little IT background cannot infer what
// 「ruling width」 does from those two words, and cannot infer 「kinsoku」 at all.
// `Cell size` is deliberately excluded — its name says it, and the non-obvious part
// of its BEHAVIOUR is already in the section's own hint line.
describe('CharGridSection field help', () => {
  const HELPED: readonly (readonly [string, string])[] = [
    ['ruling width', 'The lines that draw the cells'],
    ['ruby size', 'The reading printed beside a kanji'],
    ['kinsoku', 'Characters that may not open a line'],
    ['styleNames', 'Styles defined once, applied here'],
  ];

  for (const [field, title] of HELPED) {
    it(`offers a ? on ${field}`, () => {
      draw(GRID);
      openLayout();
      expect(screen.getByRole('button', { name: title })).not.toBeNull();
    });
  }

  it('explains the field when the ? is opened, rather than only naming it', () => {
    // The title and the body are two catalog keys. A component wired to the right
    // title and the wrong body segment renders the KEY as its own text, and nothing
    // else in the suite would see it.
    draw(GRID);
    openLayout();
    fireEvent.click(screen.getByRole('button', { name: 'Characters that may not open a line' }));
    expect(screen.getByText(/pulling the character back onto the line before it/)).not.toBeNull();
  });

  it('gives Cell size NO ?, leaving only its steppers', () => {
    draw(GRID);
    openLayout();
    const row = screen.getByLabelText('Cell size').parentElement?.parentElement as HTMLElement;
    // Exactly the two steppers and nothing else. Counting is what makes this a
    // real negative: asserting "no button called X" passes for any X.
    expect(within(row).getAllByRole('button')).toHaveLength(2);
    expect(within(row).getByRole('button', { name: 'Increase' })).not.toBeNull();
    expect(within(row).getByRole('button', { name: 'Decrease' })).not.toBeNull();
  });
});

// M11 — `styleNames` reaches a type with no decoration tab. The engine honours it on
// a char_grid (it is where `fontSize`/`borderWidth`/`textAlign` resolve from), and
// before this the only picker lived on a tab this type does not get.
describe('CharGridSection named styles', () => {
  function withStyles(node: unknown, styles: unknown): EditorController {
    const controller = makeController(node);
    controller.read = (path: string) =>
      path === P ? node : path === 'styles' ? styles : undefined;
    render(
      <I18nProvider locale="en">
        <PropertyPanel controller={controller} path={P} gridStep={0} />
      </I18nProvider>,
    );
    return controller;
  }

  it('offers the registry names on the PLACEMENT tab, ticked as the item authors them', () => {
    withStyles({ ...GRID, styleNames: ['genkou'] }, { genkou: {}, plain: {} });
    openLayout();
    expect((screen.getByRole('checkbox', { name: 'genkou' }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((screen.getByRole('checkbox', { name: 'plain' }) as HTMLInputElement).checked).toBe(
      false,
    );
  });

  it('authors a style pick from that tab', () => {
    const controller = withStyles({ ...GRID, styleNames: ['genkou'] }, { genkou: {}, plain: {} });
    openLayout();
    fireEvent.click(screen.getByRole('checkbox', { name: 'plain' }));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setStrings',
      path: P,
      keys: ['styleNames'],
      values: ['genkou', 'plain'],
    });
  });

  it('sits at the FOOT of the section, after the ink controls', () => {
    // M11's clause, and a green run says nothing about it: the picker could
    // render first and every other assertion here would still pass. It belongs
    // last because it is the widest-reaching control in the section — what it
    // ticks decides where the fields above it resolve from.
    withStyles(GRID, { genkou: {} });
    openLayout();
    const group = screen.getByRole('group', { name: 'Styles' });
    const section = group.closest('section') as HTMLElement;
    const blocks = [...section.children];
    // The hint paragraph is the section's last child; the picker is the last
    // CONTROL before it.
    expect(blocks.indexOf(group)).toBe(blocks.length - 2);
    expect(section.lastElementChild?.textContent).toContain('the drawn size comes from the cells');
  });

  it('names the group by its label even with the ? beside it', () => {
    withStyles(GRID, { genkou: {} });
    openLayout();
    expect(screen.getByRole('group', { name: 'Styles' })).not.toBeNull();
  });
});

// M12 — the ruling colour sits beside the ruling width, not in a column of its own.
// The two are one decision (how the grid is inked) and the section is a two-column
// grid; a layout that separated them would be green on every other assertion here.
describe('CharGridSection ink layout', () => {
  it('puts the ruling colour immediately after the ruling width, in one row', () => {
    draw(GRID);
    openLayout();
    // input → the relative wrapper → the flex row → the field block
    const widthBlock = screen.getByLabelText('Ruling width').parentElement?.parentElement
      ?.parentElement as HTMLElement;
    const next = widthBlock.nextElementSibling as HTMLElement;
    expect(within(next).getByRole('button', { name: 'Ruling color' })).not.toBeNull();
    expect(widthBlock.parentElement?.className).toContain('grid-cols-2');
  });
});

// M7 — what colour is set, in words, with the popover CLOSED. Carried over from
// #190, where it was dropped: the trigger chrome is caller-owned, so the line
// belongs to the field rather than to the shared widget.
describe('CharGridSection ruling colour readout', () => {
  it('names the authored colour beside the chip, without opening the palette', () => {
    draw({ ...GRID, style: { borderColor: '#15803d' } });
    openLayout();
    expect(screen.getByText('Green, shade 4 of 5')).not.toBeNull();
    expect(screen.getByText('#15803d')).not.toBeNull();
  });

  it('says the colour is unset rather than leaving the chip to speak for itself', () => {
    draw(GRID);
    openLayout();
    expect(screen.getByText('Not set')).not.toBeNull();
  });

  it('reads a per-side MAP the same way the chip paints it', () => {
    // The engine takes the top side for a grid, and the chip already follows that.
    // A readout reading through the generic cascade would call this set colour
    // unset while the square beside it showed green.
    draw({ ...GRID, style: { borderColor: { top: '#15803d' } } });
    openLayout();
    expect(screen.getByText('Green, shade 4 of 5')).not.toBeNull();
  });
});

// C4 — the negative the section was built around, pinned rather than left to
// structure. `authored()` consults `styleNames` and the item's own style and stops:
// no document defaults, no inheritance. A control that badged a defaults value here
// would report a width the engine does not use for this item.
describe('CharGridSection origin honesty', () => {
  it('stays UNSET against a document default, and names no origin', () => {
    const controller = makeController(GRID);
    controller.read = (path: string) =>
      path === P
        ? GRID
        : path === 'defaults'
          ? { style: { borderWidth: 3, borderColor: '#b91c1c' } }
          : undefined;
    render(
      <I18nProvider locale="en">
        <PropertyPanel controller={controller} path={P} gridStep={0} />
      </I18nProvider>,
    );
    openLayout();
    const width = screen.getByLabelText('Ruling width') as HTMLInputElement;
    expect(width.value).toBe('');
    // The colour is unset too, and both say so rather than showing the default.
    expect(screen.getByText('Not set')).not.toBeNull();
    // Nothing in the ink block claims the value came from anywhere. Scoped to that
    // block on purpose: the styles picker below renders its own '(default)' for an
    // empty registry, and a page-wide negative would be answered by that string
    // instead of by the absence this case is about.
    const ink = width.parentElement?.parentElement?.parentElement?.parentElement as HTMLElement;
    expect(within(ink).queryByText(/From the named style/)).toBeNull();
    expect(within(ink).queryByText(/inherited/i)).toBeNull();
    expect(within(ink).queryByText(/default/i)).toBeNull();
  });
});

// M13 — the ruby/markup switch, on the CONTENT tab because it decides what the
// content MEANS. Double-gated: the type carries the key, and an engine without the
// grammar rejects the value.
describe('char_grid markup toggle', () => {
  const openContent = () => fireEvent.click(screen.getByRole('tab', { name: 'Content' }));
  const LABEL = 'Read ruby notation in the content';

  it('is offered on the content tab, off for a document that does not author it', () => {
    draw(GRID, ['char_grid', 'char_grid.markup.aozora']);
    openContent();
    expect((screen.getByRole('checkbox', { name: LABEL }) as HTMLInputElement).checked).toBe(false);
  });

  it('is ON for the genkoyoshi shape — the preset that authors it', () => {
    draw({ ...GRID, markup: 'aozora' }, ['char_grid', 'char_grid.markup.aozora']);
    openContent();
    expect((screen.getByRole('checkbox', { name: LABEL }) as HTMLInputElement).checked).toBe(true);
  });

  it('says what turning it on does to bound data', () => {
    // The engine's posture is that user data is never interpreted by default. The
    // one control that opts out of that says what it is opting out of.
    draw(GRID, ['char_grid', 'char_grid.markup.aozora']);
    openContent();
    expect(screen.getByText(/makes those marks meaningful in bound data/)).not.toBeNull();
  });

  it('puts the safety sentence BELOW the toggle, not above it', () => {
    // The clause M13 actually carries. A sentence rendered above the control it
    // qualifies is read before the reader knows what it is about, and every
    // other assertion in this block passes either way.
    draw(GRID, ['char_grid', 'char_grid.markup.aozora']);
    openContent();
    const box = screen.getByRole('checkbox', { name: LABEL });
    const label = box.closest('label') as HTMLElement;
    const block = box.closest('div') as HTMLElement;
    const copy = screen.getByText(/makes those marks meaningful in bound data/);
    expect(block.contains(copy)).toBe(true);
    // FOLLOWING, not merely "present": the sentence qualifies the control, and
    // a reader who meets it first does not yet know what it is about.
    expect(label.compareDocumentPosition(copy) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('authors the one legal value when switched on', () => {
    const controller = draw(GRID, ['char_grid', 'char_grid.markup.aozora']);
    openContent();
    fireEvent.click(screen.getByRole('checkbox', { name: LABEL }));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: P,
      keys: ['markup'],
      value: 'aozora',
    });
  });

  it('REMOVES the key when switched off, never authoring a third value', () => {
    const controller = draw({ ...GRID, markup: 'aozora' }, [
      'char_grid',
      'char_grid.markup.aozora',
    ]);
    openContent();
    fireEvent.click(screen.getByRole('checkbox', { name: LABEL }));
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'removeKey',
      path: P,
      keys: ['markup'],
    });
  });

  it('is ABSENT against an engine without the aozora grammar', () => {
    // Present with the base capability but not the markup one — the on/off pair
    // that proves the gate is the markup key and not the section's.
    draw(GRID, ['char_grid']);
    openContent();
    expect(screen.queryByRole('checkbox', { name: LABEL })).toBeNull();
  });

  it('is ABSENT on a type that has no such key', () => {
    draw({ type: 'text', text: 'hi' }, ['char_grid', 'char_grid.markup.aozora']);
    fireEvent.click(screen.getByRole('tab', { name: 'Content' }));
    expect(screen.queryByRole('checkbox', { name: LABEL })).toBeNull();
  });
});

// The markup switch over a REAL document. A mock records the op and says nothing
// about the bytes; `markup` is a serde enum with one variant, so the shape of what
// is written is the thing that can break.
const LIVE_MARKUP = `sections:
  body:
    type: flow
    items:
      - type: char_grid
        data: { key: manuscript }
        grid: { charsPerLine: 20, lines: 10 }
        rubySize: 6
`;

function MarkupHarness() {
  const editor = useEditor(LIVE_MARKUP);
  return (
    <I18nProvider locale="en">
      <PropertyPanel
        controller={editor}
        path={P}
        capabilities={['char_grid', 'char_grid.markup.aozora']}
      />
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

describe('char_grid markup over a live document', () => {
  const LABEL = 'Read ruby notation in the content';
  const toggle = () => screen.getByRole('checkbox', { name: LABEL }) as HTMLInputElement;

  it('writes the bare enum spelling, not a quoted string or a map', () => {
    render(<MarkupHarness />);
    fireEvent.click(screen.getByRole('tab', { name: 'Content' }));
    fireEvent.click(toggle());
    expect(screen.getByTestId('doc').textContent).toContain('markup: aozora');
  });

  it('round-trips to the SAME bytes when switched off and on again', () => {
    // A non-event: two edits that cancel must leave the file byte-identical, or the
    // author who changed their mind has a diff to explain. Nothing about coverage
    // can see this — neither direction leaves a line uncovered.
    render(<MarkupHarness />);
    fireEvent.click(screen.getByRole('tab', { name: 'Content' }));
    const before = screen.getByTestId('doc').textContent ?? '';
    fireEvent.click(toggle());
    fireEvent.click(toggle());
    expect(screen.getByTestId('doc').textContent).toBe(before);
  });

  it('leaves the item’s other keys byte-exact', () => {
    render(<MarkupHarness />);
    fireEvent.click(screen.getByRole('tab', { name: 'Content' }));
    fireEvent.click(toggle());
    const doc = screen.getByTestId('doc').textContent ?? '';
    expect(doc).toContain('grid: { charsPerLine: 20, lines: 10 }');
    expect(doc).toContain('rubySize: 6');
    expect(doc).toContain('data: { key: manuscript }');
  });
});

// B1 — the `styleNames` writes over a REAL document. Every assertion above runs
// against a mock and checks an `apply()` payload, which cannot see what the file
// becomes — the exact gap #191 was pulled up on. This is also the first time
// `setStrings` lands at a char_grid item ROOT, beside the flow-style maps
// (`grid`, `data`) that a re-serialization would rewrite.
const LIVE_STYLED = `styles:
  genkou: { borderWidth: 0.25 }
  plain: { borderColor: "#15803d" }
sections:
  body:
    type: flow
    items:
      - type: char_grid
        data: { key: manuscript }
        grid: { charsPerLine: 20, lines: 10 }
        markup: aozora
        rubySize: 6
`;

function StyledHarness() {
  const editor = useEditor(LIVE_STYLED);
  return (
    <I18nProvider locale="en">
      <PropertyPanel controller={editor} path={P} capabilities={['char_grid']} />
      <pre data-testid="doc">{editor.text}</pre>
    </I18nProvider>
  );
}

describe('char_grid named styles over a live document', () => {
  const tick = (name: string) =>
    fireEvent.click(screen.getByRole('checkbox', { name }) as HTMLInputElement);

  it('writes the names in the order they were ticked — the order the engine reads', () => {
    // `authored()` takes the LAST matching name, so this sequence is meaning,
    // not presentation. The list itself renders in registry order, which is a
    // different thing and is pinned separately.
    render(<StyledHarness />);
    openLayout();
    tick('plain');
    tick('genkou');
    expect(screen.getByTestId('doc').textContent).toContain('styleNames: [ plain, genkou ]');
  });

  it('round-trips to the SAME bytes when the last name is unticked', () => {
    // A non-event: `setStrings` then `removeKey` must leave no residue — not an
    // empty `styleNames: []`, and not a re-flowed sibling.
    render(<StyledHarness />);
    openLayout();
    const before = screen.getByTestId('doc').textContent ?? '';
    tick('genkou');
    tick('genkou');
    expect(screen.getByTestId('doc').textContent).toBe(before);
  });

  it('leaves the item’s other keys byte-exact', () => {
    render(<StyledHarness />);
    openLayout();
    tick('genkou');
    const doc = screen.getByTestId('doc').textContent ?? '';
    expect(doc).toContain('grid: { charsPerLine: 20, lines: 10 }');
    expect(doc).toContain('data: { key: manuscript }');
    expect(doc).toContain('markup: aozora');
    expect(doc).toContain('rubySize: 6');
  });
});
