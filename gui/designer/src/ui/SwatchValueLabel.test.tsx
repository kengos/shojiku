// The line of words beside a colour chip. Its whole reason for existing is that the
// chip alone cannot be read by someone who does not perceive the colour, so every
// case here is about what a reader gets WITHOUT looking at the square.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { I18nProvider } from '../i18n/context';
import { SwatchValueLabel } from './SwatchValueLabel';

function draw(value: string, locale = 'en') {
  render(
    <I18nProvider locale={locale}>
      <SwatchValueLabel value={value} />
    </I18nProvider>,
  );
}

describe('SwatchValueLabel', () => {
  it('names a palette colour by its hue and darkness step, and shows the hex', () => {
    // The SAME derivation the popover readout and each swatch's accessible name
    // use — one rule, three channels, so they cannot drift apart.
    draw('#b91c1c');
    expect(screen.getByText('Red, shade 4 of 5')).not.toBeNull();
    expect(screen.getByText('#b91c1c')).not.toBeNull();
  });

  it('names a NEUTRAL outright, with no step', () => {
    draw('#000000');
    expect(screen.getByText('Black')).not.toBeNull();
    expect(screen.getByText('#000000')).not.toBeNull();
  });

  it('shows a colour the palette does not carry ONCE, as its own hex', () => {
    // A hand-authored colour is legal wire and has no name but itself. Rendering
    // the name line AND the code line then repeats the same seven characters —
    // which is what the genkoyoshi ruling (`#a8674f`) looked like in the running
    // panel, and it reads as a rendering fault rather than as "no name for this
    // one". Every jsdom case passed over it; only the live pass saw it.
    draw('#123456');
    expect(screen.getAllByText('#123456')).toHaveLength(1);
  });

  it('says the field is unset rather than naming a colour that is not there', () => {
    draw('');
    expect(screen.getByText('Not set')).not.toBeNull();
  });

  it('treats a hostile document string as unset, never echoing it', () => {
    // `display()` passes any string through, so `style.borderColor` can carry this.
    // It is not a colour, it has no name, and putting it on screen would be
    // repeating an attacker's text back at the reader.
    draw('url(https://example.invalid/x.png)');
    expect(screen.getByText('Not set')).not.toBeNull();
    expect(screen.queryByText(/example\.invalid/)).toBeNull();
  });

  it('reads in the reader’s language', () => {
    draw('#b91c1c', 'ja');
    expect(screen.getByText('赤・濃さ 4/5')).not.toBeNull();
  });
});
