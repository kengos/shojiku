// The open state of the table's panel sections through the WHOLE Designer: it
// survives a tab switch (the tab bodies unmount) and a round trip through
// another selection (the panel swaps its body), because the Designer root holds
// it — and it starts over with a fresh Designer, because nothing persists it.

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { outcomeWith } from '../testkit/fixtures';
import { draw, makeTransport } from '../testkit/harness';

const SOURCE = [
  'version: 0.1.0',
  'sections:',
  '  body:',
  '    items:',
  '      - type: table',
  '        data:',
  '          key: rows',
  '        columns:',
  '          - label: Name',
  '      - type: text',
  '        text: hello',
  '',
].join('\n');

const TABLE = 'sections.body.items[0]';
const TEXT = 'sections.body.items[1]';

function transport() {
  return makeTransport({ renderRaw: async () => outcomeWith([TABLE, TEXT]) });
}

/** The panel's border section — scoped, because the format toolbar has a
 * `Border` button of its own. */
function border(): HTMLElement {
  return within(screen.getByRole('complementary', { name: 'Properties' })).getByRole('button', {
    name: /^Border/,
  });
}

function rows(): HTMLElement {
  return screen.getByRole('button', { name: /^Rows and cells/ });
}

describe('table section open state, Designer-wide', () => {
  it('survives a tab switch and a reselection, and starts over in a fresh Designer', async () => {
    const view = draw(transport(), { source: SOURCE, params: '{"rows": []}' });
    fireEvent.click(await screen.findByRole('button', { name: TABLE }));
    expect(rows().getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(rows());

    fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
    fireEvent.click(border());
    fireEvent.click(screen.getByRole('tab', { name: 'Content' }));
    expect(rows().getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: TEXT }));
    expect(screen.queryByRole('button', { name: /^Rows and cells/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: TABLE }));
    expect(rows().getAttribute('aria-expanded')).toBe('true');
    // Headless UI registers the remounted tabs in an effect; a click before that
    // lands selects nothing, so wait for the tab to take it.
    await waitFor(() => {
      fireEvent.click(screen.getByRole('tab', { name: 'Style' }));
      expect(screen.getByRole('tab', { name: 'Style' }).getAttribute('aria-selected')).toBe('true');
    });
    expect(border().getAttribute('aria-expanded')).toBe('true');

    view.unmount();
    draw(transport(), { source: SOURCE, params: '{"rows": []}' });
    fireEvent.click(await screen.findByRole('button', { name: TABLE }));
    expect(rows().getAttribute('aria-expanded')).toBe('false');
  });
});
