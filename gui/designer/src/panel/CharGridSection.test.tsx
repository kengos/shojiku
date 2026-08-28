// The char_grid editing surface, driven through PropertyPanel — the tabs a
// char_grid gets, the controls in each, and the two things the panel must NOT
// offer for this type.
//
// Before this, a char_grid was in NEITHER the content-tab set nor the
// decoration set, so a preset's manuscript paper had no content surface at all
// and no way to change the one thing that decides its drawn size.

import { fireEvent, render, screen, within } from '@testing-library/react';
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
    expect(screen.getByRole('button', { name: 'Ruling colour' })).not.toBeNull();
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
    fireEvent.click(screen.getByRole('menuitem', { name: /default/ }));
    const op = (controller.apply as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(JSON.stringify(op)).toContain('remove');
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
    expect(screen.getByText(/genkou/)).not.toBeNull();
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
    fireEvent.click(screen.getByRole('button', { name: 'Ruling colour' }));
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
      .getByRole('button', { name: 'Ruling colour' })
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
    expect(screen.queryByText(/frame/)).toBeNull();
  });
});
