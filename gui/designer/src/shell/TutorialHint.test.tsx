// Designer-level tests for the tutorial invite strip (shell/TopChrome.tsx).
//
// The strip is OFFERED, never imposed — so it has to stay quieter than the
// document it is inviting you to edit. It used to render the whole sentence as
// an accent-coloured underlined link; an accent-wearing AREA reads as a fill in
// peripheral vision, and at a blurred glance the invite was the most salient
// thing in the editor. These pin the shape that replaced it.
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { draw, makeTransport } from '../testkit/harness';

/** The strip: the element carrying the invite sentence. */
function strip(): HTMLElement {
  const sentence = screen.getByText('New here? Take the guided tour.');
  const parent = sentence.parentElement;
  if (parent === null) {
    throw new Error('the invite strip is not mounted');
  }
  return parent;
}

describe('the tutorial invite strip', () => {
  it('states the invite as prose, not as a control', () => {
    draw(makeTransport());
    const sentence = screen.getByText('New here? Take the guided tour.');
    // A sentence-as-link is what made the strip shout. The sentence is now
    // ordinary text; the ACTION is a button beside it.
    expect(sentence.tagName).toBe('P');
    expect(sentence.closest('button')).toBeNull();
  });

  it('opens the tutorial from a button labelled like the Help menu row', () => {
    draw(makeTransport());
    // `menu.help.tutorial` — the same opener the Help menu uses, so the HIG
    // pair with the dialog's own title (`Tutorial`) holds on both surfaces and
    // no second key is minted for one action.
    const open = screen.getByRole('button', { name: 'Tutorial…' });
    expect(strip().contains(open)).toBe(true);
    fireEvent.click(open);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('wears no accent and no filled emphasis', () => {
    draw(makeTransport());
    // The finding this strip exists to close. Asserted over the SUBTREE rather
    // than over the sentence, because the accent moving from the text to the
    // button would reproduce it exactly.
    for (const el of [strip(), ...strip().querySelectorAll('*')]) {
      // `getAttribute`, never `.className`: on an SVG element that property is
      // an `SVGAnimatedString`, and the strip's dismiss control carries icons.
      const classes = el.getAttribute('class') ?? '';
      expect(classes, el.tagName).not.toMatch(/(^|\s)(text-accent|bg-accent)(\s|$)/);
      expect(classes, el.tagName).not.toMatch(/(^|\s)underline(\s|$)/);
    }
  });

  it('still dismisses, and stays dismissed', () => {
    draw(makeTransport());
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText('New here? Take the guided tour.')).toBeNull();
  });
});
