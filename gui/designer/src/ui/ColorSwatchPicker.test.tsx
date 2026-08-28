import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { ColorSwatchPicker } from './ColorSwatchPicker';
import { isHexColor } from './chipContrast';
import { paletteSwatches } from './swatchPalette';

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

/** Stub what the placement reads: the ANCHOR's position (a rect) and the POPOVER's
 * size (offset metrics). jsdom lays nothing out, so both are zero without this —
 * which is the "everything fits" case, and no flip would ever be exercised. */
function stubLayout(anchor: Partial<DOMRect>, size: { width: number; height: number }) {
  const rect = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue({ top: 100, bottom: 128, left: 100, right: 140, ...anchor } as DOMRect);
  const w = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(size.width);
  const h = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(size.height);
  return () => {
    rect.mockRestore();
    w.mockRestore();
    h.mockRestore();
  };
}

describe('ColorSwatchPicker', () => {
  it('renders the chip in the effective color and opens the palette', () => {
    draw({ value: '#123456' });
    const trigger = screen.getByRole('button', { name: 'Fill' });
    const chip = trigger.querySelector('.sj-color-chip') as HTMLElement;
    expect(chip.style.backgroundColor).not.toBe('');
    fireEvent.click(trigger);
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(paletteSwatches().length - 1);
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
    for (const swatch of paletteSwatches()) {
      expect(names, swatch).not.toContain(swatch);
    }
    // A neutral is named outright; a hue carries its darkness step, because five
    // swatches in a column would otherwise announce the same name.
    expect(names).toContain('Black');
    expect(names).toContain('Red, shade 4 of 5');
  });

  it('commits a swatch and closes', () => {
    const { onCommit } = draw();
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Red, shade 4 of 5' }));
    expect(onCommit).toHaveBeenCalledWith('#b91c1c');
    expect(screen.queryByRole('menuitem', { name: 'Red, shade 4 of 5' })).toBeNull();
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
    for (const swatch of paletteSwatches()) {
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

describe('the chip’s contrast ring', () => {
  // The ring is a change to the SHARED picker, so it reaches the format
  // toolbar's text colour and fill, the border pen and the document defaults —
  // not only the table styling that prompted it.
  it('rings a dark colour in light so it reads on the dark chrome', () => {
    render(
      <I18nProvider locale="en">
        <ColorSwatchPicker
          label="Color"
          value="#000000"
          onCommit={vi.fn()}
          triggerClassName="t"
          customLabel="Custom"
          clearLabel="Clear"
        />
      </I18nProvider>,
    );
    const chip = screen.getByRole('button', { name: 'Color' }).querySelector('span');
    expect(chip?.style.boxShadow).toBe('inset 0 0 0 1px rgba(255, 255, 255, 0.55)');
  });

  it('rings a light colour in dark so it reads on the light chrome', () => {
    render(
      <I18nProvider locale="en">
        <ColorSwatchPicker
          label="Color"
          value="#ffffff"
          onCommit={vi.fn()}
          triggerClassName="t"
          customLabel="Custom"
          clearLabel="Clear"
        />
      </I18nProvider>,
    );
    const chip = screen.getByRole('button', { name: 'Color' }).querySelector('span');
    expect(chip?.style.boxShadow).toBe('inset 0 0 0 1px rgba(0, 0, 0, 0.45)');
  });

  it('draws no fill for a value that is not a colour, and outlines it anyway', () => {
    // It used to draw no ring either, on the reasoning that the token border
    // followed the theme. It does not: on the dark surface that border sits at
    // 1.19 contrast, so the chip was invisible in exactly the state every colour
    // field starts in. The unset treatment is luminance-independent because there
    // is no colour here to measure.
    render(
      <I18nProvider locale="en">
        <ColorSwatchPicker
          label="Color"
          value="url(javascript:alert(1))"
          onCommit={vi.fn()}
          triggerClassName="t"
          customLabel="Custom"
          clearLabel="Clear"
        />
      </I18nProvider>,
    );
    const chip = screen.getByRole('button', { name: 'Color' }).querySelector('span');
    expect(chip?.style.backgroundColor).toBe('');
    expect(chip?.style.boxShadow).toBe('inset 0 0 0 1px rgba(128, 128, 128, 0.9)');
    expect(chip?.style.backgroundImage).toContain('linear-gradient');
  });
  it('rings the PALETTE swatches too, both ends of it', () => {
    // The criterion is "every colour chip", and the palette carries #ffffff and
    // #000000 — the same two values the trigger chip needed the ring for.
    render(
      <I18nProvider locale="en">
        <ColorSwatchPicker
          label="Color"
          value=""
          onCommit={vi.fn()}
          triggerClassName="t"
          customLabel="Custom"
          clearLabel="Clear"
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Color' }));
    const white = screen.getByRole('menuitem', { name: 'White' });
    const black = screen.getByRole('menuitem', { name: 'Black' });
    expect(white.style.boxShadow).toBe('inset 0 0 0 1px rgba(0, 0, 0, 0.45)');
    expect(black.style.boxShadow).toBe('inset 0 0 0 1px rgba(255, 255, 255, 0.55)');
  });

  it('hangs the palette BELOW the trigger when it fits', () => {
    // jsdom measures every rect as zero, which is the "fits" case: nothing can
    // overflow a viewport it has no height against.
    draw();
    fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('top-[calc(100%+var(--sj-space-1))]');
    expect(menu.className).not.toContain('bottom-[calc(100%+var(--sj-space-1))]');
  });

  it('flips the palette ABOVE the trigger rather than off the bottom of the window', () => {
    // The hue × darkness grid is several times taller than the flat palette it
    // replaced, so a colour control low in the property panel opened one that ran
    // past the viewport — measured at 212px off-screen in the running app, with
    // every gate green.
    const restore = stubLayout({ top: 590, bottom: 618 }, { width: 202, height: 311 });
    try {
      draw();
      fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
      expect(screen.getByRole('menu').className).toContain('bottom-[calc(100%+var(--sj-space-1))]');
    } finally {
      restore();
    }
  });

  it('anchors the palette to the trigger’s RIGHT edge rather than off the side', () => {
    // The other half of the same regression: the grid gained a label gutter, so a
    // colour control near the property panel's right edge put it 55px off-screen.
    const restore = stubLayout({ left: 900, right: 940 }, { width: 202, height: 311 });
    try {
      draw();
      fireEvent.click(screen.getByRole('button', { name: 'Fill' }));
      const menu = screen.getByRole('menu');
      expect(menu.className).toContain('right-0');
      expect(menu.className).not.toContain('left-0');
    } finally {
      restore();
    }
  });

  it('describes its trigger when given an id, without touching the NAME', () => {
    draw({ describedBy: 'origin-hint' });
    const trigger = screen.getByRole('button', { name: 'Fill' });
    expect(trigger.getAttribute('aria-describedby')).toBe('origin-hint');
  });

  it('leaves aria-describedby off when no hint is given', () => {
    draw();
    expect(
      screen.getByRole('button', { name: 'Fill' }).getAttribute('aria-describedby'),
    ).toBeNull();
  });
});
