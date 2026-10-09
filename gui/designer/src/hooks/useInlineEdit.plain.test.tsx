// A PLAIN static text on the flow surface, end to end through the Designer:
// what its commits author. The no-op cases come first because they carry the
// decision — an item nobody formatted must stay a `text:` item, and an edit
// that changed nothing must author nothing — and coverage cannot see an op
// that was correctly never built.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { draw, makeTransport } from '../testkit/harness';

const ITEM = 'sections.body.items[0]';

function doc(item: readonly string[]): string {
  return ['version: 0.1.0', 'sections:', '  body:', '    items:', ...item, ''].join('\n');
}

const PLAIN = doc([
  '      - type: text',
  '        box: { x: 0, y: 0, w: 100, h: 20 }',
  '        text: hello world',
]);

async function open(
  source: string,
  onChange = vi.fn(),
  capabilities: readonly string[] | undefined = undefined,
) {
  draw(makeTransport(), { source, onChange, capabilities });
  await waitFor(() => screen.getByRole('button', { name: ITEM }));
  fireEvent.doubleClick(screen.getByRole('button', { name: ITEM }));
  return { onChange, surface: screen.getByLabelText('Edit text') };
}

/** Select `from`..`to` in the first fragment and let the bar hear about it. */
function select(surface: HTMLElement, from: number, to: number): void {
  const text = surface.children[0]?.firstChild as Text;
  const range = document.createRange();
  range.setStart(text, from);
  range.setEnd(text, to);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  fireEvent.mouseUp(surface);
}

function press(name: string): void {
  fireEvent.click(
    within(screen.getByRole('toolbar', { name: 'Text formatting' })).getByRole('button', { name }),
  );
}

const last = (onChange: ReturnType<typeof vi.fn>) => onChange.mock.calls.at(-1)?.[0] as string;

describe('the flow surface over a plain text', () => {
  it('writes NOTHING when the reader changed nothing', async () => {
    const { onChange, surface } = await open(PLAIN);
    fireEvent.blur(surface);
    await waitFor(() => expect(screen.queryByLabelText('Edit text')).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('writes NOTHING for an untouched text holding a no-break space', async () => {
    // A U+00A0 is ordinary in typeset copy; reading it as a space rewrote a
    // `text:` nobody touched.
    const { onChange, surface } = await open(
      doc([
        '      - type: text',
        '        box: { x: 0, y: 0, w: 100, h: 20 }',
        '        text: "10\u00A0kg"',
      ]),
    );
    expect(surface.textContent).toBe('10\u00A0kg');
    fireEvent.blur(surface);
    await waitFor(() => expect(screen.queryByLabelText('Edit text')).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the no-break space in the fragment a conversion writes', async () => {
    const { onChange, surface } = await open(
      doc([
        '      - type: text',
        '        box: { x: 0, y: 0, w: 100, h: 20 }',
        '        text: "10\u00A0kg"',
      ]),
    );
    select(surface, 0, 2);
    press('Bold');
    fireEvent.blur(surface);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    // Raw or escaped — whichever spelling the YAML writer picks, it is the
    // no-break space and not a plain one.
    expect(last(onChange)).toMatch(/(\u00A0|\\x[aA]0|\\u00[aA]0)kg/);
    expect(last(onChange)).not.toMatch(/10 kg/);
  });

  it('drops the caret placeholder from an EMPTY plain text the reader types into', async () => {
    const { onChange, surface } = await open(
      doc(['      - type: text', '        box: { x: 0, y: 0, w: 100, h: 20 }', '        text: ""']),
    );
    const text = surface.children[0]?.firstChild as Text;
    text.data = `${text.data}abc`;
    fireEvent.blur(surface);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    // The document's own quoting is kept; the placeholder is not in it.
    expect(last(onChange)).toContain('text: "abc"');
    expect(last(onChange)).not.toContain('\u200B');
  });

  it('keeps the surface OPEN when the conversion would exceed the fragments the engine draws', async () => {
    const { onChange, surface } = await open(PLAIN);
    surface.textContent = '';
    for (let i = 0; i < 257; i += 1) {
      const el = document.createElement('span');
      el.setAttribute('data-sj-run', '0');
      // Alternating marks, so no two neighbours are one fragment.
      el.className = i % 2 === 0 ? 'sj-run sj-run--bold' : 'sj-run';
      el.textContent = `w${i}`;
      surface.appendChild(el);
    }
    fireEvent.blur(surface);
    await waitFor(() => expect(screen.queryByLabelText('Edit text')).not.toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps an UNMARKED edit a plain `text:` item', async () => {
    const { onChange, surface } = await open(PLAIN);
    (surface.children[0]?.firstChild as Text).data = 'hello there';
    fireEvent.blur(surface);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(last(onChange)).toContain('text: hello there');
    expect(last(onChange)).not.toContain('spans');
  });

  it('cancels on Escape without writing', async () => {
    const { onChange, surface } = await open(PLAIN);
    select(surface, 0, 5);
    press('Bold');
    fireEvent.keyDown(surface, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByLabelText('Edit text')).toBeNull());
    expect(onChange).not.toHaveBeenCalled();
  });

  it('turns a bold word into `spans:` — and ONE undo makes it plain again', async () => {
    const { onChange, surface } = await open(PLAIN);
    select(surface, 6, 11);
    press('Bold');
    fireEvent.blur(surface);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const after = last(onChange);
    expect(after).toContain('spans:');
    expect(after).toContain('text: world');
    expect(after).toContain('fontWeight: bold');
    expect(after).not.toContain('text: hello world');
    fireEvent.keyDown(document, { key: 'z', metaKey: true });
    await waitFor(() => expect(last(onChange)).toContain('text: hello world'));
    expect(last(onChange)).not.toContain('spans');
  });

  it('keeps the PLAIN editor, and its plain commit, on an engine without spans', async () => {
    const { onChange, surface } = await open(PLAIN, vi.fn(), ['style.textDecoration.combined']);
    expect(screen.queryByRole('toolbar', { name: 'Text formatting' })).toBeNull();
    surface.textContent = 'hello there';
    fireEvent.blur(surface);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(last(onChange)).toContain('text: hello there');
  });

  it('keeps the plain editor for a VERTICAL block on an engine that cannot draw vertical spans', async () => {
    await open(
      doc([
        '      - type: text',
        '        box: { x: 0, y: 0, w: 100, h: 100 }',
        '        text: 縦',
        '        style: { writingMode: vertical_rl }',
      ]),
      vi.fn(),
      ['text.spans'],
    );
    expect(screen.queryByRole('toolbar', { name: 'Text formatting' })).toBeNull();
  });

  it('offers tate-chu-yoko over a vertical block, and writes it on the fragment', async () => {
    const { onChange, surface } = await open(
      doc([
        '      - type: text',
        '        box: { x: 0, y: 0, w: 100, h: 100 }',
        '        text: 令和12年',
        '        style: { writingMode: vertical_rl }',
      ]),
    );
    select(surface, 2, 4);
    press('Horizontal in vertical (selected text)');
    fireEvent.blur(surface);
    await waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(last(onChange)).toContain('textCombineUpright: all');
  });

  it('does not offer tate-chu-yoko over a horizontal block', async () => {
    await open(PLAIN);
    expect(
      screen.queryByRole('button', { name: 'Horizontal in vertical (selected text)' }),
    ).toBeNull();
  });

  it('tells the reader, before the first mark, what converting changes', async () => {
    await open(
      doc([
        '      - type: text',
        '        box: { x: 0, y: 0, w: 100, h: 20 }',
        '        text: hi',
        '        style: { textOverflow: shrink }',
      ]),
    );
    expect(screen.getByText('If you format any words here:')).toBeTruthy();
    expect(screen.getByText(/Shrink-to-fit stops working/)).toBeTruthy();
    // One value, one line: the item has no ellipsis to lose.
    expect(screen.queryByText(/ends in/)).toBeNull();
  });

  it('says nothing of the kind over an item that already holds spans', async () => {
    await open(
      doc([
        '      - type: text',
        '        box: { x: 0, y: 0, w: 100, h: 20 }',
        '        style: { textOverflow: shrink }',
        '        spans:',
        '          - text: hi',
      ]),
    );
    expect(screen.queryByText('If you format any words here:')).toBeNull();
  });
});
