import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconCheck,
  IconChevronDown,
  IconClose,
  IconHelp,
  IconMinus,
  IconPlus,
  IconRedo,
  IconSearch,
  IconTrash,
  IconUndo,
} from './icons';

const ICONS = [
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconPlus,
  IconMinus,
  IconClose,
  IconChevronDown,
  IconCheck,
  IconSearch,
  IconTrash,
  IconUndo,
  IconRedo,
  IconHelp,
] as const;

describe('icons', () => {
  it('each renders a decorative currentColor SVG', () => {
    for (const Icon of ICONS) {
      const { container, unmount } = render(<Icon />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.getAttribute('stroke')).toBe('currentColor');
      expect(svg?.getAttribute('width')).toBe('16');
      expect(svg?.querySelector('path, circle')).not.toBeNull();
      unmount();
    }
  });

  it('honours a custom size and passes props through', () => {
    const { container } = render(<IconPlus size={24} className="sj-i" />);
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.getAttribute('class')).toBe('sj-i');
  });
});
