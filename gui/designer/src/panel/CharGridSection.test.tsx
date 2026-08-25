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
