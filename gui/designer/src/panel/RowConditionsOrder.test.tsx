// The rule list's ORDER: cards shown reversed (the top one wins), reordering by
// the up/down buttons and by the grip's drag (one `moveItem` each), the focus
// following a button move, the open rule following its rule through applied
// moves and undo/redo, the precedence note, and the engine's 16-rule cap.
// Driven through the real editor session, so subscribe and undo are the real
// ones.
import type { Op } from '@shojiku/designer-core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useEditor } from '../editor/useEditor';
import { I18nProvider } from '../i18n/context';
import type { PickerOption } from './pickerModel';
import { RowConditionsSection } from './RowConditions';
import { readRawEntries } from './rowConditionsModel';

const TABLE = 'sections.body.items[0]';
const LIST = `${TABLE}.row.conditionalStyles`;

const OPTIONS: readonly PickerOption[] = [
  { key: 'a', label: 'Alpha', type: 'boolean', sample: 'true', enumValues: [] },
  { key: 'b', label: 'Beta', type: 'boolean', sample: 'true', enumValues: [] },
  { key: 'c', label: 'Gamma', type: 'boolean', sample: 'true', enumValues: [] },
];

function source(keys: readonly string[]): string {
  const rules = keys.map((key) => `            - when: { key: ${key} }\n`).join('');
  return `sections:\n  body:\n    items:\n      - type: table\n        row:\n          conditionalStyles:\n${rules}`;
}

/** The section over a live editor, plus the two things a host does to it from
 * outside: undo, and an applied op (another surface, or the AI). */
function Live({ keys, external }: { keys: readonly string[]; external?: Op }) {
  const controller = useEditor(source(keys));
  return (
    <I18nProvider locale="en">
      <RowConditionsSection
        path={TABLE}
        controller={controller}
        entries={readRawEntries(controller.read, TABLE)}
        options={OPTIONS}
        host={{ fontFamilies: [], params: '', dataKey: 'rows', verticalAlign: false }}
      />
      <button type="button" onClick={() => controller.undo()}>
        test-undo
      </button>
      <button type="button" onClick={() => controller.redo()}>
        test-redo
      </button>
      {external === undefined ? null : (
        <button type="button" onClick={() => controller.apply(external)}>
          test-external
        </button>
      )}
      <output data-testid="text">{controller.text}</output>
    </I18nProvider>
  );
}

const cards = () => screen.getAllByRole('button', { name: /^When / }).map((b) => b.textContent);
const up = (display: number) => screen.getAllByRole('button', { name: 'Move rule up' })[display];
const down = (display: number) =>
  screen.getAllByRole('button', { name: 'Move rule down' })[display];
const openField = () => (screen.getByLabelText('Field to check') as HTMLInputElement).value;
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

describe('the reversed list', () => {
  it('shows the LAST entry at the top', () => {
    render(<Live keys={['a', 'b', 'c']} />);
    expect(cards()).toEqual(['When Gamma is yes', 'When Beta is yes', 'When Alpha is yes']);
  });

  it('adds a rule at the top: appended on the wire, and opened', () => {
    render(<Live keys={['a']} />);
    click('+ Add a rule');
    expect(screen.getByLabelText('Field to check')).toBeTruthy();
    click('Done');
    expect(screen.getAllByRole('button', { name: /^When / })[0].textContent).not.toBe(
      'When Alpha is yes',
    );
    expect(screen.getByTestId('text').textContent).toMatch(/key: a \}\n\s+- when:/);
  });
});

describe('the up/down buttons', () => {
  it('move one slot as ONE moveItem, up = later on the wire', () => {
    render(<Live keys={['a', 'b', 'c']} />);
    fireEvent.click(up(2));
    expect(cards()).toEqual(['When Gamma is yes', 'When Alpha is yes', 'When Beta is yes']);
    fireEvent.click(down(0));
    expect(cards()).toEqual(['When Alpha is yes', 'When Gamma is yes', 'When Beta is yes']);
    // Each was its own undo step.
    click('test-undo');
    expect(cards()).toEqual(['When Gamma is yes', 'When Alpha is yes', 'When Beta is yes']);
  });

  it('offers no grip and no move buttons while there is a single rule', () => {
    render(<Live keys={['a']} />);
    expect(screen.queryByRole('button', { name: 'Move rule up' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move rule down' })).toBeNull();
    expect(document.querySelector('[data-grip]')).toBeNull();
  });

  it('disables up on the top card and down on the bottom one, and those clicks write nothing', () => {
    render(<Live keys={['a', 'b']} />);
    expect((up(0) as HTMLButtonElement).disabled).toBe(true);
    expect((down(1) as HTMLButtonElement).disabled).toBe(true);
    expect((up(1) as HTMLButtonElement).disabled).toBe(false);
    const before = screen.getByTestId('text').textContent;
    fireEvent.click(up(0));
    fireEvent.click(down(1));
    expect(screen.getByTestId('text').textContent).toBe(before);
  });

  it('keeps the focus on the moved rule’s same button', () => {
    render(<Live keys={['a', 'b', 'c']} />);
    fireEvent.click(down(0));
    expect(document.activeElement).toBe(down(1));
  });

  it('moves the focus to the other button when the move reached an end', () => {
    render(<Live keys={['a', 'b']} />);
    fireEvent.click(up(1));
    expect(cards()[0]).toBe('When Alpha is yes');
    expect(document.activeElement).toBe(down(0));
  });
});

describe('the open rule follows its rule', () => {
  it('through an applied move from another surface', () => {
    render(
      <Live keys={['a', 'b', 'c']} external={{ op: 'moveItem', path: LIST, from: 0, to: 2 }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'When Alpha is yes' }));
    expect(openField()).toBe('a');
    click('test-external');
    expect(openField()).toBe('a');
    click('Done');
    expect(cards()[0]).toBe('When Alpha is yes');
  });

  it('through an undone and redone move', () => {
    render(<Live keys={['a', 'b']} />);
    fireEvent.click(up(1));
    fireEvent.click(screen.getByRole('button', { name: 'When Alpha is yes' }));
    click('test-undo');
    expect(openField()).toBe('a');
    click('test-redo');
    expect(openField()).toBe('a');
  });

  it('back to the list when an undo takes its rule away', () => {
    render(<Live keys={['a']} />);
    click('+ Add a rule');
    click('test-undo');
    expect(screen.queryByLabelText('Field to check')).toBeNull();
    expect(cards()).toEqual(['When Alpha is yes']);
  });
});

describe('the grip drag', () => {
  /** Stub each card's rect: 40px tall, stacked from y=0. */
  function stubRects() {
    const items = [...document.querySelectorAll('li')];
    items.forEach((li, index) => {
      li.getBoundingClientRect = () => ({ top: index * 40, height: 40 }) as DOMRect;
    });
  }
  const grip = (display: number) =>
    document.querySelectorAll('[data-grip]')[display] as HTMLElement;
  const pointer = (type: string, el: HTMLElement, init: PointerEventInit) =>
    act(() => {
      el.dispatchEvent(
        new PointerEvent(type, { bubbles: true, isPrimary: true, pointerId: 1, ...init }),
      );
    });

  it('drops the top card below the last as ONE moveItem, painting the line on the way', () => {
    render(<Live keys={['a', 'b', 'c']} />);
    stubRects();
    const capture = vi.fn();
    grip(0).setPointerCapture = capture;
    pointer('pointerdown', grip(0), { clientY: 10 });
    expect(capture).toHaveBeenCalledWith(1);
    pointer('pointermove', grip(0), { clientY: 115 });
    expect(document.querySelectorAll('[data-drop]')).toHaveLength(1);
    expect(document.querySelectorAll('li')[2].querySelector('[data-drop="after"]')).not.toBeNull();
    pointer('pointerup', grip(0), { clientY: 115 });
    expect(cards()).toEqual(['When Beta is yes', 'When Alpha is yes', 'When Gamma is yes']);
    expect(document.querySelectorAll('[data-drop]')).toHaveLength(0);
  });

  it('paints the line BEFORE the card it would land above', () => {
    render(<Live keys={['a', 'b', 'c']} />);
    stubRects();
    pointer('pointerdown', grip(2), { clientY: 90 });
    pointer('pointermove', grip(2), { clientY: 5 });
    expect(document.querySelectorAll('li')[0].querySelector('[data-drop="before"]')).not.toBeNull();
    pointer('pointerup', grip(2), { clientY: 5 });
    expect(cards()[0]).toBe('When Alpha is yes');
  });

  it('paints no line and writes nothing over the card’s own slots', () => {
    render(<Live keys={['a', 'b', 'c']} />);
    stubRects();
    const before = screen.getByTestId('text').textContent;
    pointer('pointerdown', grip(1), { clientY: 50 });
    pointer('pointermove', grip(1), { clientY: 65 });
    expect(document.querySelectorAll('[data-drop]')).toHaveLength(0);
    pointer('pointerup', grip(1), { clientY: 65 });
    expect(screen.getByTestId('text').textContent).toBe(before);
  });

  it('writes nothing for a press that never passes the threshold', () => {
    render(<Live keys={['a', 'b']} />);
    stubRects();
    const before = screen.getByTestId('text').textContent;
    pointer('pointerdown', grip(0), { clientY: 10 });
    pointer('pointermove', grip(0), { clientY: 12 });
    pointer('pointerup', grip(0), { clientY: 12 });
    expect(screen.getByTestId('text').textContent).toBe(before);
  });

  it('cancels on Escape, and on pointercancel', () => {
    render(<Live keys={['a', 'b']} />);
    stubRects();
    const before = screen.getByTestId('text').textContent;
    pointer('pointerdown', grip(0), { clientY: 10 });
    pointer('pointermove', grip(0), { clientY: 75 });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    expect(document.querySelectorAll('[data-drop]')).toHaveLength(1);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(document.querySelectorAll('[data-drop]')).toHaveLength(0);
    pointer('pointerup', grip(0), { clientY: 75 });
    pointer('pointerdown', grip(0), { clientY: 10 });
    pointer('pointermove', grip(0), { clientY: 75 });
    pointer('pointercancel', grip(0), {});
    pointer('pointerup', grip(0), { clientY: 75 });
    expect(screen.getByTestId('text').textContent).toBe(before);
  });

  it('ignores a secondary pointer, another pointer id, and a move with no press', () => {
    render(<Live keys={['a', 'b']} />);
    stubRects();
    const before = screen.getByTestId('text').textContent;
    pointer('pointermove', grip(0), { clientY: 75 });
    pointer('pointerup', grip(0), { clientY: 75 });
    pointer('pointerdown', grip(0), { clientY: 10, isPrimary: false });
    pointer('pointermove', grip(0), { clientY: 75 });
    pointer('pointerdown', grip(0), { clientY: 10 });
    pointer('pointermove', grip(0), { clientY: 75, pointerId: 2 });
    pointer('pointerup', grip(0), { clientY: 75, pointerId: 2 });
    expect(document.querySelectorAll('[data-drop]')).toHaveLength(0);
    expect(screen.getByTestId('text').textContent).toBe(before);
  });
});

describe('the precedence note and the cap', () => {
  const NOTE = /the one above wins/;
  const many = (n: number) => Array.from({ length: n }, (_, i) => (i === n - 1 ? 'c' : 'a'));

  it('shows the note only once order can matter', () => {
    const { unmount } = render(<Live keys={['a']} />);
    expect(screen.queryByText(NOTE)).toBeNull();
    unmount();
    render(<Live keys={['a', 'b']} />);
    expect(screen.getByText(NOTE)).toBeTruthy();
  });

  it('stops offering "add" at 16 rules, says why, and the click writes nothing', () => {
    render(<Live keys={many(16)} />);
    const add = screen.getByRole('button', { name: '+ Add a rule' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    expect(screen.getByText('The limit is 16 rules. Remove rules to add another.')).toBeTruthy();
    const before = screen.getByTestId('text').textContent;
    fireEvent.click(add);
    expect(screen.getByTestId('text').textContent).toBe(before);
    expect(screen.queryByText(/Not applied/)).toBeNull();
  });

  it('offers "add" below the cap, with no reason line', () => {
    render(<Live keys={many(15)} />);
    expect(
      (screen.getByRole('button', { name: '+ Add a rule' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(screen.queryByText(/The limit is/)).toBeNull();
  });

  it('marks exactly the cards the engine ignores — the top ones, past the first 16 entries', () => {
    render(<Live keys={many(17)} />);
    const marked = [...document.querySelectorAll('li')].map((li) =>
      /Not applied/.test(li.textContent ?? ''),
    );
    expect(marked).toEqual([true, ...Array.from({ length: 16 }, () => false)]);
    expect(document.querySelectorAll('li')[0].textContent).toContain('When Gamma is yes');
  });
});
