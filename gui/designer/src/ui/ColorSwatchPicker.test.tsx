import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { ColorSwatchPicker, isHexColor, SWATCHES } from './ColorSwatchPicker';

/** The picker reads the catalog for its swatch names, so it mounts under a
 * provider like every other localized surface. */
function draw(props: Partial<Parameters<typeof ColorSwatchPicker>[0]> = {}) {
  const onCommit = vi.fn();
  render(
    <I18nProvider locale="en">
      <ColorSwatchPicker
        label="Fill"
        value=""
        onCommit={onCommit}
        triggerClassName="trigger"
        customLabel="Custom"
        clearLabel="Clear"
        {...props}
      />
    </I18nProvider>,
  );
  return { onCommit };
}

describe('ColorSwatchPicker', () => {
  it('renders the chip in the effective color and opens the palette', () => {
    draw({ value: '#123456' });
    const trigger = screen.getByRole('button', { name: 'Fill' });
    const chip = trigger.querySelector('.sj-color-chip') as HTMLElement;
    expect(chip.style.backgroundColor).not.toBe('');
    fireEvent.click(trigger);
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(SWATCHES.length - 1);
  });

  it('renders a neutral chip for a hostile / non-hex color (no inline paint)', () => {
    draw({ value: 'url(javascript:alert(1))' });
    const chip = screen
      .getByRole('button', { name: 'Fill' })
      .querySelector('.sj-color-chip') as HTMLElement;
    expect(chip.style.backgroundColor).toBe('');
  });

  it('announces each swatch by colour NAME, never by its raw hex', () => {
    // A swatch button carries no visible text, so its `aria-label` is its whole
    // accessible name — and `#b91c1c` is not one a screen-reader user can act
    // on. Every offered swatch must be named, not just the one clicked below.
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
    const names = screen.getAllByRole('menuitem').map((el) => el.getAttribute('aria-label'));
    for (const swatch of SWATCHES) {
      expect(names, swatch).not.toContain(swatch);
    }
    expect(names).toContain('Red');
    expect(names).toContain('Black');
  });

  it('commits a swatch and closes', () => {
    const { onCommit } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Red' }));
    expect(onCommit).toHaveBeenCalledWith('#b91c1c');
    expect(screen.queryByRole('menuitem', { name: 'Red' })).toBeNull();
  });

  it('commits a changed native color but never a phantom re-seed', () => {
    const { onCommit } = draw({ value: '#000000' });
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
    const input = screen.getByLabelText('Custom') as HTMLInputElement;
    // Blurring without a change (still the seed) writes nothing.
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    // A real change commits.
    input.value = '#ff0000';
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledWith('#ff0000');
  });

  it('clears via the clear row', () => {
    const { onCommit } = draw({ value: '#123456' });
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Clear' }));
    expect(onCommit).toHaveBeenCalledWith('');
  });

  it('shows the tooltip while closed and hides it while open', () => {
    draw({ tip: 'Fill — From style "x"' });
    const root = screen.getByRole('button', { name: 'Fill' }).parentElement as HTMLElement;
    expect(root.querySelector('.sj-tip')?.textContent).toBe('Fill — From style "x"');
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
    expect(root.querySelector('.sj-tip')).toBeNull();
  });

  it('renders no tooltip when none is given', () => {
    draw();
    const root = screen.getByRole('button', { name: 'Fill' }).parentElement as HTMLElement;
    expect(root.querySelector('.sj-tip')).toBeNull();
  });
});

describe('color data', () => {
  it('every swatch is a valid 6-digit hex color', () => {
    for (const swatch of SWATCHES) {
      expect(swatch).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('accepts a 6-digit hex and rejects everything else', () => {
    expect(isHexColor('#1a2b3c')).toBe(true);
    expect(isHexColor('#ABCDEF')).toBe(true);
    for (const bad of [
      'red',
      '#fff',
      '#1a2b3c4d',
      'url(javascript:alert(1))',
      'expression(x)',
      `#${'a'.repeat(200)}`,
      '',
    ]) {
      expect(isHexColor(bad)).toBe(false);
    }
  });
});
