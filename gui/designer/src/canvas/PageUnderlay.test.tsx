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
    // No `cssSize`: no inline size, so a stylesheet is free to fit the raster
    // to its column — which is what the document-settings preview does.
    expect(canvas?.style.width).toBe('');
    // Unmount fires the callback ref with null — the detach branch.
    unmount();
  });

  it('keeps the RASTER in the attributes and the CSS box in the style', () => {
    // The whole point of the split: on a 2× screen the canvas carries twice
    // the pixels it occupies, instead of being upscaled by the compositor.
    const { container } = render(
      <PageUnderlay page={page()} cssSize={{ width: 1.5, height: 1 }} />,
    );
    const canvas = container.querySelector('canvas');
    expect(canvas?.width).toBe(3);
    expect(canvas?.height).toBe(2);
    expect(canvas?.style.width).toBe('1.5px');
    expect(canvas?.style.height).toBe('1px');
  });
});
