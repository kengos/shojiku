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

function drawSection(controller: EditorController) {
  draw(<LayoutSection controller={controller} path={PATH} layout={layoutOf(controller)} />);
}

describe('LayoutSection (flex)', () => {
  it('dispatches ONE direction op when the segment crosses', () => {
    const controller = rowController();
    drawSection(controller);
    fireEvent.click(screen.getByLabelText('Stack vertically'));
    expect(controller.apply).toHaveBeenCalledTimes(1);
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'direction'],
      value: 'column',
    });
  });

  it('dispatches ONE direction op crossing column → row too', () => {
    const controller = rowController({ direction: 'column' });
    drawSection(controller);
    fireEvent.click(screen.getByLabelText('Side by side'));
    expect(controller.apply).toHaveBeenCalledWith({
      op: 'setScalar',
      path: PATH,
      keys: ['box', 'direction'],
      value: 'row',
    });
  });

  it('dispatches nothing on a re-pick of the current direction (native radio)', () => {
    const controller = rowController();
    drawSection(controller);
    fireEvent.click(screen.getByLabelText('Side by side'));
    expect(controller.apply).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByLabelText('Align middle'));
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
    fireEvent.click(screen.getByLabelText('Align middle'));
    expect(controller.apply).not.toHaveBeenCalled();
  });

  it('commits a ratio edit as the child flexGrow, with a changed guard', () => {
    const controller = rowController({ direction: 'row' }, [
      { type: 'text' },
      { type: 'text', box: { flexGrow: 2 } },
    ]);
    drawSection(controller);
    const first = screen.getByLabelText('Ratio 1') as HTMLInputElement;
    expect(first.defaultValue).toBe('1');
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

  it('shows no ratio row in a column (grow is row-only) and no ratio for an empty row', () => {
    drawSection(rowController({ direction: 'column' }));
    expect(screen.queryByText('Ratio')).toBeNull();
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

  it('renders gap + the 列/行 steppers, no direction/align/ratio/add-slot', () => {
    const controller = gridController(['a', 'b', 'c', 'd'], 3);
    drawSection(controller);
    expect(screen.getByLabelText('Columns')).toBeTruthy();
    expect(screen.getByLabelText('Rows')).toBeTruthy();
    expect(screen.getByLabelText('Spacing')).toBeTruthy();
    expect(screen.queryByLabelText('Side by side')).toBeNull();
    expect(screen.queryByText('Align children')).toBeNull();
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
