import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { swatchLabel } from '../testkit/swatchLabel';
import { SwatchGrid } from './SwatchGrid';
import { HUE_COLUMNS, NEUTRALS, paletteSwatches, SHADE_STEPS } from './swatchPalette';

function draw(props: Partial<Parameters<typeof SwatchGrid>[0]> = {}) {
  const onPick = vi.fn();
  render(
    <I18nProvider locale="en">
      <SwatchGrid onPick={onPick} value="" {...props} />
    </I18nProvider>,
  );
  return { onPick };
}

/** The readout is the grid's `<output>` — the one element naming what is under the
 * pointer or the keyboard. */
const readout = () => screen.getByRole('status');

describe('SwatchGrid', () => {
  it('offers every swatch in the palette', () => {
    draw();
    expect(screen.getAllByRole('menuitem').length).toBe(paletteSwatches().length);
  });

  it('commits the swatch that was clicked', () => {
    const { onPick } = draw();
    fireEvent.click(screen.getByRole('menuitem', { name: swatchLabel('#b91c1c') }));
    expect(onPick).toHaveBeenCalledWith('#b91c1c');
  });

  // The grid exists in this shape so it can be USED without telling the colours
  // apart: a column is a hue, a row is a darkness step, and the readout names
  // whatever you are on. These four cases are that promise.
  it('labels the axes, so a position can be found by reading rather than looking', () => {
    draw();
    for (const column of HUE_COLUMNS) {
      expect(screen.getByText(swatchLabel(column.shades[0]).split(',')[0])).toBeTruthy();
    }
    // One row label per darkness step.
    for (let step = 1; step <= SHADE_STEPS; step++) {
      expect(screen.getByText(`${step}/${SHADE_STEPS}`)).toBeTruthy();
    }
    // The two gutter headings. Asserted as STRINGS because catalog parity only
    // proves every locale carries the key `en` carries — it cannot see a typo on
    // this side, and `translate` renders an unknown key as the key itself, which
    // would put `color.axis.neutral` in the popover at 100% coverage.
    expect(screen.getByText('Shade')).toBeTruthy();
    expect(screen.getByText('Neutral')).toBeTruthy();
  });

  it('shows the readout’s colour chip, not only its words', () => {
    // Every other readout case reads `textContent`, which the chip has none of —
    // so the `chip · name · #hex` shape was asserted two-thirds of the way.
    draw({ value: '#1d4ed8' });
    const chip = readout().querySelector('span[style]') as HTMLElement;
    expect(chip.style.backgroundColor).toBe('rgb(29, 78, 216)');
    expect(chip.style.boxShadow).toBe('inset 0 0 0 1px rgba(255, 255, 255, 0.55)');
  });

  it('clips an absurd document value instead of stretching the popover off-screen', () => {
    // A colour outside the palette is named by itself, and a template can author
    // any string. The popover sizes to its widest child and that width decides
    // which way it flips, so an unbounded name would defeat the placement that
    // exists to keep the palette on screen.
    draw({ value: `#${'a'.repeat(4000)}` });
    const text = readout().textContent ?? '';
    expect(text.length).toBeLessThan(200);
    expect(text).toContain('…');
  });

  it('names the hovered swatch, and returns to idle when the pointer leaves it', () => {
    draw();
    const darkestRed = screen.getByRole('menuitem', { name: swatchLabel('#7f1d1d') });

    fireEvent.mouseEnter(darkestRed);
    expect(readout().textContent).toContain(swatchLabel('#7f1d1d'));
    expect(readout().textContent).toContain('#7f1d1d');

    fireEvent.mouseLeave(darkestRed);
    expect(readout().textContent).not.toContain('#7f1d1d');
  });

  it('names the FOCUSED swatch too, so the keyboard path is not the degraded one', () => {
    // A reader who cannot distinguish the colours may also not be using a mouse.
    // Hover-only narration would leave them with nothing.
    draw();
    const blue = screen.getByRole('menuitem', { name: swatchLabel('#1d4ed8') });

    fireEvent.focus(blue);
    expect(readout().textContent).toContain('#1d4ed8');

    fireEvent.blur(blue);
    expect(readout().textContent).not.toContain('#1d4ed8');
  });

  it('names the committed colour while nothing is hovered, rather than going blank', () => {
    draw({ value: '#15803d' });
    expect(readout().textContent).toContain(swatchLabel('#15803d'));
    expect(readout().textContent).toContain('#15803d');
  });

  it('falls back to the committed colour when the pointer leaves, not to idle', () => {
    draw({ value: '#15803d' });
    const white = screen.getByRole('menuitem', { name: swatchLabel('#ffffff') });
    fireEvent.mouseEnter(white);
    expect(readout().textContent).toContain('#ffffff');
    fireEvent.mouseLeave(white);
    expect(readout().textContent).toContain('#15803d');
  });

  it('says so when there is nothing to name', () => {
    draw();
    expect(readout().textContent).toContain('Point at a colour');
  });

  it('names a neutral without a darkness step', () => {
    draw();
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: swatchLabel('#000000') }));
    expect(readout().textContent).toContain('Black');
    expect(readout().textContent).not.toContain('shade');
  });

  it('gives each swatch a NAME as its accessible name, never a raw hex', () => {
    draw();
    const names = screen.getAllByRole('menuitem').map((el) => el.getAttribute('aria-label'));
    for (const hex of paletteSwatches()) {
      expect(names, hex).not.toContain(hex);
    }
    expect(names.length).toBe(NEUTRALS.length + HUE_COLUMNS.length * SHADE_STEPS);
  });
});
