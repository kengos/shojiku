import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Sep } from './Sep';

describe('Sep', () => {
  it('renders one decorative rule, hidden from assistive tech', () => {
    const { container } = render(<Sep />);
    const spans = container.querySelectorAll('span');
    expect(spans).toHaveLength(1);
    // Decorative: it carries no name and must not be announced between the
    // groups it separates.
    expect(spans[0]?.getAttribute('aria-hidden')).toBe('true');
    expect(spans[0]?.textContent).toBe('');
  });
});
