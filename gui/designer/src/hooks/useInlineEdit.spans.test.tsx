// Opening the FLOW surface, end to end through the Designer — the half the
// unit suites cannot reach, because "which editor a double-click opens" is a
// decision made from the item's own wire and answered by the canvas.
//
// It lives beside the hook rather than in `Designer.test.tsx` because the
// proposition is the hook's: `spans` wins over `text`/`data` when non-empty, so
// a spans-carrying item must open the flow surface WHATEVER its content mode
// says — and the plain field must keep opening for everything else.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { draw, makeTransport } from '../testkit/harness';

const ITEM = 'sections.body.items[0]';

function doc(body: string): string {
  return ['version: 0.1.0', 'sections:', '  body:', '    items:', body, ''].join('\n');
}

const SPANS = doc(
  [
    '      - type: text',
    '        box: { x: 0, y: 0, w: 100, h: 20 }',
    '        spans:',
    '          - text: alpha',
    '          - text: beta',
  ].join('\n'),
);

/** A spans item that ALSO carries `text:` — the engine ignores the `text:`
 * (`spans` wins), so the content mode says "text" while the truth is fragments. */
const SPANS_WITH_TEXT = doc(
  [
    '      - type: text',
    '        box: { x: 0, y: 0, w: 100, h: 20 }',
    '        text: ignored',
    '        spans:',
    '          - text: alpha',
  ].join('\n'),
);

const DEFS = [
  'version: "0.2.0"',
  'type: object',
  'properties:',
  '  order:',
  '    type: object',
  '    properties:',
  '      code:',
  '        type: string',
  '        title: Order code',
  '        example: A-1',
].join('\n');

/** A key OUTSIDE the interpolation charset, so a pick must MINT a declaration
 * rather than write a bare `{key}`. */
const DECL_DEFS = [
  'version: "0.2.0"',
  'type: object',
  'properties:',
  '  品名:',
  '    type: string',
  '    title: Product name',
  '    example: mikan',
].join('\n');

const BOTH_DEFS = [
  'version: "0.2.0"',
  'type: object',
  'properties:',
  '  order:',
  '    type: object',
  '    properties:',
  '      code:',
  '        type: string',
  '        title: Order code',
  '        example: A-1',
  '      total:',
  '        type: string',
  '        title: Order total',
  '        example: "1200"',
].join('\n');

/** Put a collapsed caret inside the fragment at `run`, at `offset`. */
function caretIn(surface: HTMLElement, run: number, offset: number): void {
  const text = surface.children[run]?.firstChild as Text;
  const range = document.createRange();
  range.setStart(text, offset);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

async function open(source: string, onChange = vi.fn()) {
  draw(makeTransport(), { source, onChange });
  await waitFor(() => screen.getByRole('button', { name: ITEM }));
  fireEvent.doubleClick(screen.getByRole('button', { name: ITEM }));
  return { onChange, surface: screen.getByLabelText('Edit text') };
}

describe('the inline editor over a spans item', () => {
  it('opens the FLOW surface, with one element per fragment', async () => {
    const { surface } = await open(SPANS);
    expect([...surface.children].map((el) => el.getAttribute('data-sj-run'))).toEqual(['0', '1']);
    // And the format bar came with it — the plain field has none.
    expect(screen.getByRole('toolbar', { name: 'Text formatting' })).toBeTruthy();
  });

  it('opens it even when the item also carries the `text:` the engine ignores', async () => {
    const { surface } = await open(SPANS_WITH_TEXT);
    expect(surface.textContent).toBe('alpha');
    expect(surface.textContent).not.toContain('ignored');
  });

  it('writes the edited fragment back to the document', async () => {
    const { onChange, surface } = await open(SPANS);
    (surface.children[1]?.firstChild as Text).data = 'EDITED';
    fireEvent.blur(surface);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('text: EDITED')),
    );
    // The neighbour it never touched is still on its own node.
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('text: alpha'));
  });

  it('carries a BOUND fragment through a commit that edits its neighbour', async () => {
    // A `data:` fragment contributes no TEXT to the surface — its binding is
    // not an interpolation — but it is still a fragment, and an edit next to it
    // must leave it exactly where it was.
    const onChange = vi.fn();
    const source = doc(
      [
        '      - type: text',
        '        box: { x: 0, y: 0, w: 100, h: 20 }',
        '        spans:',
        '          - text: alpha',
        '          - data: { key: order.code }',
      ].join('\n'),
    );
    draw(makeTransport(), { source, definitions: DEFS, onChange });
    await waitFor(() => screen.getByRole('button', { name: ITEM }));
    fireEvent.doubleClick(screen.getByRole('button', { name: ITEM }));
    const surface = screen.getByLabelText('Edit text');
    (surface.children[0]?.firstChild as Text).data = 'EDITED';
    fireEvent.blur(surface);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('text: EDITED')),
    );
    expect(onChange.mock.calls.at(-1)?.[0]).toContain('key: order.code');
  });

  it('writes NOTHING when the reader changed nothing', async () => {
    // `applyAll([])` reports ok and bumps the revision, so an empty batch would
    // put a step on the undo stack for an edit nobody made.
    const { onChange, surface } = await open(SPANS);
    fireEvent.blur(surface);
    await waitFor(() => expect(screen.queryByLabelText('Edit text')).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cancels on Escape without writing', async () => {
    const { onChange, surface } = await open(SPANS);
    (surface.children[0]?.firstChild as Text).data = 'EDITED';
    fireEvent.keyDown(surface, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('Edit text')).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('inserts a bound value as a CHIP in the fragment, never as a new `data:` fragment', async () => {
    // The user's decision: an existing `data:` fragment is read, shown and
    // preserved, but the surface mints none — a bound value is authored as the
    // `{key}` interpolation the whole editor already understands, which also
    // means it can carry the marks a fragment carries.
    const onChange = vi.fn();
    draw(makeTransport(), { source: SPANS, definitions: DEFS, onChange });
    await waitFor(() => screen.getByRole('button', { name: ITEM }));
    fireEvent.doubleClick(screen.getByRole('button', { name: ITEM }));
    const surface = screen.getByLabelText('Edit text');
    // Put the caret in the first fragment, then insert through the bar's menu.
    const text = surface.children[0]?.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 5);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    fireEvent.click(screen.getByRole('button', { name: 'Insert a data field' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Order code/ }));
    fireEvent.blur(surface);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('{order.code}')),
    );
    // …and no `data:` fragment appeared anywhere.
    const written = onChange.mock.calls.at(-1)?.[0] as string;
    expect(written).not.toContain('data:');
  });

  it('MINTS a declaration when the picked key cannot be written bare', async () => {
    // A key outside the interpolation charset cannot be spelled `{key}`, so the
    // pick stages a declaration on the ITEM's `bindings:` — and it must land in
    // the SAME batch as the text that references it, or an undo could leave a
    // chip pointing at a name the document does not carry.
    const onChange = vi.fn();
    draw(makeTransport(), { source: SPANS, definitions: DECL_DEFS, onChange });
    await waitFor(() => screen.getByRole('button', { name: ITEM }));
    fireEvent.doubleClick(screen.getByRole('button', { name: ITEM }));
    const surface = screen.getByLabelText('Edit text');
    caretIn(surface, 0, 5);
    fireEvent.click(screen.getByRole('button', { name: 'Insert a data field' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Product name/ }));
    fireEvent.blur(surface);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const written = onChange.mock.calls.at(-1)?.[0] as string;
    expect(written).toContain('bindings:');
    expect(written).toContain('品名');
  });

  it('RE-PICKS the field of a chip already in a fragment', async () => {
    const onChange = vi.fn();
    const source = doc(
      [
        '      - type: text',
        '        box: { x: 0, y: 0, w: 100, h: 20 }',
        '        spans:',
        '          - text: "Code {order.code}"',
      ].join('\n'),
    );
    draw(makeTransport(), { source, definitions: BOTH_DEFS, onChange });
    await waitFor(() => screen.getByRole('button', { name: ITEM }));
    fireEvent.doubleClick(screen.getByRole('button', { name: ITEM }));
    const surface = screen.getByLabelText('Edit text');
    const chip = surface.querySelector('[data-sj-wire]') as HTMLElement;
    expect(chip).toBeTruthy();
    fireEvent.mouseDown(chip);
    // The re-pick trigger names the field the chip currently stands for.
    fireEvent.click(screen.getByRole('button', { name: 'Replace Order code' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: /Order total/ }));
    fireEvent.blur(surface);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringContaining('{order.total}')),
    );
  });

  it('leaves exactly ONE live Bold on screen while the flow surface is open', async () => {
    // The format toolbar's Bold sets the BLOCK's style; the flow bar's sets the
    // SELECTION's. Both are correct and they mean different things, so two
    // controls answering to one name is an ambiguity a reader cannot resolve —
    // and pressing the wrong one bolds the whole item when three words were
    // selected. The block-level pair stands down while the surface is open.
    const { surface } = await open(SPANS);
    // With NOTHING selected both are dead — the flow bar's because there is no
    // selection to format, the block-level pair because the surface is open.
    // That is the trade the disable makes: while editing fragments you format
    // fragments.
    expect(
      screen
        .getAllByRole('button', { name: 'Bold' })
        .filter((b) => !(b as HTMLButtonElement).disabled),
    ).toHaveLength(0);
    caretIn(surface, 0, 0);
    const text = surface.children[0]?.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 3);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    fireEvent.mouseUp(surface);
    const bolds = screen.getAllByRole('button', { name: 'Bold' });
    expect(bolds).toHaveLength(2);
    expect(bolds.filter((b) => !(b as HTMLButtonElement).disabled)).toHaveLength(1);
    // …and the one still live is the flow bar's.
    const live = bolds.find((b) => !(b as HTMLButtonElement).disabled) as HTMLElement;
    expect(live.closest('[role="toolbar"]')?.getAttribute('aria-label')).toBe('Text formatting');
    // The SIZE control stays live: the flow bar offers none, so it is not
    // ambiguous — and a reader may well want to resize the block while editing.
    // (The TOOLBAR's; the panel's is scoped per fragment.)
    expect((screen.getByLabelText('Font size') as HTMLInputElement).disabled).toBe(false);
  });

  it('stands the block-level TEXT COLOUR down too — the flow bar offers one', async () => {
    // The rule is "a block-level control the flow bar duplicates stands down",
    // and colour is duplicated exactly as bold and italic are. It was missed on
    // the first pass because the rule was written from the two controls that
    // happened to be adjacent, and a zero-context reviewer found the third.
    //
    // Unlike the marks, this one is dead from the moment the surface opens:
    // the swatch trigger opens a picker rather than acting on the selection, so
    // it has nothing to gate on.
    await open(SPANS);
    const colours = screen.getAllByRole('button', { name: 'Text color' });
    expect(colours).toHaveLength(2);
    expect(colours.filter((b) => !(b as HTMLButtonElement).disabled)).toHaveLength(1);
    const live = colours.find((b) => !(b as HTMLButtonElement).disabled) as HTMLElement;
    expect(live.closest('[role="toolbar"]')?.getAttribute('aria-label')).toBe('Text formatting');
  });

  it('leaves the block-level Bold live for a PLAIN text item', async () => {
    await open(
      doc(
        [
          '      - type: text',
          '        box: { x: 0, y: 0, w: 100, h: 20 }',
          '        text: hi',
        ].join('\n'),
      ),
    );
    const bolds = screen.getAllByRole('button', { name: 'Bold' });
    expect(bolds).toHaveLength(1);
    expect((bolds[0] as HTMLButtonElement).disabled).toBe(false);
  });

  it('still opens the PLAIN field for an item with no spans', async () => {
    const { surface } = await open(
      doc(
        [
          '      - type: text',
          '        box: { x: 0, y: 0, w: 100, h: 20 }',
          '        text: hi',
        ].join('\n'),
      ),
    );
    expect(surface.textContent).toBe('hi');
    expect(screen.queryByRole('toolbar', { name: 'Text formatting' })).toBeNull();
  });

  it('lands a multi-fragment edit as ONE undo step', async () => {
    // The fragments and any declarations their chips staged go in ONE
    // `applyAll`. A split alone is two ops (an update and an insert); if they
    // were dispatched separately, one undo would leave the document in a state
    // the reader never saw.
    const onChange = vi.fn();
    draw(makeTransport(), { source: SPANS, onChange });
    await waitFor(() => screen.getByRole('button', { name: ITEM }));
    fireEvent.doubleClick(screen.getByRole('button', { name: ITEM }));
    const surface = screen.getByLabelText('Edit text');
    const text = surface.children[0]?.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 2);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    // The bar is DEAD until it has heard about the selection — its controls are
    // disabled with nothing selected, so a click before this does nothing. A
    // real browser fires `selectionchange`; here the surface's own pointer
    // event is the equivalent.
    fireEvent.mouseUp(surface);
    // Scoped to the FLOW bar: the format toolbar carries a Bold of its own,
    // which acts on the whole item rather than the selection. Two controls with
    // one name is a by-name query with two matches — and a live question about
    // whether the reader can tell them apart.
    fireEvent.click(
      within(screen.getByRole('toolbar', { name: 'Text formatting' })).getByRole('button', {
        name: 'Bold',
      }),
    );
    fireEvent.blur(surface);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const after = onChange.mock.calls.at(-1)?.[0] as string;
    expect(after).toContain('fontWeight: bold');
    fireEvent.keyDown(document, { key: 'z', metaKey: true });
    await waitFor(() => {
      const undone = onChange.mock.calls.at(-1)?.[0] as string;
      expect(undone).not.toContain('fontWeight');
    });
  });

  it('keeps the surface OPEN when the document refuses the batch', async () => {
    // The reader's words live only in the surface's own DOM (it is
    // uncontrolled), so unmounting it on a refusal loses them silently. A
    // 200-fragment reformat really does exceed `MAX_BATCH_OPS` — `spanOps`'s
    // own suite pins that — and this is what the reader sees when it happens.
    const spans = Array.from({ length: 200 }, (_, index) => `          - text: w${index}`).join(
      '\n',
    );
    const onChange = vi.fn();
    draw(makeTransport(), {
      source: doc(
        [
          '      - type: text',
          '        box: { x: 0, y: 0, w: 100, h: 20 }',
          '        spans:',
          spans,
        ].join('\n'),
      ),
      onChange,
    });
    await waitFor(() => screen.getByRole('button', { name: ITEM }));
    fireEvent.doubleClick(screen.getByRole('button', { name: ITEM }));
    const surface = screen.getByLabelText('Edit text');
    // Text AND a mark on every fragment: two writes each, which is what takes a
    // 200-fragment document past the 256-op cap. Text alone tops out at one op
    // per fragment and `MAX_SPANS` caps that below the limit — so the reachable
    // case is a REFORMAT, not a retype, and the fixture has to be one.
    for (const run of [...surface.children]) {
      (run.firstChild as Text).data = `${(run.firstChild as Text).data}!`;
      run.classList.add('sj-run--bold');
    }
    fireEvent.blur(surface);
    await waitFor(() => expect(screen.queryByLabelText('Edit text')).not.toBeNull());
    // Still open, still holding what they typed, and nothing was written.
    expect(screen.getByLabelText('Edit text').textContent).toContain('w0!');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens nothing for a RECT, exactly as before', async () => {
    draw(makeTransport(), {
      source: doc(['      - type: rect', '        box: { x: 0, y: 0, w: 100, h: 20 }'].join('\n')),
    });
    await waitFor(() => screen.getByRole('button', { name: ITEM }));
    fireEvent.doubleClick(screen.getByRole('button', { name: ITEM }));
    expect(screen.queryByLabelText('Edit text')).toBeNull();
  });

  it('opens nothing for a data-bound item, exactly as before', async () => {
    draw(makeTransport(), {
      source: doc(
        [
          '      - type: text',
          '        box: { x: 0, y: 0, w: 100, h: 20 }',
          '        data: { key: greeting }',
        ].join('\n'),
      ),
    });
    await waitFor(() => screen.getByRole('button', { name: ITEM }));
    fireEvent.doubleClick(screen.getByRole('button', { name: ITEM }));
    expect(screen.queryByLabelText('Edit text')).toBeNull();
  });
});
