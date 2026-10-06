import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { EditorController } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import { unitHintsFor } from '../testkit/unitHint';
import { LayoutSection } from './LayoutSection';
import { containerLayoutFor } from './layoutModel';
import { ParentContainerCard } from './ParentContainerCard';

const PATH = 'sections.body.items[0]';

function makeController(reads: Record<string, unknown>): EditorController {
  return {
    text: '',
    revision: 0,
    selection: null,
    canUndo: false,
    canRedo: false,
    apply: vi.fn(() => ({ ok: true as const })),
    applyAll: vi.fn(() => ({ ok: true as const })),
    read: (path: string) => reads[path],
    undo: vi.fn(),
    redo: vi.fn(),
    select: vi.fn(),
    clearSelection: vi.fn(),
    setMaxBytes: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    replaceDocument: vi.fn(),
  };
}

function draw(node: ReactElement) {
  return render(<I18nProvider locale="en">{node}</I18nProvider>);
}

function rowController(
  box: Record<string, unknown> = { direction: 'row' },
  items: unknown[] = [{ type: 'text' }, { type: 'text' }],
) {
  return makeController({ [PATH]: { type: 'container', box, items } });
}

function layoutOf(controller: EditorController) {
  const layout = containerLayoutFor(controller.read, PATH);
  if (layout === null) {
    throw new Error('fixture is not a container');
  }
  return layout;
}

function drawSection(controller: EditorController, capabilities?: readonly string[]) {
  draw(
    <LayoutSection
      controller={controller}
      path={PATH}
      layout={layoutOf(controller)}
      capabilities={capabilities}
    />,
  );
}

/** Every capability the layout controls gate on, minus `without`. */
function capsWithout(...without: string[]): string[] {
  return ['box.grid', 'grid.fr', 'grid.auto', 'box.alignItems.baseline', 'box.flexBasis'].filter(
    (key) => !without.includes(key),
  );
}

/** The ops of the n-th `applyAll` call. */
function batchAt(controller: EditorController, n = 0): unknown[] {
  return (controller.applyAll as ReturnType<typeof vi.fn>).mock.calls[n][0];
}

describe('LayoutSection (flex)', () => {
  it('dispatches ONE batch holding the direction op when the segment crosses', () => {
    const controller = rowController();
    drawSection(controller);
    fireEvent.click(screen.getByLabelText('Stacked'));
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: PATH, keys: ['box', 'direction'], value: 'column' },
    ]);
  });

  it('dispatches ONE direction op crossing column → row too', () => {
    const controller = rowController({ direction: 'column' });
    drawSection(controller);
    fireEvent.click(screen.getByLabelText('Side by side'));
    expect(controller.applyAll).toHaveBeenCalledWith([
      { op: 'setScalar', path: PATH, keys: ['box', 'direction'], value: 'row' },
    ]);
  });

  it('dispatches nothing on a re-pick of the current arrangement (native radio)', () => {
    const controller = rowController();
    drawSection(controller);
    fireEvent.click(screen.getByLabelText('Side by side'));
    expect(controller.apply).not.toHaveBeenCalled();
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('commits the gap on blur only when changed', () => {
    const controller = rowController({ direction: 'row', gap: 8 });
    drawSection(controller);
    const input = screen.getByLabelText('Spacing') as HTMLInputElement;
    // A tab-through of the seeded value authors nothing (the changed guard).
    fireEvent.blur(input);
    expect(controller.apply).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '12' } });
    fireEvent.blur(input);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'gap'],
      value: 12,
    });
  });

  it('drops a hostile gap commit (no op dispatched)', () => {
    const controller = rowController();
    drawSection(controller);
    const input = screen.getByLabelText('Spacing') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Infinity' } });
    fireEvent.blur(input);
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('steps an unset gap up from 0 via the ▲ button', () => {
    const controller = rowController({ direction: 'row' });
    drawSection(controller);
    fireEvent.click(screen.getByLabelText('Increase Spacing'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'gap'],
      value: 1,
    });
  });

  it('marks the effective alignment active and authors a different pick', () => {
    const controller = rowController();
    drawSection(controller);
    // Unset alignItems reads as the engine default stretch.
    expect(screen.getByLabelText('Stretch to fill').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByLabelText('Align middle (top–bottom)'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'alignItems'],
      value: 'center',
    });
  });

  it('dispatches nothing on a re-pick of the active alignment (minimal wire)', () => {
    const controller = rowController({ direction: 'row', alignItems: 'center' });
    drawSection(controller);
    fireEvent.click(screen.getByLabelText('Align middle (top–bottom)'));
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('commits a ratio edit as the child flexGrow, with a changed guard', () => {
    const controller = rowController({ direction: 'row' }, [
      { type: 'text' },
      { type: 'text', box: { flexGrow: 2 } },
    ]);
    drawSection(controller);
    const first = screen.getByLabelText('Ratio 1') as HTMLInputElement;
    // Unset: empty, with the placeholder saying the engine decides.
    expect(first.defaultValue).toBe('');
    expect(first.placeholder).toBe('auto');
    expect((screen.getByLabelText('Ratio 2') as HTMLInputElement).defaultValue).toBe('2');
    fireEvent.blur(first);
    expect(controller.apply).not.toHaveBeenCalled();
    fireEvent.change(first, { target: { value: '3' } });
    fireEvent.blur(first);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${PATH}.items[0]`,
      keys: ['box', 'flexGrow'],
      value: 3,
    });
  });

  it('drops a hostile ratio commit (negative) without dispatching', () => {
    const controller = rowController();
    drawSection(controller);
    const first = screen.getByLabelText('Ratio 1') as HTMLInputElement;
    fireEvent.change(first, { target: { value: '-1' } });
    fireEvent.blur(first);
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('renders a width-authored child as a fixed-width chip, not an input', () => {
    const controller = rowController({ direction: 'row' }, [
      { type: 'text', box: { w: 120 } },
      { type: 'text' },
    ]);
    drawSection(controller);
    expect(screen.getByText('Fixed width')).toBeTruthy();
    // The fixed child consumes slot 1; the editable input is the second slot.
    expect(screen.getByLabelText('Ratio 2')).toBeTruthy();
    expect(screen.queryByLabelText('Ratio 1')).toBeNull();
  });

  it('appends a placeholder slot via ONE insertItem', () => {
    const controller = rowController();
    drawSection(controller);
    fireEvent.click(screen.getByText('Add slot'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'insertItem',
      path: `${PATH}.items`,
      index: 2,
      value: { type: 'text', text: 'Text' },
    });
  });

  it('shows the ratio row in a stack too, sharing HEIGHT, with 0 as the unset placeholder', () => {
    const controller = rowController({ direction: 'column' }, [
      { type: 'text' },
      { type: 'text', box: { h: 30 } },
    ]);
    drawSection(controller);
    const first = screen.getByLabelText('Ratio 1') as HTMLInputElement;
    // In a stack an unset weight IS 0 in the engine, so the placeholder says so.
    expect(first.placeholder).toBe('0');
    // The fixed axis follows the arrangement: a height takes a stack slot out.
    expect(screen.getByText('Fixed height')).toBeTruthy();
    expect(screen.queryByText('Fixed width')).toBeNull();
    expect(screen.getByText(/Leftover height is shared/)).toBeTruthy();
    fireEvent.change(first, { target: { value: '2' } });
    fireEvent.blur(first);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${PATH}.items[0]`,
      keys: ['box', 'flexGrow'],
      value: 2,
    });
  });

  it('gives no ratio input to a child the engine does not lay out by flex', () => {
    // A line has no box on the wire (a flex key on it does not parse), and a
    // positioned child is outside the split: neither gets an input, so the
    // inputs number only the children that share the space.
    const controller = rowController({ direction: 'column' }, [
      { type: 'line', from: { x: 0, y: 0 }, to: { x: 9, y: 0 } },
      { type: 'text' },
      { type: 'text', box: { x: 3 } },
    ]);
    drawSection(controller);
    expect(screen.getByLabelText('Ratio 1')).toBeTruthy();
    expect(screen.queryByLabelText('Ratio 2')).toBeNull();
    fireEvent.change(screen.getByLabelText('Ratio 1'), { target: { value: '2' } });
    fireEvent.blur(screen.getByLabelText('Ratio 1'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: `${PATH}.items[1]`,
      keys: ['box', 'flexGrow'],
      value: 2,
    });
  });

  it('shows no ratio row when no child is laid out by flex', () => {
    drawSection(
      rowController({ direction: 'row' }, [
        { type: 'line', from: { x: 0, y: 0 }, to: { x: 9, y: 0 } },
      ]),
    );
    expect(screen.queryByText('Ratio')).toBeNull();
  });

  it('shows no ratio row for an empty container', () => {
    drawSection(rowController({ direction: 'row' }, []));
    expect(screen.queryByText('Ratio')).toBeNull();
  });
});

describe('LayoutSection (grid)', () => {
  /** A 2×2 grid whose cells are the given texts (placeholder = 'Text', the en
   * scaffold default). */
  function gridController(cellTexts: readonly string[], columns = 2) {
    return rowController(
      { type: 'grid', columns },
      cellTexts.map((text) => ({ type: 'text', text })),
    );
  }

  /** The ▲/▼ of the stepper labeled `label`. Each button now NAMES its field,
   * so the pair is addressable directly; the wrapper scoping stays because it
   * also proves the buttons belong to that field's row. */
  function stepButtons(label: string) {
    const input = screen.getByLabelText(label);
    const wrap = input.parentElement?.parentElement as HTMLElement;
    return {
      up: within(wrap).getByLabelText(`Increase ${label}`),
      down: within(wrap).getByLabelText(`Decrease ${label}`),
    };
  }

  it('renders the arrangement, gap, the 列/行 steppers and the cell alignment — no ratio/add-slot', () => {
    const controller = gridController(['a', 'b', 'c', 'd'], 3);
    drawSection(controller);
    expect(screen.getByLabelText('Columns')).toBeTruthy();
    expect(screen.getByLabelText('Rows')).toBeTruthy();
    // A grid spaces each axis on its own; the single both-axes field is gone.
    expect(screen.getByLabelText('Column spacing')).toBeTruthy();
    expect(screen.getByLabelText('Row spacing')).toBeTruthy();
    expect(screen.queryByLabelText('Spacing')).toBeNull();
    // The arrangement segment shows in a grid too, with the grid picked.
    expect((screen.getByLabelText('Table grid') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('Align children')).toBeTruthy();
    expect(screen.queryByText('Ratio')).toBeNull();
    expect(screen.queryByText('Add slot')).toBeNull();
  });

  it('omits the steppers when the column count is unresolvable', () => {
    const controller = rowController({ type: 'grid', columns: 'garbage' });
    drawSection(controller);
    expect(screen.queryByLabelText('Columns')).toBeNull();
    expect(screen.queryByLabelText('Rows')).toBeNull();
  });

  it('a 列 step up dispatches ONE batch that pads rows and rewrites columns', () => {
    const controller = gridController(['a', 'b', 'c', 'd']);
    drawSection(controller);
    fireEvent.click(stepButtons('Columns').up);
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    const ops = (controller.applyAll as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ops.at(-1)).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'columns'],
      value: 3,
    });
  });

  it('a 行 step up dispatches ONE batch of placeholder appends (no rows key)', () => {
    const controller = gridController(['a', 'b', 'c', 'd']);
    drawSection(controller);
    fireEvent.click(stepButtons('Rows').up);
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    const ops = (controller.applyAll as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ops).toHaveLength(2);
    expect(ops.every((op: { op: string }) => op.op === 'insertItem')).toBe(true);
  });

  it('an all-placeholder shrink applies silently (no confirm dialog)', () => {
    const controller = gridController(['Text', 'Text', 'Text', 'Text']);
    drawSection(controller);
    fireEvent.click(stepButtons('Rows').down);
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a content-dropping shrink holds behind a confirm; confirming applies, one batch', () => {
    const controller = gridController(['a', 'b', 'c', 'd']);
    drawSection(controller);
    fireEvent.click(stepButtons('Rows').down);
    // Held: nothing dispatched yet, the confirm is up.
    expect(controller.applyAll).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByText('Remove'));
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
  });

  it('cancelling the confirm dispatches nothing', () => {
    const controller = gridController(['a', 'b', 'c', 'd']);
    drawSection(controller);
    fireEvent.click(stepButtons('Columns').down);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByText('Cancel'));
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('a typed count that rounds to the current value dispatches nothing (empty plan)', () => {
    const controller = gridController(['a', 'b', 'c', 'd']);
    drawSection(controller);
    fireEvent.blur(screen.getByLabelText('Columns'), { target: { value: '2.4' } });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('a CLEARED count field dispatches nothing on blur (Number("") is 0, not a count)', () => {
    // Clearing the field to retype must never collapse the grid to 1 column —
    // an empty/whitespace commit is a non-commit, not a shrink request.
    const controller = gridController(['a', 'b', 'c', 'd']);
    drawSection(controller);
    fireEvent.blur(screen.getByLabelText('Columns'), { target: { value: '' } });
    fireEvent.blur(screen.getByLabelText('Rows'), { target: { value: '   ' } });
    expect(controller.applyAll).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    // …and neither field is left blank over a grid that is still 2×2. This was
    // the partial-seed gap: the nonce here only ever bumped on the
    // confirm-modal path, never on the field's own refusals.
    expect((screen.getByLabelText('Columns') as HTMLInputElement).value).toBe('2');
    expect((screen.getByLabelText('Rows') as HTMLInputElement).value).toBe('2');
  });

  describe('grid count refusal snap-back', () => {
    it('snaps back a non-finite count', () => {
      const controller = gridController(['a', 'b', 'c', 'd']);
      drawSection(controller);
      const cols = () => screen.getByLabelText('Columns') as HTMLInputElement;
      fireEvent.blur(cols(), { target: { value: 'abc' } });
      expect(controller.applyAll).not.toHaveBeenCalled();
      expect(cols().value).toBe('2');
    });

    it('takes back a count that ROUNDS to the current one (an empty plan)', () => {
      // `2.4` rounds to 2, the grid is already 2 columns, so the plan is empty
      // and nothing is dispatched — a commit that "succeeded" without moving
      // the value. The entry must still come off the screen.
      const controller = gridController(['a', 'b', 'c', 'd']);
      drawSection(controller);
      const cols = () => screen.getByLabelText('Columns') as HTMLInputElement;
      fireEvent.blur(cols(), { target: { value: '2.4' } });
      expect(controller.applyAll).not.toHaveBeenCalled();
      expect(cols().value).toBe('2');
    });

    it('still reseeds after a TYPED shrink is cancelled at the confirm', () => {
      // The pre-existing case the partial `seed` nonce covered. It needs no
      // nonce of its own any more: the blur already reseeded the field before
      // the confirm was answered.
      const controller = gridController(['a', 'b', 'c', 'd']);
      drawSection(controller);
      fireEvent.blur(screen.getByLabelText('Columns'), { target: { value: '1' } });
      expect(screen.getByRole('dialog')).toBeTruthy();
      fireEvent.click(screen.getByText('Cancel'));
      expect(controller.applyAll).not.toHaveBeenCalled();
      expect((screen.getByLabelText('Columns') as HTMLInputElement).value).toBe('2');
    });

    it('leaves the ▲▼ clickable after a cancelled shrink', () => {
      // Keying the whole StepperField on a nonce would remount the buttons.
      // Stepping right after a cancel is what proves they are still wired.
      const controller = gridController(['a', 'b', 'c', 'd']);
      drawSection(controller);
      fireEvent.blur(screen.getByLabelText('Columns'), { target: { value: '1' } });
      fireEvent.click(screen.getByText('Cancel'));
      fireEvent.click(stepButtons('Columns').up);
      expect(controller.applyAll).toHaveBeenCalledTimes(1);
    });

    it('leaves a count input in place on a bare blur', () => {
      const controller = gridController(['a', 'b', 'c', 'd']);
      drawSection(controller);
      const before = screen.getByLabelText('Columns');
      fireEvent.blur(before, { target: { value: '2' } });
      expect(screen.getByLabelText('Columns')).toBe(before);
      expect(controller.applyAll).not.toHaveBeenCalled();
    });
  });

  it('Escape dismisses the confirm without dispatching (the Modal onClose path)', () => {
    const controller = gridController(['a', 'b', 'c', 'd']);
    drawSection(controller);
    fireEvent.click(stepButtons('Rows').down);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('a typed count commits through the same plan (blur), garbage dispatches nothing', () => {
    const controller = gridController(['a', 'b', 'c', 'd']);
    drawSection(controller);
    const columns = screen.getByLabelText('Columns');
    fireEvent.blur(columns, { target: { value: '4' } });
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    const ops = (controller.applyAll as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(ops.at(-1)).toEqual({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'columns'],
      value: 4,
    });
    fireEvent.blur(screen.getByLabelText('Rows'), { target: { value: 'garbage' } });
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
  });
});

describe('LayoutSection arrangement switch', () => {
  it('offers row, stack and grid in every arrangement', () => {
    for (const box of [{ direction: 'row' }, {}, { type: 'grid', columns: 2 }]) {
      const { unmount } = draw(
        <LayoutSection
          controller={rowController(box)}
          path={PATH}
          layout={layoutOf(rowController(box))}
        />,
      );
      for (const label of ['Side by side', 'Stacked', 'Table grid']) {
        expect(screen.getByLabelText(label)).toBeTruthy();
      }
      unmount();
    }
  });

  it('switches a row to a grid in ONE batch: a column sized per child, direction dropped', () => {
    const controller = rowController({ direction: 'row', gap: 8 }, [
      { type: 'text', box: { w: 120 } },
      { type: 'text' },
    ]);
    drawSection(controller);
    fireEvent.click(screen.getByLabelText('Table grid'));
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(batchAt(controller)).toEqual([
      { op: 'setScalar', path: PATH, keys: ['box', 'type'], value: 'grid' },
      { op: 'putValue', path: PATH, keys: ['box', 'columns'], value: [120, 'auto'] },
      { op: 'removeKey', path: PATH, keys: ['box', 'direction'] },
    ]);
  });

  it('switches to a column COUNT against an engine without fr or auto tracks', () => {
    for (const missing of ['grid.fr', 'grid.auto']) {
      const controller = rowController();
      const { unmount } = draw(
        <LayoutSection
          controller={controller}
          path={PATH}
          layout={layoutOf(controller)}
          capabilities={capsWithout(missing)}
        />,
      );
      fireEvent.click(screen.getByLabelText('Table grid'));
      expect(batchAt(controller)[1]).toEqual({
        op: 'setScalar',
        path: PATH,
        keys: ['box', 'columns'],
        value: 2,
      });
      unmount();
    }
  });

  it('switches a grid back to a row in ONE batch that drops the grid keys', () => {
    const controller = rowController({ type: 'grid', columns: 2 }, [
      { type: 'text', box: { columnSpan: 2 } },
    ]);
    drawSection(controller);
    fireEvent.click(screen.getByLabelText('Side by side'));
    expect(batchAt(controller)).toEqual([
      { op: 'removeKey', path: PATH, keys: ['box', 'type'] },
      { op: 'removeKey', path: PATH, keys: ['box', 'columns'] },
      { op: 'setScalar', path: PATH, keys: ['box', 'direction'], value: 'row' },
      { op: 'removeKey', path: `${PATH}.items[0]`, keys: ['box', 'columnSpan'] },
    ]);
  });

  it('disables the grid option, with the reason, against an engine without grids', () => {
    const without = rowController();
    drawSection(without, capsWithout('box.grid'));
    // A disabled option's tip rides its label (the Segmented primitive's
    // bubble), so the label is matched by its start.
    const grid = screen.getByLabelText(/^Table grid/) as HTMLInputElement;
    expect(grid.disabled).toBe(true);
    expect(screen.getByText("Table grid isn't available in this version.")).toBeTruthy();
    fireEvent.click(grid);
    expect(without.applyAll).not.toHaveBeenCalled();
  });

  it('enables it when the engine lists the capability', () => {
    drawSection(rowController(), capsWithout());
    expect((screen.getByLabelText('Table grid') as HTMLInputElement).disabled).toBe(false);
    expect(screen.queryByText("Table grid isn't available in this version.")).toBeNull();
  });

  it('disables a switch whose batch is refused, saying why', () => {
    const many = Array.from({ length: 300 }, () => ({ type: 'text', box: { columnSpan: 2 } }));
    const controller = rowController({ type: 'grid', columns: 2 }, many);
    drawSection(controller);
    expect((screen.getByLabelText(/^Side by side/) as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText(/^Stacked/) as HTMLInputElement).disabled).toBe(true);
    expect(
      screen.getAllByText(
        'Too many items to change the arrangement. Split them into smaller containers first.',
      ),
    ).toHaveLength(2);
  });
});

describe('LayoutSection distribution', () => {
  const distribute = () => screen.queryByLabelText('Leftover space');

  it('shows the dropdown in a row and a stack, with the effective value', () => {
    drawSection(rowController({ direction: 'row', justifyContent: 'center' }));
    expect(distribute()?.textContent).toContain('Pack to the center (left–right)');
  });

  it('names the first three choices for the main axis', () => {
    drawSection(rowController({ direction: 'column', h: 100 }));
    // Unset reads as the engine default, named vertically in a stack.
    expect(distribute()?.textContent).toContain('Pack to the top');
  });

  it('shows it in a grid only over a column-track list', () => {
    drawSection(rowController({ type: 'grid', columns: 2 }));
    expect(distribute()).toBeNull();
  });

  it('shows it over a grid track list', () => {
    drawSection(rowController({ type: 'grid', columns: ['1fr', 90] }));
    expect(distribute()?.textContent).toContain('Pack to the left');
  });

  it('authors a pick as ONE op', () => {
    const controller = rowController();
    drawSection(controller);
    fireEvent.click(distribute() as HTMLElement);
    fireEvent.click(screen.getByRole('option', { name: 'Spread out, ends at the edges' }));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'justifyContent'],
      value: 'space_between',
    });
  });

  it('authors nothing on a re-pick of the effective value', () => {
    const controller = rowController();
    drawSection(controller);
    fireEvent.click(distribute() as HTMLElement);
    fireEvent.click(screen.getByRole('option', { name: 'Pack to the left' }));
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('carries an out-of-vocabulary value verbatim as an option', () => {
    drawSection(rowController({ direction: 'row', justifyContent: 'space-between' }));
    expect(distribute()?.textContent).toContain('space-between');
    fireEvent.click(distribute() as HTMLElement);
    expect(screen.getByRole('option', { name: 'space-between' })).toBeTruthy();
  });

  it('notes that a stack with no height of its own has nothing to distribute', () => {
    const note = /Has an effect only when this container is taller/;
    drawSection(rowController({ direction: 'column' }));
    expect(screen.getByText(note)).toBeTruthy();
  });

  it('drops the note once the stack has a height, and never shows it in a row', () => {
    const note = /Has an effect only when this container is taller/;
    const { unmount } = draw(
      <LayoutSection
        controller={rowController({ direction: 'column', h: 120 })}
        path={PATH}
        layout={layoutOf(rowController({ direction: 'column', h: 120 }))}
      />,
    );
    expect(screen.queryByText(note)).toBeNull();
    unmount();
    drawSection(rowController({ direction: 'row' }));
    expect(screen.queryByText(note)).toBeNull();
  });
});

describe('LayoutSection alignment per arrangement', () => {
  const names = () =>
    within(screen.getByRole('group', { name: 'Align children' }))
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label'));

  it('offers a row the vertical set plus baseline where the engine has it', () => {
    drawSection(rowController({ direction: 'row' }), capsWithout());
    expect(names()).toEqual([
      'Align top',
      'Align middle (top–bottom)',
      'Align bottom',
      'Stretch to fill',
      'Line up the first line of text',
    ]);
  });

  it('withholds baseline from an engine that would reject it', () => {
    drawSection(rowController({ direction: 'row' }), capsWithout('box.alignItems.baseline'));
    expect(names()).not.toContain('Line up the first line of text');
  });

  it('names a stack its HORIZONTAL alignments — never top or bottom', () => {
    drawSection(rowController({ direction: 'column' }), capsWithout());
    expect(names()).toEqual([
      'Align left',
      'Align center (left–right)',
      'Align right',
      'Stretch to full width',
    ]);
  });

  it('offers a grid the vertical set without baseline (the engine reads it as start there)', () => {
    drawSection(rowController({ type: 'grid', columns: 2 }), capsWithout());
    expect(names()).toEqual([
      'Align top',
      'Align middle (top–bottom)',
      'Align bottom',
      'Stretch to fill',
    ]);
  });

  it('shows an authored baseline as active in a row and authors a stack pick', () => {
    drawSection(rowController({ direction: 'row', alignItems: 'baseline' }));
    expect(
      screen.getByLabelText('Line up the first line of text').getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('authors a stack alignment pick as the same wire value', () => {
    const controller = rowController({ direction: 'column' });
    drawSection(controller);
    fireEvent.click(screen.getByLabelText('Align right'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'alignItems'],
      value: 'end',
    });
  });
});

describe('LayoutSection split-by-ratio', () => {
  const check = () =>
    screen.queryByLabelText(
      'Ignore content width when splitting by ratio',
    ) as HTMLInputElement | null;

  it('reads unticked, ticks in ONE batch (zero bases + a weight where missing)', () => {
    const controller = rowController();
    drawSection(controller);
    expect(check()?.checked).toBe(false);
    expect(check()?.indeterminate).toBe(false);
    fireEvent.click(check() as HTMLInputElement);
    expect(controller.applyAll).toHaveBeenCalledTimes(1);
    expect(batchAt(controller)).toHaveLength(4);
  });

  it('reads ticked, and unticks by removing the zero bases', () => {
    const zero = { type: 'text', box: { flexBasis: 0, flexGrow: 1 } };
    const controller = rowController({ direction: 'row' }, [zero, zero]);
    drawSection(controller);
    expect(check()?.checked).toBe(true);
    fireEvent.click(check() as HTMLInputElement);
    expect(batchAt(controller)).toEqual([
      { op: 'removeKey', path: `${PATH}.items[0]`, keys: ['box', 'flexBasis'] },
      { op: 'removeKey', path: `${PATH}.items[1]`, keys: ['box', 'flexBasis'] },
    ]);
  });

  it('reads a mixed row as indeterminate, and ticking makes it agree', () => {
    const controller = rowController({ direction: 'row' }, [
      { type: 'text', box: { flexBasis: 0, flexGrow: 1 } },
      { type: 'text' },
    ]);
    drawSection(controller);
    expect(check()?.indeterminate).toBe(true);
    fireEvent.click(check() as HTMLInputElement);
    expect(batchAt(controller)).toEqual([
      { op: 'setScalar', path: `${PATH}.items[1]`, keys: ['box', 'flexBasis'], value: 0 },
      { op: 'setScalar', path: `${PATH}.items[1]`, keys: ['box', 'flexGrow'], value: 1 },
    ]);
  });

  it('is disabled when every child has its own width', () => {
    drawSection(rowController({ direction: 'row' }, [{ type: 'text', box: { w: 40 } }]));
    expect(check()?.disabled).toBe(true);
  });

  it('authors nothing when the batch is refused', () => {
    const many = Array.from({ length: 300 }, () => ({ type: 'text' }));
    const controller = rowController({ direction: 'row' }, many);
    drawSection(controller);
    fireEvent.click(check() as HTMLInputElement);
    expect(controller.applyAll).not.toHaveBeenCalled();
  });

  it('is a row control: absent in a stack and in a grid', () => {
    const { unmount } = draw(
      <LayoutSection
        controller={rowController({ direction: 'column' })}
        path={PATH}
        layout={layoutOf(rowController({ direction: 'column' }))}
      />,
    );
    expect(check()).toBeNull();
    unmount();
    drawSection(rowController({ type: 'grid', columns: 2 }));
    expect(check()).toBeNull();
  });

  it('is absent against an engine without flexBasis, present with it', () => {
    const { unmount } = draw(
      <LayoutSection
        controller={rowController()}
        path={PATH}
        layout={layoutOf(rowController())}
        capabilities={capsWithout('box.flexBasis')}
      />,
    );
    expect(check()).toBeNull();
    unmount();
    drawSection(rowController(), capsWithout());
    expect(check()).not.toBeNull();
  });
});

describe('ParentContainerCard', () => {
  function drawCard(onSelectParent = vi.fn(), onHighlight = vi.fn(), controller = rowController()) {
    draw(
      <ParentContainerCard
        controller={controller}
        path={PATH}
        layout={layoutOf(controller)}
        onSelectParent={onSelectParent}
        onHighlight={onHighlight}
      />,
    );
    return { onSelectParent, onHighlight };
  }

  it('names the parent by its kind and carries the layout controls', () => {
    drawCard();
    expect(screen.getByText('Parent container (side by side)')).toBeTruthy();
    expect(screen.getByLabelText('Spacing')).toBeTruthy();
    // The arrangement switch and the distribution reach a child's parent too.
    expect(screen.getByLabelText('Table grid')).toBeTruthy();
    expect(screen.getByLabelText('Leftover space')).toBeTruthy();
  });

  it('threads the capabilities into the parent controls', () => {
    const controller = rowController();
    draw(
      <ParentContainerCard
        controller={controller}
        path={PATH}
        layout={layoutOf(controller)}
        capabilities={capsWithout('box.grid')}
      />,
    );
    expect((screen.getByLabelText(/^Table grid/) as HTMLInputElement).disabled).toBe(true);
  });

  it('jumps the selection to the parent path', () => {
    const { onSelectParent } = drawCard();
    fireEvent.click(screen.getByText('Select parent'));
    expect(onSelectParent).toHaveBeenCalledWith(PATH);
  });

  it('highlights the parent on hover and clears on leave', () => {
    const { onHighlight } = drawCard();
    const card = screen.getByText('Parent container (side by side)').closest('section');
    expect(card).not.toBeNull();
    fireEvent.mouseEnter(card as HTMLElement);
    expect(onHighlight).toHaveBeenCalledWith(PATH);
    fireEvent.mouseLeave(card as HTMLElement);
    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });

  it('highlights on keyboard focus of the jump button and clears on blur', () => {
    const { onHighlight } = drawCard();
    const button = screen.getByText('Select parent');
    fireEvent.focus(button);
    expect(onHighlight).toHaveBeenCalledWith(PATH);
    fireEvent.blur(button);
    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });

  it('renders without the optional callbacks (a select-less host)', () => {
    const controller = rowController();
    draw(<ParentContainerCard controller={controller} path={PATH} layout={layoutOf(controller)} />);
    const card = screen.getByText('Parent container (side by side)').closest('section');
    fireEvent.mouseEnter(card as HTMLElement);
    fireEvent.click(screen.getByText('Select parent'));
    fireEvent.mouseLeave(card as HTMLElement);
  });
});

// The unit affordance (`stepper.unitHint`) is OPT-IN per field, because the
// WIRE decides which keys take `25mm`. Pinned AT the site: an optional prop
// whose default is the disabled value can be dropped in a refactor with no
// type error, no lint and no red test.

describe('LayoutSection unit affordance', () => {
  it('invites another unit on the gap', () => {
    drawSection(rowController({ direction: 'row', gap: 8 }));
    expect(unitHintsFor('Spacing').length).toBeGreaterThan(0);
  });
});

// The two refusing controls of the layout section, and the distinction that
// matters at both: a CLAMP is a commit (the value lands, at the bound) while a
// refusal authors nothing. Only the second snaps the field back.

describe('LayoutSection refusal snap-back', () => {
  // These run against the mock controller, so the DISPLAYED value cannot
  // distinguish a refusal from an acceptance (the fixture never moves and the
  // field reseeds to it either way). The load-bearing assertion in each case
  // is therefore `apply` — the displayed value is a companion check. The
  // contrast that actually fires lives in `CharGridSection.test.tsx`, which
  // drives the real editor.
  const gap = () => screen.getByLabelText('Spacing') as HTMLInputElement;

  for (const typed of ['abc', '50%', '2em', '999999pt']) {
    it(`snaps the gap back and authors nothing for ${JSON.stringify(typed)}`, () => {
      const controller = rowController({ direction: 'row', gap: 8 });
      drawSection(controller);
      fireEvent.change(gap(), { target: { value: typed } });
      fireEvent.blur(gap());
      expect(controller.apply).not.toHaveBeenCalled();
      expect(gap().value).toBe('8');
    });
  }

  it('CLAMPS a negative gap to 0 rather than refusing, so the field is not snapped back', () => {
    const controller = rowController({ direction: 'row', gap: 8 });
    drawSection(controller);
    fireEvent.change(gap(), { target: { value: '-4' } });
    fireEvent.blur(gap());
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'gap'],
      value: 0,
    });
  });

  it('takes the entry back when the clamp lands on the value ALREADY committed', () => {
    // The case that "did the commit land?" cannot answer. `-4` clamps to 0
    // and the gap is already 0, so the op applies, the document does not
    // move, and a landed/refused signal would leave `-4` sitting there — the
    // exact defect this change exists to remove, in the one shape where the
    // commit succeeds.
    const controller = rowController({ direction: 'row', gap: 0 });
    drawSection(controller);
    fireEvent.change(gap(), { target: { value: '-4' } });
    fireEvent.blur(gap());
    expect(gap().value).toBe('0');
  });

  it('treats an EMPTY gap as a clear, not a refusal', () => {
    // Only the dispatched op is asserted. Against this mock controller the
    // document never moves, so the field reseeds to the fixture `8` whatever
    // the commit did — an assertion on the displayed value here could not
    // fail, and would say nothing about the clear.
    const controller = rowController({ direction: 'row', gap: 8 });
    drawSection(controller);
    fireEvent.change(gap(), { target: { value: '' } });
    fireEvent.blur(gap());
    expect(controller.apply).toHaveBeenCalledExactlyOnceWith({
      op: 'removeKey',
      path: PATH,
      keys: ['box', 'gap'],
    });
  });

  it('snaps a refused ratio back, per child, without touching its sibling', () => {
    const controller = rowController({ direction: 'row' }, [
      { type: 'text', box: { flexGrow: 2 } },
      { type: 'text', box: { flexGrow: 3 } },
    ]);
    drawSection(controller);
    const first = () => screen.getByLabelText('Ratio 1') as HTMLInputElement;
    const second = () => screen.getByLabelText('Ratio 2') as HTMLInputElement;
    fireEvent.change(second(), { target: { value: '7' } });
    fireEvent.change(first(), { target: { value: 'abc' } });
    fireEvent.blur(first());
    expect(controller.apply).not.toHaveBeenCalled();
    expect(first().value).toBe('2');
    // The nonce is per-input, so the sibling keeps what is half-typed in it.
    expect(second().value).toBe('7');
  });

  it('leaves a ratio input in place on a bare blur', () => {
    const controller = rowController({ direction: 'row' }, [
      { type: 'text', box: { flexGrow: 2 } },
      { type: 'text', box: { flexGrow: 3 } },
    ]);
    drawSection(controller);
    const before = screen.getByLabelText('Ratio 1');
    fireEvent.blur(before);
    expect(screen.getByLabelText('Ratio 1')).toBe(before);
    expect(controller.apply).not.toHaveBeenCalled();
  });
});
