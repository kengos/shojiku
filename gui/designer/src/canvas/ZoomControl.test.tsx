import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { ZoomControl } from './ZoomControl';

function draw(zoom: number, onZoom = vi.fn(), onFit = vi.fn()) {
  render(
    <I18nProvider locale="en">
      <ZoomControl zoom={zoom} onZoom={onZoom} onFit={onFit} />
    </I18nProvider>,
  );
  return { onZoom, onFit };
}

describe('ZoomControl', () => {
  it('steps out and in from the buttons', () => {
    const { onZoom } = draw(1);
    fireEvent.click(screen.getByLabelText('Zoom out'));
    expect(onZoom).toHaveBeenCalledWith(0.75);
    fireEvent.click(screen.getByLabelText('Zoom in'));
    expect(onZoom).toHaveBeenCalledWith(1.5);
  });

  it('disables the out button at the minimum and the in button at the maximum', () => {
    draw(0.25);
    expect((screen.getByLabelText('Zoom out') as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText('Zoom in') as HTMLButtonElement).disabled).toBe(false);
    screen.getByLabelText('Zoom out'); // sanity
  });

  it('disables the in button at the maximum', () => {
    draw(4);
    expect((screen.getByLabelText('Zoom in') as HTMLButtonElement).disabled).toBe(true);
  });

  it('selecting a percentage dispatches that zoom', () => {
    const { onZoom } = draw(1);
    fireEvent.change(screen.getByLabelText('Zoom level'), { target: { value: '2' } });
    expect(onZoom).toHaveBeenCalledWith(2);
  });

  it('selecting Fit calls onFit', () => {
    const { onFit } = draw(1);
    fireEvent.change(screen.getByLabelText('Zoom level'), { target: { value: 'fit' } });
    expect(onFit).toHaveBeenCalledTimes(1);
  });

  it('shows a live percent for an off-step zoom and treats selecting it as a no-op', () => {
    const { onZoom, onFit } = draw(0.9);
    const select = screen.getByLabelText('Zoom level') as HTMLSelectElement;
    // The leading option is the current 90%, and it is selected.
    expect(select.value).toBe('current');
    expect(screen.getByRole('option', { name: '90%' })).toBeDefined();
    fireEvent.change(select, { target: { value: 'current' } });
    expect(onZoom).not.toHaveBeenCalled();
    expect(onFit).not.toHaveBeenCalled();
  });

  it('has no live-percent option when the zoom is exactly on a step', () => {
    draw(1);
    const select = screen.getByLabelText('Zoom level') as HTMLSelectElement;
    expect(select.value).toBe('1');
    // 100% is present (a step), but there is no separate "current" option.
    expect(screen.queryByRole('option', { name: /current/i })).toBeNull();
  });
});
