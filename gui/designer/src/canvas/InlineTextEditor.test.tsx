import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineTextEditor } from './InlineTextEditor';

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
