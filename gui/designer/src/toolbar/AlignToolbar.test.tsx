import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { AlignToolbar } from './AlignToolbar';

function renderToolbar(count: number) {
  const onAlign = vi.fn();
  const onDistribute = vi.fn();
  render(
    <I18nProvider locale="en">
      <AlignToolbar count={count} onAlign={onAlign} onDistribute={onDistribute} />
    </I18nProvider>,
  );
  return { onAlign, onDistribute };
}

describe('AlignToolbar gating', () => {
  it('renders nothing below two movable items', () => {
    renderToolbar(1);
    expect(screen.queryByRole('group', { name: 'Align and distribute' })).toBeNull();
  });

  it('shows the six align actions and the count at two selected', () => {
    renderToolbar(2);
    expect(screen.getByRole('group', { name: 'Align and distribute' })).toBeTruthy();
    expect(screen.getByText('2 selected')).toBeTruthy();
    for (const name of [
      'Align left',
      'Align horizontal centers',
      'Align right',
      'Align top',
      'Align vertical centers',
      'Align bottom',
    ]) {
      expect(screen.getByRole('button', { name })).toBeTruthy();
    }
  });

  it('disables the distribute actions below three items', () => {
    renderToolbar(2);
    const h = screen.getByRole('button', { name: 'Distribute horizontally' }) as HTMLButtonElement;
    const v = screen.getByRole('button', { name: 'Distribute vertically' }) as HTMLButtonElement;
    expect(h.disabled).toBe(true);
    expect(v.disabled).toBe(true);
  });

  it('enables the distribute actions at three items', () => {
    renderToolbar(3);
    const h = screen.getByRole('button', { name: 'Distribute horizontally' }) as HTMLButtonElement;
    const v = screen.getByRole('button', { name: 'Distribute vertically' }) as HTMLButtonElement;
    expect(h.disabled).toBe(false);
    expect(v.disabled).toBe(false);
  });
});

describe('AlignToolbar actions', () => {
  it('reports the align kind on click', () => {
    const { onAlign } = renderToolbar(3);
    fireEvent.click(screen.getByRole('button', { name: 'Align right' }));
    expect(onAlign).toHaveBeenCalledWith('right');
    fireEvent.click(screen.getByRole('button', { name: 'Align vertical centers' }));
    expect(onAlign).toHaveBeenCalledWith('middle');
  });

  it('reports the distribute kind on click', () => {
    const { onDistribute } = renderToolbar(3);
    fireEvent.click(screen.getByRole('button', { name: 'Distribute horizontally' }));
    expect(onDistribute).toHaveBeenCalledWith('horizontal');
    fireEvent.click(screen.getByRole('button', { name: 'Distribute vertically' }));
    expect(onDistribute).toHaveBeenCalledWith('vertical');
  });
});
