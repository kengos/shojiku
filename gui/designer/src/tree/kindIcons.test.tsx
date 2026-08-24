import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { kindIcon } from './kindIcons';

/** Every kind the layer tree can list — the engine `Item` wire tags plus the
 * tree's structural kinds. Kept in step with `labels.ts`'s label keys. */
const KNOWN_KINDS = [
  'text',
  'rect',
  'line',
  'table',
  'page_number',
  'image',
  'container',
  'repeat',
  'repeat_flow',
  'qr_code',
  'list',
  'page_break',
  'char_grid',
  'ellipse',
  'checkbox',
  'column',
  'header_group',
];

describe('kindIcon', () => {
  it('gives every known kind its OWN mark', () => {
    const icons = KNOWN_KINDS.map(kindIcon);
    expect(new Set(icons).size).toBe(KNOWN_KINDS.length);
  });

  it('gives each document section its own mark', () => {
    // All three used to share one mark, which made the icon say only "a
    // section" — exactly what the label beside it already said.
    const marks = ['section:header', 'section:body', 'section:footer'].map(kindIcon);
    expect(new Set(marks).size).toBe(3);
    expect(kindIcon('section:body')).not.toBe(kindIcon('text'));
  });

  it('falls back to the generic section mark for a section it does not know', () => {
    expect(kindIcon('section:sidenote')).toBe(kindIcon('section:body'));
  });

  it('shares the generic mark between the wire generic kind and an unknown one', () => {
    expect(kindIcon('hologram')).toBe(kindIcon('item'));
    expect(kindIcon('hologram')).not.toBe(kindIcon('text'));
  });

  it('renders each mark as a decorative svg that contributes no text', () => {
    for (const kind of [...KNOWN_KINDS, 'section:body', 'hologram']) {
      const Icon = kindIcon(kind);
      const { container, unmount } = render(<Icon size={14} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.getAttribute('width')).toBe('14');
      // The row label carries the meaning; the mark must add no characters.
      expect(container.textContent).toBe('');
      unmount();
    }
  });
});
