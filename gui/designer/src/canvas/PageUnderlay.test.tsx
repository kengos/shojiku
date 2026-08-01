import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { RawPage } from '../engine/types';
import { PageUnderlay } from './PageUnderlay';

const page = (): RawPage => ({ width: 3, height: 2, rgba: new Uint8Array(3 * 2 * 4) });

describe('PageUnderlay', () => {
  it('renders a canvas sized to the page and paints on attach + detach', () => {
    const { container, unmount } = render(<PageUnderlay page={page()} />);
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.width).toBe(3);
    expect(canvas?.height).toBe(2);
    // Unmount fires the callback ref with null — the detach branch.
    unmount();
  });
});
