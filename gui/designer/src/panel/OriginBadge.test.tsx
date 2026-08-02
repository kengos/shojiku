import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import type { EffectiveValue } from '../toolbar/effective';
import { OriginBadge } from './OriginBadge';

function draw(effective: EffectiveValue, onNavigate?: (section: 'defaults' | 'styles') => void) {
  return render(
    <I18nProvider locale="en">
      <OriginBadge effective={effective} onNavigate={onNavigate} />
    </I18nProvider>,
  );
}

const base: EffectiveValue = { value: '', cascade: '', own: '', origin: 'unset', styleName: '' };

describe('OriginBadge', () => {
  it('renders nothing when the field carries its own value', () => {
    const { container } = draw({ ...base, value: '24', own: '24', origin: 'own' });
    expect(container.querySelector('p')).toBeNull();
  });

  it('renders nothing when the value is unset everywhere', () => {
    const { container } = draw(base);
    expect(container.querySelector('p')).toBeNull();
  });

  it('shows the resolved value and a named-style origin, jumping to styles', () => {
    const onNavigate = vi.fn();
    draw(
      { value: '40', cascade: '40', own: '', origin: 'style', styleName: 'heading' },
      onNavigate,
    );
    expect(screen.getByText('40')).toBeTruthy();
    expect(screen.getByText('From style "heading"')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Document settings' }));
    expect(onNavigate).toHaveBeenCalledWith('styles');
  });

  it('shows an inherited origin, jumping to defaults', () => {
    const onNavigate = vi.fn();
    draw(
      { value: '12pt', cascade: '12pt', own: '', origin: 'inherited', styleName: '' },
      onNavigate,
    );
    expect(screen.getByText('Inherited from a container')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Document settings' }));
    expect(onNavigate).toHaveBeenCalledWith('defaults');
  });

  it('shows a document-defaults origin, jumping to defaults', () => {
    const onNavigate = vi.fn();
    draw(
      { value: 'serif', cascade: 'serif', own: '', origin: 'default', styleName: '' },
      onNavigate,
    );
    expect(screen.getByText('From document defaults')).toBeTruthy();
    // Authored in `defaults.style` — there IS something to visit.
    fireEvent.click(screen.getByRole('button', { name: 'Document settings' }));
    expect(onNavigate).toHaveBeenCalledWith('defaults');
  });

  it('labels the engine-default floor as 既定値 but offers no jump', () => {
    const onNavigate = vi.fn();
    draw({ value: '10', cascade: '10', own: '', origin: 'engine', styleName: '' }, onNavigate);
    expect(screen.getByText('10')).toBeTruthy();
    // The engine floor reads as the same "document default" the user knows —
    // but nothing authored it, so the jump is suppressed even with a handler.
    expect(screen.getByText('From document defaults')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Document settings' })).toBeNull();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('omits the jump control when no navigate handler is given', () => {
    draw({ value: '40', cascade: '40', own: '', origin: 'style', styleName: 'x' });
    expect(screen.queryByRole('button', { name: 'Document settings' })).toBeNull();
  });
});
