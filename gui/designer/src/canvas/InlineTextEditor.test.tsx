import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import type { ChipContext } from '../text/chipContext';
import { CHIP_WIRE_ATTR } from '../text/chipModel';
import { InlineTextEditor } from './InlineTextEditor';

const OPTIONS = [
  { key: 'customer.name', label: '顧客名', type: 'string', sample: '山田太郎', enumValues: [] },
  { key: 'total', label: 'Total', type: 'number', sample: '5000', enumValues: [] },
];

const CHIPS: ChipContext = {
  options: OPTIONS,
  // At document scope the two lists are the same rows, as `chipContextFor`
  // builds them.
  documentOptions: OPTIONS,
  scope: null,
  declared: new Map(),
  canDeclare: true,
  otherNames: [],
};

describe('InlineTextEditor', () => {
  it('positions the shared editor over the box rect', () => {
    const { container } = render(
      <InlineTextEditor
        rect={{ x: 20, y: 40, w: 120, h: 30 }}
        value="hi"
        onCommit={() => {}}
        onCancel={() => {}}
        ariaLabel="Edit text"
      />,
    );
    const box = container.querySelector('.sj-inline-editor') as HTMLElement;
    expect(box.style.position).toBe('absolute');
    expect(box.style.left).toBe('20px');
    expect(box.style.top).toBe('40px');
    expect(box.style.width).toBe('120px');
    expect(box.style.minHeight).toBe('30px');
    // Opens focused and ready to type.
    expect(document.activeElement).toBe(screen.getByLabelText('Edit text'));
  });

  it('commits an edit through the shared editor', () => {
    const onCommit = vi.fn();
    render(
      <InlineTextEditor
        rect={{ x: 0, y: 0, w: 10, h: 10 }}
        value="a"
        onCommit={onCommit}
        onCancel={() => {}}
        ariaLabel="Edit text"
      />,
    );
    const editor = screen.getByLabelText('Edit text');
    editor.appendChild(document.createTextNode('b'));
    fireEvent.blur(editor);
    expect(onCommit).toHaveBeenCalledWith('ab', []);
  });

  it('re-picks a chip field in place, like the panel host', () => {
    // The two hosts share ONE editor component, so a feature that works in the
    // panel field must work here — but only a test through THIS host proves
    // the overlay's own props (autoFocus, onCancel) do not get in its way.
    const onCommit = vi.fn();
    render(
      <I18nProvider locale="en">
        <InlineTextEditor
          rect={{ x: 0, y: 0, w: 10, h: 10 }}
          value="{customer.name} 様"
          onCommit={onCommit}
          onCancel={() => {}}
          ariaLabel="Edit text"
          chips={CHIPS}
        />
      </I18nProvider>,
    );
    const editor = screen.getByLabelText('Edit text');
    const chip = editor.querySelector(`[${CHIP_WIRE_ATTR}]`) as HTMLElement;
    chip.getBoundingClientRect = () => ({ left: 100, width: 40, top: 0, height: 20 }) as DOMRect;
    fireEvent.mouseDown(chip, { clientX: 135 });
    fireEvent.click(screen.getByRole('button', { name: /^Replace 顧客名/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Total/ }));
    fireEvent.blur(editor.parentElement as HTMLElement);
    expect(onCommit).toHaveBeenCalledWith('{total} 様', []);
  });

  it('closes the replace picker on Escape without cancelling the overlay edit', () => {
    // Escape inside the contenteditable abandons the whole overlay edit. With
    // a picker open, focus sits on the trigger — OUTSIDE that element — so the
    // popover's own dismissal is what must answer.
    const onCancel = vi.fn();
    render(
      <I18nProvider locale="en">
        <InlineTextEditor
          rect={{ x: 0, y: 0, w: 10, h: 10 }}
          value="{customer.name} 様"
          onCommit={() => {}}
          onCancel={onCancel}
          ariaLabel="Edit text"
          chips={CHIPS}
        />
      </I18nProvider>,
    );
    const editor = screen.getByLabelText('Edit text');
    const chip = editor.querySelector(`[${CHIP_WIRE_ATTR}]`) as HTMLElement;
    chip.getBoundingClientRect = () => ({ left: 100, width: 40, top: 0, height: 20 }) as DOMRect;
    fireEvent.mouseDown(chip, { clientX: 135 });
    fireEvent.click(screen.getByRole('button', { name: /^Replace 顧客名/ }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels on Escape without committing', () => {
    const onCommit = vi.fn();
    const onCancel = vi.fn();
    render(
      <InlineTextEditor
        rect={{ x: 0, y: 0, w: 10, h: 10 }}
        value="a"
        onCommit={onCommit}
        onCancel={onCancel}
        ariaLabel="Edit text"
      />,
    );
    fireEvent.keyDown(screen.getByLabelText('Edit text'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });
});
